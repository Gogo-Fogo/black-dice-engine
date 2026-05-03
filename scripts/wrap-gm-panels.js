const fs = require("fs");
const path = "apps/gm-dashboard/src/App.tsx";
let src = fs.readFileSync(path, "utf-8");

// 1. Ensure useCallback is imported
if (!src.includes("useCallback")) {
  src = src.replace('import { useEffect, useState } from "react";', 'import { useCallback, useEffect, useState } from "react";');
}

// 2. Ensure ambient import exists
if (!src.includes('import { startAmbient, stopAmbient, setAmbientVolume } from "./ambient";')) {
  src = src.replace('import QRCode from "qrcode";', 'import QRCode from "qrcode";\nimport { startAmbient, stopAmbient, setAmbientVolume } from "./ambient";');
}

// 3. Add useAdvancedMode hook before App component
if (!src.includes("function useAdvancedMode()")) {
  src = src.replace(
    'export default function App() {',
    `function useAdvancedMode() {
  const [advancedMode, setAdvancedMode] = useState(() => {
    try {
      return window.localStorage.getItem("bde-gm-advanced") === "true";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setAdvancedMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("bde-gm-advanced", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  return { advancedMode, toggle };
}

export default function App() {
  const { advancedMode, toggle: toggleAdvancedMode } = useAdvancedMode();`
  );
}

// 4. Add toggle button in hero-note section
if (!src.includes("toggleAdvancedMode")) {
  src = src.replace(
    `<button className="export-button" onClick={() => void exportSessionSummary()} type="button">\n            Export Session Markdown\n          </button>`,
    `<div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
            <button className="export-button" onClick={() => void exportSessionSummary()} type="button">
              Export Session Markdown
            </button>
            <button
              className="export-button"
              style={{ background: "linear-gradient(135deg, #3a6b3a 0%, #2a4a2a 100%)" }}
              onClick={async () => {
                try {
                  const res = await fetch("/api/save-now", { method: "POST" });
                  if (res.ok) {
                    setExportStatus("saved");
                    setTimeout(() => setExportStatus(""), 2000);
                  }
                } catch {
                  setExportStatus("failed");
                }
              }}
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
          </div>`
  );
}

// 5. Add scene setter + ambient controls to hero-metrics
if (!src.includes("startAmbient(title)")) {
  src = src.replace(
    `<div>\n              <span>Socket</span>\n              <strong>{connectionLabel}</strong>\n            </div>\n          </div>`,
    `<div>
              <span>Socket</span>
              <strong>{connectionLabel}</strong>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <input
                type="text"
                placeholder="New scene title..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const title = (e.target as HTMLInputElement).value.trim();
                    if (!title) return;
                    fetch("/api/set-scene", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title }),
                    }).then(() => {
                      (e.target as HTMLInputElement).value = "";
                      startAmbient(title);
                    });
                  }
                }}
                style={{ flex: 1, fontSize: "0.85rem", padding: "6px 10px" }}
              />
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
                type="range"
                min="0"
                max="100"
                defaultValue="30"
                style={{ flex: 1, accentColor: "#d4af37" }}
                onChange={(e) => setAmbientVolume(Number(e.target.value) / 100)}
              />
            </div>
          </div>`
  );
}

// Helper: wrap a panel that starts with <article className="panel"> and specific h2 text
function wrapPanel(src, h2Text) {
  const startPattern = new RegExp(`(\\s+)(<article className="panel[^"]*">\\s*<div className="panel-header">\\s*<h2>${h2Text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h2>)`);
  
  // Find the panel start
  const match = src.match(startPattern);
  if (!match) {
    console.log(`Panel not found: ${h2Text}`);
    return src;
  }
  
  const startIdx = match.index;
  const indent = match[1];
  
  // Find the next panel or section end after this one
  // Look for the closing </article> that matches this opening
  let depth = 0;
  let articleDepth = 0;
  let endIdx = -1;
  let inString = false;
  let stringChar = '';
  
  for (let i = startIdx; i < src.length; i++) {
    const char = src[i];
    const prevChar = i > 0 ? src[i - 1] : '';
    
    if (inString) {
      if (char === stringChar && prevChar !== '\\') {
        inString = false;
      }
      continue;
    }
    
    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }
    
    if (src.substring(i, i + 9) === '<article ') {
      articleDepth++;
    } else if (src.substring(i, i + 10) === '</article>') {
      articleDepth--;
      if (articleDepth === 0) {
        endIdx = i + 10;
        break;
      }
    }
  }
  
  if (endIdx === -1) {
    console.log(`Could not find end of panel: ${h2Text}`);
    return src;
  }
  
  const before = src.substring(0, startIdx);
  const panelContent = src.substring(startIdx, endIdx);
  const after = src.substring(endIdx);
  
  return before + indent + `{advancedMode ? (` + panelContent + indent + `) : null}` + after;
}

