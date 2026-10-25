import React, { useEffect, useMemo, useState } from "react";
import { DiceAnimationProps, randomFace } from "./common";

// Slot-machine reels: a column of numbers spins down and locks on the result.
// Only CSS transform transitions, so it is about the cheapest animation possible.

const STRIP = 26;
const SPIN_MS = 1500;
const STAGGER_MS = 260;

export function Reel({ faces, thrown, onSettled, compact }: DiceAnimationProps) {
  const strips = useMemo(
    () =>
      faces.values.map((final) => {
        const list = Array.from({ length: STRIP - 1 }, () => randomFace(faces.sides));
        list.push(final);
        return list;
      }),
    [faces.sides, faces.values.join(",")]
  );
  const [spinning, setSpinning] = useState(false);
  const [locked, setLocked] = useState<boolean[]>(() => faces.values.map(() => false));

  useEffect(() => {
    if (!thrown) return;
    // next frame so the browser has painted the start position before transitioning
    const start = requestAnimationFrame(() => requestAnimationFrame(() => setSpinning(true)));
    const timers = faces.values.map((_, i) =>
      window.setTimeout(() => setLocked((l) => l.map((v, j) => (j === i ? true : v))), SPIN_MS + i * STAGGER_MS)
    );
    const done = window.setTimeout(onSettled, SPIN_MS + (faces.values.length - 1) * STAGGER_MS + 250);
    return () => {
      cancelAnimationFrame(start);
      timers.forEach(window.clearTimeout);
      window.clearTimeout(done);
    };
  }, [thrown]);

  return (
    <div className={`reel-row ${compact ? "compact" : ""} ${faces.values.length > 2 ? "many" : ""}`} aria-hidden="true">
      {strips.map((strip, i) => (
        <div key={i} className={`reel-window ${locked[i] ? "locked" : ""} ${thrown ? "" : "idle"}`}>
          <div
            className="reel-strip"
            style={{
              WebkitTransform: `translate3d(0, ${spinning ? -(STRIP - 1) * 100 / STRIP : 0}%, 0)`,
              transform: `translate3d(0, ${spinning ? -(STRIP - 1) * 100 / STRIP : 0}%, 0)`,
              WebkitTransition: spinning ? `-webkit-transform ${SPIN_MS + i * STAGGER_MS}ms cubic-bezier(0.12, 0.75, 0.18, 1)` : "none",
              transition: spinning ? `transform ${SPIN_MS + i * STAGGER_MS}ms cubic-bezier(0.12, 0.75, 0.18, 1)` : "none"
            }}
          >
            {strip.map((value, j) => (
              <span key={j} className="reel-cell">
                {thrown || j > 0 ? value : "?"}
              </span>
            ))}
          </div>
          <span className="reel-glint" />
        </div>
      ))}
    </div>
  );
}
