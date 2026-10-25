import { useEffect, useRef, useState } from "react";
import type { DiceHandle } from "../dice3d";
import { DiceAnimationProps, supportsWebGL2 } from "./common";

// The existing three.js dice. three.js (~800 KB) is only downloaded when this style is
// actually shown, so phones using the light styles never pay for it.

export function Classic3D({ faces, thrown, onSettled }: DiceAnimationProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiceHandle | null>(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const [problem, setProblem] = useState<string | null>(supportsWebGL2() ? null : "This browser has no WebGL2, so the 3D dice can't run here.");

  useEffect(() => {
    if (!supportsWebGL2()) {
      settledRef.current();
      return;
    }
    let cancelled = false;
    import("../dice3d")
      .then(({ renderDiceOverlay }) => {
        if (cancelled || !hostRef.current) return;
        try {
          handleRef.current = renderDiceOverlay(
            hostRef.current,
            `${faces.values.length}d${faces.sides}`,
            () => settledRef.current(),
            () => setProblem("3D dice models (.glb) weren't found on this server.")
          );
          if (thrown) handleRef.current.throwDice();
        } catch {
          setProblem("The 3D renderer failed to start on this device.");
          settledRef.current();
        }
      })
      .catch(() => {
        setProblem("Couldn't load the 3D engine.");
        settledRef.current();
      });
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [faces.sides, faces.values.length]);

  useEffect(() => {
    if (thrown) handleRef.current?.throwDice();
  }, [thrown]);

  return (
    <div className="classic3d" ref={hostRef} aria-hidden="true">
      {problem ? <p className="dice-anim-note">{problem}</p> : null}
    </div>
  );
}
