import React, { useEffect, useMemo, useRef, useState } from "react";
import { Calibrate3D } from "./dice/Calibrate3D";
import { DiceAnimation } from "./dice/DiceAnimation";
import {
  DiceFaces,
  DiceStyleId,
  DiceStylePref,
  autoStyle,
  deviceProfile,
  diceStyles,
  randomFace,
  readStylePref,
  writeStylePref
} from "./dice/common";
import DicePresentation from "./ttrpg/DicePresentation";
import type { RollRecord } from "../../../packages/contracts/dist/index.js";

// A playground for comparing dice animations on a real phone: pick a die and a style,
// roll, and optionally run the same roll next to the current 3D dice.

const dicePresets = [
  { label: "d20", count: 1, sides: 20 },
  { label: "d4", count: 1, sides: 4 },
  { label: "d6", count: 1, sides: 6 },
  { label: "d8", count: 1, sides: 8 },
  { label: "d10", count: 1, sides: 10 },
  { label: "d12", count: 1, sides: 12 },
  { label: "2d6", count: 2, sides: 6 },
  { label: "4d6", count: 4, sides: 6 }
];

function styleName(id: DiceStyleId) {
  return diceStyles.find((s) => s.id === id)?.name ?? id;
}

function LabPane({ styleId, faces, thrown, rollKey, compact }: { styleId: DiceStyleId; faces: DiceFaces; thrown: boolean; rollKey: number; compact: boolean }) {
  const [settledMs, setSettledMs] = useState<number | null>(null);
  const startRef = useRef(0);
  if (thrown && startRef.current === 0) startRef.current = performance.now();
  return (
    <div className="lab-pane">
      <span className="lab-pane-label">{styleName(styleId)}</span>
      <div className="lab-pane-stage">
        <DiceAnimation
          key={`${styleId}-${rollKey}`}
          styleId={styleId}
          faces={faces}
          thrown={thrown}
          compact={compact}
          onSettled={() => setSettledMs(Math.round(performance.now() - startRef.current))}
        />
      </div>
      {settledMs !== null && thrown ? (
        <span className="lab-pane-result">
          {faces.values.join(" + ")}
          {faces.values.length > 1 ? ` = ${faces.values.reduce((a, b) => a + b, 0)}` : ""}
          <small>{(settledMs / 1000).toFixed(1)}s</small>
        </span>
      ) : null}
    </div>
  );
}

export function DiceLab() {
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const profile = useMemo(deviceProfile, []);
  const auto = useMemo(autoStyle, []);
  const [preset, setPreset] = useState(dicePresets[0]);
  const [styleId, setStyleId] = useState<DiceStyleId>(auto === "classic3d" ? "tumble" : auto);
  const [compare, setCompare] = useState(true);
  const [rollKey, setRollKey] = useState(0);
  const [thrown, setThrown] = useState(false);
  const [faces, setFaces] = useState<DiceFaces>({ sides: 20, values: [20] });
  const [saved, setSaved] = useState<DiceStylePref>(readStylePref);
  const [fullscreen, setFullscreen] = useState<RollRecord | null>(null);

  function roll() {
    const values = Array.from({ length: preset.count }, () => randomFace(preset.sides));
    setFaces({ sides: preset.sides, values });
    setThrown(false);
    setRollKey((k) => k + 1);
    // let the panes mount in their idle pose, then throw
    clearTimeout(timer.current);timer.current=setTimeout(() => setThrown(true), 250);
  }

  function fullscreenRoll() {
    const values = Array.from({ length: preset.count }, () => randomFace(preset.sides));
    const total = values.reduce((a, b) => a + b, 0);
    setFullscreen({
      id: `lab-${Date.now()}`,
      actorId: "lab",
      actorName: "Dice Lab",
      dice: `${preset.count}d${preset.sides}`,
      modifier: 0,
      rolled: values.length === 1 ? values[0] : values,
      total,
      advantage: null,
      note: "Practice roll",
      timestamp: new Date().toISOString()
    });
  }

  function choose(pref: DiceStylePref) {
    writeStylePref(pref);
    setSaved(pref);
  }

  return (
    <div className="lab">
      <header className="lab-head">
        <a className="icon-btn lab-back" href="./" aria-label="Back to the table">
          ←
        </a>
        <div>
          <p className="eyebrow">Black Dice Engine</p>
          <h1>Dice Lab</h1>
        </div>
      </header>

      <p className="lab-device">
        This phone: WebGL2 <b className={profile.webgl2 ? "ok" : "no"}>{profile.webgl2 ? "yes" : "no"}</b>
        {profile.cores ? ` · ${profile.cores} cores` : ""}
        {profile.memory ? ` · ${profile.memory} GB` : ""}
        {profile.lowEnd ? " · low-end mode" : ""} · Auto picks <b>{styleName(auto)}</b>
      </p>

      <div className="lab-chips" role="radiogroup" aria-label="Animation style">
        {diceStyles
          .filter((s) => s.id !== "classic3d")
          .map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={styleId === s.id} className={styleId === s.id ? "on" : ""} onClick={() => setStyleId(s.id)}>
              {s.name}
            </button>
          ))}
      </div>
      <p className="lab-blurb">{diceStyles.find((s) => s.id === styleId)?.blurb}</p>

      <div className={`lab-stage ${compare ? "split" : ""}`}>
        <LabPane key={`a-${styleId}-${rollKey}`} styleId={styleId} faces={faces} thrown={thrown} rollKey={rollKey} compact={compare} />
        {compare ? <LabPane key={`b-${rollKey}`} styleId="classic3d" faces={faces} thrown={thrown} rollKey={rollKey} compact /> : null}
      </div>

      <div className="lab-chips dice" role="radiogroup" aria-label="Dice">
        {dicePresets.map((p) => (
          <button key={p.label} type="button" role="radio" aria-checked={preset.label === p.label} className={preset.label === p.label ? "on" : ""} onClick={() => setPreset(p)}>
            {p.label}
          </button>
        ))}
      </div>

      <button type="button" className="btn primary lab-roll" onClick={roll}>
        Roll {preset.label}
      </button>

      <div className="lab-row">
        <label className="lab-toggle">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare with current 3D
        </label>
        <button type="button" className="btn ghost lab-small" onClick={fullscreenRoll}>
          Try full-screen
        </button>
      </div>

      <section className="lab-pick">
        <p className="lab-pick-title">Dice animation on this phone</p>
        <div className="lab-chips" role="radiogroup" aria-label="Dice animation on this phone">
          {(["auto", ...diceStyles.map((s) => s.id)] as DiceStylePref[]).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={saved === id} className={saved === id ? "on" : ""} onClick={() => choose(id)}>
              {id === "auto" ? `Auto (${styleName(auto)})` : styleName(id)}
            </button>
          ))}
        </div>
        <p className="lab-blurb">Saved on this phone only. Classic 3D falls back to Tumble where WebGL2 is missing.</p>
      </section>

      <Calibrate3D />

      {fullscreen ? <DicePresentation roll={fullscreen} onClose={() => setFullscreen(null)} /> : null}
    </div>
  );
}
