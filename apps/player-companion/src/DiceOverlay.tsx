import { useCallback, useEffect, useRef, useState } from "react";
import { DiceHandle, renderDiceOverlay } from "./dice3d";
import { playDiceRollSound } from "./diceSound";
import { formatMod, haptic, naturalRolls } from "./lib";
import type { RollRecord } from "./types";

type Props = {
  roll: RollRecord;
  dc: number | null;
  soundOn: boolean;
  onClose: () => void;
};

// iOS gates motion events behind a permission prompt that must come from a tap.
let motionGranted = false;
const motionApi = () =>
  typeof DeviceMotionEvent === "undefined" ? null : (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> });
const motionNeedsPermission = () => typeof motionApi()?.requestPermission === "function";

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function DiceOverlay({ roll, dc, soundOn, onClose }: Props) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiceHandle | null>(null);
  const thrownRef = useRef(false);
  const [thrown, setThrown] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const reveal = useCallback(() => {
    setShowResult(true);
    const natural = naturalRolls(roll.rolled);
    const isD20 = /d20/.test(roll.dice) && natural.length === 1;
    haptic(isD20 && (natural[0] === 20 || natural[0] === 1) ? [30, 40, 30, 40, 60] : 25);
  }, [roll]);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el || prefersReducedMotion()) {
      thrownRef.current = true;
      setThrown(true);
      reveal();
      return;
    }
    try {
      handleRef.current = renderDiceOverlay(el, roll.dice, reveal);
    } catch {
      thrownRef.current = true;
      setThrown(true);
      reveal();
    }
    return () => {
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  const doThrow = useCallback(() => {
    if (thrownRef.current) return;
    thrownRef.current = true;
    setThrown(true);
    haptic(15);
    if (soundOn) playDiceRollSound();
    handleRef.current?.throwDice();
  }, [soundOn]);

  // Shake to throw (permission is requested on the first tap on iOS)
  useEffect(() => {
    if (thrown) return;
    let lastShake = 0;
    const onMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      if (magnitude > 25 && performance.now() - lastShake > 800) {
        lastShake = performance.now();
        doThrow();
      }
    };
    if (motionApi() && (!motionNeedsPermission() || motionGranted)) {
      window.addEventListener("devicemotion", onMotion);
    }
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [thrown, doThrow]);

  // Auto-dismiss a few seconds after the result is shown
  useEffect(() => {
    if (!showResult) return;
    const timer = window.setTimeout(onClose, 8000);
    return () => window.clearTimeout(timer);
  }, [showResult, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.key === "Enter" || event.key === " ") && !thrownRef.current) doThrow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, doThrow]);

  function handleTap() {
    if (showResult) {
      onClose();
      return;
    }
    if (thrownRef.current) return;
    if (motionNeedsPermission() && !motionGranted) {
      motionApi()!
        .requestPermission!()
        .then((state) => {
          motionGranted = state === "granted";
        })
        .catch(() => {});
    }
    doThrow();
  }

  const natural = naturalRolls(roll.rolled);
  const isD20 = /d20/.test(roll.dice) && natural.length === 1;
  const crit = isD20 && natural[0] === 20;
  const fumble = isD20 && natural[0] === 1;
  const outcome = dc === null ? null : roll.total >= dc ? "success" : "fail";
  const naturalSum = natural.reduce((sum, value) => sum + value, 0);

  return (
    <div
      className="dice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${roll.note} roll`}
      onClick={handleTap}
    >
      <div className="dice-overlay-bg" />
      <div className="dice-3d-container" ref={sceneRef} aria-hidden="true" />

      <div className="dice-overlay-top">
        <span className="dice-overlay-label">{roll.note}</span>
        {roll.note !== roll.dice ? <span className="dice-overlay-dice">{roll.dice}</span> : null}
      </div>

      {!thrown && !showResult ? (
        <div className="dice-throw-hint">
          <span className="dice-throw-ring" aria-hidden="true" />
          <strong>Tap to throw</strong>
          <span>or give your phone a shake</span>
        </div>
      ) : null}

      <div className="dice-result" aria-live="assertive">
        {showResult ? (
          <>
            {crit ? <p className="dice-callout crit">Natural 20</p> : null}
            {fumble ? <p className="dice-callout fumble">Natural 1</p> : null}
            <div className={`dice-result-number ${crit ? "crit" : ""} ${fumble ? "fumble" : ""}`}>{roll.total}</div>
            {natural.length > 1 || roll.modifier !== 0 || roll.advantage !== null ? (
            <p className="dice-breakdown">
              {natural.length > 1 ? `[${natural.join(", ")}]` : naturalSum}
              {roll.modifier !== 0 ? ` ${formatMod(roll.modifier).replace(/^([+−])/, "$1 ")}` : ""}
              {roll.advantage !== null ? (roll.advantage ? " · advantage" : " · disadvantage") : ""}
            </p>
            ) : null}
            {outcome ? (
              <p className={`dice-outcome ${outcome}`}>
                {outcome === "success" ? "Meets" : "Misses"} DC {dc}
              </p>
            ) : null}
            <p className="dice-dismiss">Tap anywhere to close</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
