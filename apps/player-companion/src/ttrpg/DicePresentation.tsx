import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RollRecord } from "../../../../packages/contracts/dist/index.js";
import { DiceAnimation } from "../dice/DiceAnimation";
import { parseDice, resolveStyle, readStylePref } from "../dice/common";
import { playDiceRollSound } from "../../../dice-audio.mts";

/** Cosmetic only: the saved server total is readable even without WebGL/audio/motion. */
export default function DicePresentation({ roll, onClose }: { roll: RollRecord; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const thrown = useRef(false);
  const [show, setShow] = useState(false);
  const [style] = useState(() => resolveStyle(readStylePref()));
  const active = useRef(false);
  const [motion, setMotion] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const close = dialog.current?.querySelector<HTMLButtonElement>("button:last-child");
    close?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; stopAudio.current?.(); };
  }, [roll.id]);
  const throwDice = useCallback(() => {
    if (thrown.current) return;
    thrown.current = true;
    setShow(true);
    try { stopAudio.current = playDiceRollSound(); } catch { /* Saved result does not depend on audio. */ }
    setMessage("Showing your saved roll.");
  }, []);
  useEffect(() => {
    if (!motion) return;
    const shake = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (acceleration && Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0) > 25) throwDice();
    };
    window.addEventListener("devicemotion", shake);
    return () => window.removeEventListener("devicemotion", shake);
  }, [motion, throwDice]);
  const enableMotion = async () => {
    const motionApi = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> };
    try {
      if (!motionApi) { setMessage("Shake is unavailable. Use Show dice animation."); return; }
      const permission = motionApi.requestPermission ? await motionApi.requestPermission() : "granted";
      if (active.current) { setMotion(permission === "granted"); setMessage(permission === "granted" ? "Shake to show dice." : "Shake permission declined. Use Show dice animation."); }
    } catch { if (active.current) setMessage("Shake is unavailable. Use Show dice animation."); }
  };
  return <div ref={dialog} className="dice-overlay" role="dialog" aria-modal="true" aria-label="Saved roll result" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      if (buttons.length) { event.preventDefault(); buttons[next].focus(); }
    }
  }}>
    <div className="dice-overlay-bg" /><div className="dice-roll-card">
      <div className="dice-3d-container" aria-hidden="true"><DiceAnimation styleId={style} faces={parseDice(roll.dice, roll.rolled)} thrown={show} onSettled={() => setMessage("Showing your saved roll.")} /></div>
      <div className="saved-roll-controls"><p>{roll.actorName}: {roll.note} — {roll.dice}</p><p className="dice-result-number">{roll.total}</p>
        {roll.action && roll.action.dc !== null && <p className={`dice-result-outcome ${roll.action.success ? "success" : "failure"}`}>{roll.action.success ? "Success" : "Miss"} — DC {roll.action.dc}</p>}
        <button type="button" onClick={throwDice}>Show dice animation</button>
        <button type="button" onClick={() => void enableMotion()}>Enable shake</button>
        <p role="status">{message}</p><button type="button" onClick={onClose}>Close result</button>
      </div>
    </div>
  </div>;
}
