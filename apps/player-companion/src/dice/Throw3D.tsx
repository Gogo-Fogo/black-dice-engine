import React, { useEffect, useRef, useState } from "react";
import { DiceAnimationProps, deviceProfile, supportsWebGL2 } from "./common";
import { Tumble } from "./Tumble";
import type { ThrowHandle } from "./throw3d-engine";

// React wrapper for the 3D throw. three.js and the engine load on first use.

const supported = [4, 6, 8, 10, 12, 20];

export function Throw3D(props: DiceAnimationProps & { onInfo?: (info: { source: "glb" | "generated"; calibrated: boolean }) => void }) {
  const { faces, thrown, onSettled, onInfo } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<ThrowHandle | null>(null);
  const thrownRef = useRef(thrown);
  thrownRef.current = thrown;
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  const [failed, setFailed] = useState(!supportsWebGL2() || !supported.includes(faces.sides));

  useEffect(() => {
    if (failed) return;
    let cancelled = false;
    const controller=new AbortController();
    import("./throw3d-engine")
      .then(({ createThrowScene }) =>
        { if (cancelled || !hostRef.current) return null; return createThrowScene(hostRef.current, {
          signal:controller.signal,
          sides: faces.sides,
          values: faces.values,
          lowEnd: deviceProfile().lowEnd,
          onSettled: () => settledRef.current()
        }); }
      )
      .then((handle) => {
        if (!handle) return;
        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        onInfo?.(handle.info());
        if (thrownRef.current) handle.throwDice();
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;controller.abort();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [failed, faces.sides, faces.values.join(",")]);

  useEffect(() => {
    if (thrown) handleRef.current?.throwDice();
  }, [thrown]);

  // No WebGL2, a d100, or the renderer failed: the 2D tumble still gives a good roll.
  if (failed) return <Tumble {...props} />;
  return <div className="classic3d" ref={hostRef} aria-hidden="true" />;
}
