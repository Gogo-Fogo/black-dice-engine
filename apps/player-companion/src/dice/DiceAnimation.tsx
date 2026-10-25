import React, { useEffect, useRef } from "react";
import { Burst } from "./Burst";
import { Card } from "./Card";
import { Classic3D } from "./Classic3D";
import { DiceAnimationProps, DiceStyleId, prefersReducedMotion } from "./common";
import { Reel } from "./Reel";
import { Throw3D } from "./Throw3D";
import { Tumble } from "./Tumble";

/** Renders one dice style. Calls onSettled exactly once, after the dice land. */
export function DiceAnimation({ styleId, ...props }: DiceAnimationProps & { styleId: DiceStyleId }) {
  const firedRef = useRef(false);
  const settle = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    props.onSettled();
  };

  const reduced = prefersReducedMotion();
  useEffect(() => {
    if (reduced && props.thrown) settle();
  }, [reduced, props.thrown]);
  // Safety net: never leave a roll hanging if an animation stalls on a slow phone.
  useEffect(() => {
    if (!props.thrown) return;
    const timer = window.setTimeout(settle, 6000);
    return () => window.clearTimeout(timer);
  }, [props.thrown]);

  if (reduced) return null;
  const common = { ...props, onSettled: settle };
  switch (styleId) {
    case "throw3d":
      return <Throw3D {...common} />;
    case "classic3d":
      return <Classic3D {...common} />;
    case "reel":
      return <Reel {...common} />;
    case "burst":
      return <Burst {...common} />;
    case "card":
      return <Card {...common} />;
    default:
      return <Tumble {...common} />;
  }
}
