import React, { useEffect, useState } from "react";
import { DiceAnimationProps } from "./common";
import { DieIcon } from "./Burst";

// A rune card rises, spins on its vertical axis and lands face up on the number.
// Pure CSS 3D (rotateY + backface-visibility), prefixed for older WebKit.

const FLIP_MS = 1300;
const STAGGER_MS = 180;

export function Card({ faces, thrown, onSettled, compact }: DiceAnimationProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!thrown) return;
    const start = requestAnimationFrame(() => requestAnimationFrame(() => setFlipped(true)));
    const done = window.setTimeout(onSettled, FLIP_MS + (faces.values.length - 1) * STAGGER_MS + 150);
    return () => {
      cancelAnimationFrame(start);
      window.clearTimeout(done);
    };
  }, [thrown]);

  return (
    <div className={`card-row ${compact ? "compact" : ""} ${faces.values.length > 2 ? "many" : ""}`} aria-hidden="true">
      {faces.values.map((value, i) => (
        <div key={i} className={`fate-card-wrap ${thrown ? "" : "idle"}`}>
          <div
            className={`fate-card ${flipped ? "flipped" : ""}`}
            style={{
              WebkitTransitionDelay: `${i * STAGGER_MS}ms`,
              transitionDelay: `${i * STAGGER_MS}ms`
            }}
          >
            <div className="fate-face fate-back">
              <span className="fate-sigil">
                <DieIcon sides={faces.sides} />
              </span>
            </div>
            <div className="fate-face fate-front">
              <span className="fate-corner">d{faces.sides}</span>
              <span className="fate-value">{value}</span>
              <span className="fate-corner bottom">d{faces.sides}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
