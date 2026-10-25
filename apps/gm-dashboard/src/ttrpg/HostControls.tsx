import React from "react";
import type { SessionSnapshot } from "./types";
import type { useHostControls } from "./useHostControls";
import { stopAmbient, setAmbientVolume } from "../ambient";

type NarrationControls = {
  speaking: boolean; audioUnlocked: boolean; unlockAudio(): void; speakSceneText(text?: string): Promise<void>;
};
export function HostControls({ controls, snapshot, narration, connectionLabel, connectionError, bootstrapError }: {
  controls: ReturnType<typeof useHostControls>; snapshot: SessionSnapshot | null; narration: NarrationControls;
  connectionLabel: string; connectionError: string; bootstrapError: string;
}) {
  const { advancedMode, toggleAdvancedMode, qrCodeUrl, exportStatus, exportPath, exportSessionSummary, saveStatus, saveNow, sceneStatus, sceneTitle, setSceneTitle, changeScene, autoSearch, setAutoSearch } = controls;
  const { speaking, audioUnlocked, unlockAudio, speakSceneText } = narration;
  return (
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Black Dice Engine</p>
          <h1>GM Dashboard</h1>
          <p className="hero-summary">
            The first slice proves the loop: local server up, player clients connected,
            runtime visible, and every roll preserved in an auditable table log.
          </p>
          <div className="hero-metrics">
            <div>
              <span>Campaign</span>
              <strong>{snapshot?.campaignTitle ?? "Loading..."}</strong>
            </div>
            <div>
              <span>Scene</span>
              <strong>{snapshot?.currentScene ?? "Loading..."}
                <span style={{ marginLeft: 8, fontSize: "0.7rem", color: audioUnlocked ? "#6a6" : "#a66" }}>{audioUnlocked ? "🔊 ready" : "🔇 click to enable"}</span>
                <button onClick={(e) => { e.stopPropagation(); unlockAudio(); void speakSceneText(); }} disabled={speaking} type="button" title="Read narration aloud" style={{ marginLeft: 8, background: "none", border: "1px solid #5a4a2a", borderRadius: 4, cursor: "pointer", fontSize: "1rem", padding: "2px 6px" }}>{speaking ? "⏳" : "🔊"}</button>
              </strong>
            </div>
            <div>
              <span>Socket</span>
              <strong>{connectionLabel}</strong>
              {connectionError ? <p role="alert">{connectionError}</p> : null}
              {bootstrapError ? <p role="alert">{bootstrapError}</p> : null}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <input
                type="text"
                placeholder="New scene title..."
                value={sceneTitle}
                onChange={event => setSceneTitle(event.target.value)}
                disabled={sceneStatus === "saving"}
                aria-label="New scene title"
                onKeyDown={event => { if (event.key === "Enter") void changeScene(); }}
                style={{ flex: 1, fontSize: "0.85rem", padding: "6px 10px" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "#bca06d", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={autoSearch} onChange={event => setAutoSearch(event.target.checked)} aria-label="Search YouTube after a scene change" />
                🎵
              </label>
              <button
                className="mini-button"
                onClick={() => stopAmbient()}
                type="button"
                title="Stop ambient"
              >
                ⏹
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
              <span style={{ fontSize: "0.7rem", color: "#bca06d" }}>Ambient Vol</span>
              <input
                aria-label="Ambient volume"
                type="range"
                min="0"
                max="100"
                defaultValue="30"
                style={{ flex: 1, accentColor: "#d4af37" }}
                onChange={(e) => setAmbientVolume(Number(e.target.value) / 100)}
              />
            </div>
          </div>
        </div>
        <div className="hero-note">
          <span>Join path</span>
          <strong>{snapshot?.joinUrl ?? "Waiting for server..."}</strong>
          <p>Table PIN: {snapshot?.tablePin ?? "----"}</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
            <button className="export-button" onClick={() => void exportSessionSummary()} disabled={exportStatus === "exporting"} type="button">
              Export Session Markdown
            </button>
            <button
              className="export-button"
              style={{ background: "linear-gradient(135deg, #3a6b3a 0%, #2a4a2a 100%)" }}
              onClick={() => void saveNow()}
              disabled={saveStatus === "saving"}
              type="button"
            >
              💾 Save Now
            </button>
            <button
              className="export-button"
              style={{ background: "linear-gradient(135deg, #5a4a2a 0%, #3a2a1a 100%)" }}
              onClick={toggleAdvancedMode}
              type="button"
            >
              {advancedMode ? "🔽 Simple Mode" : "🔧 Advanced Mode"}
            </button>
          </div>
          {saveStatus ? <p role="status">{saveStatus === "saving" ? "Saving session..." : saveStatus === "saved" ? "Session saved." : "Save failed. Try again."}</p> : null}
          {sceneStatus === "failed" ? <p role="alert">Scene change failed. Your title is retained for retry.</p> : null}
          {exportStatus ? (
            <p className="export-note">
              {exportStatus === "exporting"
                ? "Preparing Markdown export..."
                : exportStatus === "ready"
                  ? exportPath
                    ? `Session summary saved to ${exportPath}`
                    : "Session summary downloaded."
                  : "Export failed."}
            </p>
          ) : null}
          {qrCodeUrl ? <img className="qr-preview" src={qrCodeUrl} alt="Player join QR code" /> : null}
        </div>
      </section>
  );
}
