import React, { useCallback, useEffect, useRef, useState } from "react";
import type { RollRecord } from "../../../../packages/contracts/dist/index.js";
import { type DiceHandle, renderDiceOverlay } from "../../../dice-presentation.mts";
import { playDiceRollSound } from "../../../dice-audio.mts";

export function DiceOverlay({ roll, onClose }: { roll: RollRecord; onClose: () => void }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiceHandle | null>(null);
  const stopAudio = useRef<(() => void) | null>(null);
  const thrownRef = useRef(false);
  const [showResult, setShowResult] = useState(true);
  const [canThrow, setCanThrow] = useState(false);
  const [thrown, setThrown] = useState(false);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    try {
      handleRef.current = renderDiceOverlay(el, roll.dice, () => setShowResult(true));
    } catch {
      setShowResult(true);
    }
    const timer = setTimeout(() => setCanThrow(true), 1200);
    return () => {
      clearTimeout(timer);
      handleRef.current?.dispose();
      handleRef.current = null;
      stopAudio.current?.();
    };
  }, []);

  useEffect(() => {
    if (!showResult) return;
    const timer = setTimeout(onClose, 7000);
    return () => clearTimeout(timer);
  }, [showResult]);

  const doThrow = useCallback(() => {
    if (thrownRef.current) return;
    thrownRef.current = true;
    setThrown(true);
    try { stopAudio.current = playDiceRollSound(); } catch { /* Saved total remains readable. */ }
    handleRef.current?.throwDice();
  }, [thrown]);

  return (
    <div className="dice-overlay">
      <div className="dice-overlay-bg" />
      <div className="dice-roll-card">
        <div className="dice-3d-container" ref={sceneRef} />
        {canThrow && !thrown ? (
          <button className="dice-throw-btn" onClick={(e) => { e.stopPropagation(); doThrow(); }}>
            CLICK TO THROW
          </button>
        ) : null}
        {showResult ? (
          <div className="dice-result-wrap" onClick={onClose}>
            <div className="dice-result-number">{roll.total}</div>
            <p className="dice-roll-who">{roll.actorName}</p>
            <p className="dice-roll-what">{roll.dice} — {roll.note}</p>
            <p className="dice-roll-tap">click to close</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
