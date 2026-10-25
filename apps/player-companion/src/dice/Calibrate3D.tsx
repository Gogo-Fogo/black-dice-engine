import React, { useEffect, useRef, useState } from "react";
import { supportsWebGL2 } from "./common";
import type { CalibrationView, FaceMap } from "./throw3d-engine";

// Teaches the 3D Throw which number is printed on each face of the GM's .glb dice:
// the model turns to each detected face and the player types the number they see.

const sidesList = [20, 12, 10, 8, 6, 4];

export function Calibrate3D() {
  const [sides, setSides] = useState(20);
  const [status, setStatus] = useState<"loading" | "missing" | "ready" | "done" | "nowebgl">(supportsWebGL2() ? "loading" : "nowebgl");
  const [index, setIndex] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [entry, setEntry] = useState("");
  const [values, setValues] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [json, setJson] = useState("");
  const [fileName, setFileName] = useState("");
  const [calibrated, setCalibrated] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<CalibrationView | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!supportsWebGL2()) return;
    let cancelled = false;
    setStatus("loading");
    setIndex(0);
    setValues([]);
    setEntry("");
    setJson("");
    setError("");
    import("./throw3d-engine").then(async ({ createCalibrationView, modelFileName, hasFaceMap }) => {
      if (cancelled || !hostRef.current) return;
      const hasMap=await hasFaceMap(sides);
      if(cancelled||!hostRef.current)return;
      setCalibrated(hasMap);
      setFileName(modelFileName(sides) ?? "");
      const view = await createCalibrationView(hostRef.current, sides);
      if (cancelled) {
        view.dispose();
        return;
      }
      viewRef.current = view;
      setFaceCount(view.faceCount);
      setStatus(view.found ? "ready" : "missing");
    }).catch(()=>{if(!cancelled)setStatus("missing");});
    return () => {
      cancelled = true;
      viewRef.current?.dispose();
      viewRef.current = null;
    };
  }, [sides]);

  async function submit() {
    const value = Number(entry);
    if (!Number.isInteger(value) || value < 1 || value > sides) {
      setError(`Enter a number from 1 to ${sides}.`);
      return;
    }
    if (values.includes(value)) {
      setError(`${value} was already used for another face.`);
      return;
    }
    setError("");
    const next = [...values, value];
    setValues(next);
    setEntry("");
    if (next.length < faceCount) {
      setIndex(next.length);
      viewRef.current?.showFace(next.length);
      inputRef.current?.focus();
      return;
    }
    const view = viewRef.current!;
    const map: FaceMap = { sides, faces: next.map((v, i) => ({ normal: view.normalOf(i), value: v })) };
    const { saveFaceMap } = await import("./throw3d-engine");
    saveFaceMap(map);
    setJson(JSON.stringify(map));
    setStatus("done");
  }

  return (
    <section className="lab-pick">
      <p className="lab-pick-title">Calibrate your 3D dice models</p>
      <p className="lab-blurb">
        So 3D Throw lands with the right number on top of your own models. Takes about a minute per die.
      </p>
      <div className="lab-chips dice" role="radiogroup" aria-label="Die to calibrate">
        {sidesList.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={sides === s} className={sides === s ? "on" : ""} onClick={() => setSides(s)}>
            d{s}
          </button>
        ))}
      </div>
      <div className="calib-stage" ref={hostRef}>
        {status === "loading" ? <p className="dice-anim-note">Looking for your d{sides} model…</p> : null}
        {status === "missing" ? (
          <p className="dice-anim-note">
            No model at <code>public/dice/{fileName}.glb</code>. 3D Throw uses the generated d{sides} instead, which needs no calibration.
          </p>
        ) : null}
        {status === "nowebgl" ? <p className="dice-anim-note">This phone has no WebGL2, so 3D dice can't run here.</p> : null}
      </div>
      {status === "ready" ? (
        <form
          className="calib-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className={`calib-state ${calibrated ? "ok" : ""}`}>
            {calibrated
              ? `Your d${sides} model is calibrated. Go through it again only if numbers land wrong.`
              : `Your d${sides} model isn't calibrated yet, so 3D Throw may show a different number on top until you do this.`}
          </p>
          <label htmlFor="calib-value">
            Face {index + 1} of {faceCount}: {sides === 4 ? "what number is at the top point?" : "what number is facing you?"}
          </label>
          <div className="calib-row">
            <input
              id="calib-value"
              ref={inputRef}
              className="text-input"
              inputMode="numeric"
              pattern="[0-9]*"
              value={entry}
              onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 3))}
              autoComplete="off"
            />
            <button type="submit" className="btn primary lab-small" disabled={!entry}>
              {values.length + 1 === faceCount ? "Finish" : "Next"}
            </button>
          </div>
          {error ? <p className="calib-error">{error}</p> : null}
        </form>
      ) : null}
      {status === "done" ? (
        <div className="calib-done">
          <p>
            Saved on this phone. To use it on every phone, save this as <code>public/dice/{fileName}.faces.json</code> next to the model:
          </p>
          <textarea className="text-input calib-json" readOnly value={json} rows={3} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="btn ghost lab-small"
            onClick={() => {
              void navigator.clipboard?.writeText(json).catch(() => {});
            }}
          >
            Copy
          </button>
        </div>
      ) : null}
    </section>
  );
}
