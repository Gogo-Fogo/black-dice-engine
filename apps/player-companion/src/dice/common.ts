// Shared pieces for the dice animations. Everything except "classic3d" uses plain
// canvas 2D or CSS transforms so it runs on old and low-end phones (no WebGL needed).

export type DiceStyleId = "throw3d" | "classic3d" | "tumble" | "reel" | "burst" | "card";
export type DiceStylePref = DiceStyleId | "auto";

export const diceStyles: Array<{ id: DiceStyleId; name: string; blurb: string; weight: "light" | "medium" | "heavy" }> = [
  { id: "throw3d", name: "3D Throw", blurb: "A real 3D die is thrown, bounces and lands on the number (needs WebGL2)", weight: "heavy" },
  { id: "tumble", name: "Tumble", blurb: "Dice bounce across the table and settle", weight: "light" },
  { id: "reel", name: "Reel", blurb: "Numbers spin like a slot reel and lock in", weight: "light" },
  { id: "burst", name: "Burst", blurb: "The die shakes, cracks and bursts into sparks", weight: "light" },
  { id: "card", name: "Fate card", blurb: "A rune card flips to reveal the number", weight: "light" },
  { id: "classic3d", name: "Classic 3D", blurb: "The current 3D model spin (needs WebGL2)", weight: "heavy" }
];

export type DiceFaces = { sides: number; values: number[] };

export type DiceAnimationProps = {
  faces: DiceFaces;
  /** Flip to true to throw; before that the dice idle and wait. */
  thrown: boolean;
  onSettled: () => void;
  compact?: boolean;
};

export function parseDice(notation: string, rolled: number | number[]): DiceFaces {
  const match = notation.trim().toLowerCase().match(/^(\d*)d(\d+)/);
  const sides = match ? Number(match[2]) : 20;
  const values = Array.isArray(rolled) ? rolled : [rolled];
  return { sides, values: values.slice(0, 6) };
}

export function randomFace(sides: number) {
  return 1 + Math.floor(Math.random() * sides);
}

// --- Device capability ---------------------------------------------------------------

let webgl2Cache: boolean | null = null;

export function supportsWebGL2() {
  if (webgl2Cache !== null) return webgl2Cache;
  try {
    const canvas = document.createElement("canvas");
    webgl2Cache = !!canvas.getContext("webgl2");
  } catch {
    webgl2Cache = false;
  }
  return webgl2Cache;
}

export function deviceProfile() {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  const saveData = !!nav.connection?.saveData;
  const lowEnd = (memory !== null && memory <= 2) || (cores !== null && cores <= 4) || saveData;
  return { webgl2: supportsWebGL2(), memory, cores, saveData, lowEnd };
}

/** What "Auto" picks: the 3D dice only where they will run smoothly, otherwise Tumble. */
export function autoStyle(): DiceStyleId {
  const profile = deviceProfile();
  return profile.webgl2 && !profile.lowEnd ? "classic3d" : "tumble";
}

export function resolveStyle(pref: DiceStylePref): DiceStyleId {
  if (pref === "auto") return autoStyle();
  if ((pref === "classic3d" || pref === "throw3d") && !supportsWebGL2()) return "tumble";
  return pref;
}

const prefKey = "bde-dice-style";

export function readStylePref(): DiceStylePref {
  try {
    const saved = window.localStorage.getItem(prefKey);
    if (saved === "auto" || diceStyles.some((s) => s.id === saved)) return saved as DiceStylePref;
  } catch {
    // ignore
  }
  return "auto";
}

export function writeStylePref(pref: DiceStylePref) {
  try {
    window.localStorage.setItem(prefKey, pref);
  } catch {
    // ignore
  }
}

export function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// --- Die silhouettes (shared by canvas and SVG styles) -------------------------------

/** Unit polygon points (radius 1, centred) for a die's outline, flat-ish like a tabletop icon. */
export function dieOutline(sides: number): Array<[number, number]> {
  const poly = (n: number, rotation: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = rotation + (i * Math.PI * 2) / n;
      return [Math.cos(a), Math.sin(a)] as [number, number];
    });
  switch (sides) {
    case 4:
      return poly(3, -Math.PI / 2).map(([x, y]) => [x * 1.08, y * 1.08 + 0.12]);
    case 6:
      return poly(4, -Math.PI / 4).map(([x, y]) => [x * 1.06, y * 1.06]);
    case 8:
      return poly(4, -Math.PI / 2).map(([x, y]) => [x * 0.9, y * 1.08]);
    case 10:
    case 100:
      return [
        [0, -1.05],
        [0.95, -0.15],
        [0.62, 0.72],
        [0, 1.0],
        [-0.62, 0.72],
        [-0.95, -0.15]
      ];
    case 12:
      return poly(5, -Math.PI / 2);
    default:
      return poly(6, -Math.PI / 2);
  }
}

/** Inner facet lines from the outline toward a central face, for a little depth. */
export function dieFacets(sides: number): Array<[[number, number], [number, number]]> {
  const outline = dieOutline(sides);
  if (sides === 6) return [];
  const inner = outline.map(([x, y]) => [x * 0.48, y * 0.48 + (sides === 4 ? 0.1 : 0)] as [number, number]);
  return outline.map((p, i) => [p, inner[i]]);
}

export function svgPoints(points: Array<[number, number]>, scale = 50, offset = 50) {
  return points.map(([x, y]) => `${(offset + x * scale).toFixed(2)},${(offset + y * scale).toFixed(2)}`).join(" ");
}

export function displayValue(sides: number, value: number) {
  return sides === 100 ? String(value) : String(value);
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