// Helper: wrap Create Character panel with simplified version for simple mode
function wrapCreateCharacter(src) {
  const h2Text = "Create Character";
  const startPattern = new RegExp(`(\\s+)(<article className="panel panel-wide">\\s*<div className="panel-header">\\s*<h2>${h2Text}</h2>)`);
  
  const match = src.match(startPattern);
  if (!match) {
    console.log(`Create Character panel not found`);
    return src;
  }
  
  const startIdx = match.index;
  const indent = match[1];
  
  let articleDepth = 0;
  let endIdx = -1;
  let inString = false;
  let stringChar = '';
  
  for (let i = startIdx; i < src.length; i++) {
    const char = src[i];
    const prevChar = i > 0 ? src[i - 1] : '';
    
    if (inString) {
      if (char === stringChar && prevChar !== '\\') {
        inString = false;
      }
      continue;
    }
    
    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }
    
    if (src.substring(i, i + 9) === '<article ') {
      articleDepth++;
    } else if (src.substring(i, i + 10) === '</article>') {
      articleDepth--;
      if (articleDepth === 0) {
        endIdx = i + 10;
        break;
      }
    }
  }
  
  if (endIdx === -1) return src;
  
  const before = src.substring(0, startIdx);
  const panelContent = src.substring(startIdx, endIdx);
  const after = src.substring(endIdx);
  
  const simpleForm = indent + `<article className="panel panel-wide">
          <div className="panel-header">
            <h2>Quick Add Character</h2>
            <span>Name + Class + Stats</span>
          </div>
          <div className="character-form">
            <div className="character-form-row">
              <div style={{ flex: 2 }}>
                <label className="label">Name *</label>
                <input value={newCharacterName} onChange={(e) => setNewCharacterName(e.target.value)} placeholder="Character name" />
              </div>
              <div>
                <label className="label">Class *</label>
                <input value={newCharacterClass} onChange={(e) => setNewCharacterClass(e.target.value)} placeholder="Fighter, Wizard..." />
              </div>
              <div>
                <label className="label">Level</label>
                <input type="number" value={newCharacterLevel} onChange={(e) => setNewCharacterLevel(Number(e.target.value))} min={1} max={20} />
              </div>
            </div>
            <div className="character-form-row">
              <div>
                <label className="label">Max HP</label>
                <input type="number" value={newCharacterMaxHp} onChange={(e) => setNewCharacterMaxHp(Number(e.target.value))} min={1} />
              </div>
              <div>
                <label className="label">AC</label>
                <input type="number" value={newCharacterAc} onChange={(e) => setNewCharacterAc(Number(e.target.value))} min={1} />
              </div>
            </div>
            <button
              className="primary-button"
              disabled={!newCharacterName.trim() || !newCharacterClass.trim() || creatingCharacter}
              onClick={() => void createCharacter()}
              type="button"
            >
              {creatingCharacter ? "Creating..." : "Create Character"}
            </button>
          </div>
        </article>`;
  
  return before + indent + `{advancedMode ? (` + panelContent + indent + `) : (` + simpleForm + indent + `)}` + after;
}

// Wrap panels
const panelsToHide = [
  "Runtime Status",
  "Presence", 
  "Campaign Context",
  "Approval Queue",
  "Scene Packet Draft",
  "Media Job Queue",
  "🎵 YouTube Music",
  "Audio Library",
  "Audio Cue Queue",
  "Generated Media Metadata",
  "Cleanup Policy",
  "Memory Entry Drafts",
  "Local Model Adapter",
  "Director Mode Adapter",
  "AI Activity Log",
  "Error Log",
  "Table Event History"
];

for (const panel of panelsToHide) {
  src = wrapPanel(src, panel);
}

src = wrapCreateCharacter(src);

fs.writeFileSync(path, src);
console.log("GM Dashboard App.tsx updated successfully");
