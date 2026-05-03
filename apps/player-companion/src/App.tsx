import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { DiceHandle, preloadDice, renderDiceOverlay } from "./dice3d";
import { playDiceRollSound } from "./diceSound";

// Preload dice models on startup
preloadDice();

const _originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input.toString();
  if (url.startsWith("/api/")) {
    init = init || {};
    const headers = new Headers(init.headers);
    headers.set("x-bde-role", "player");
    init.headers = headers;
  }
  return _originalFetch(input, init);
};

type Character = {
  id: string;
  name: string;
  classLabel: string;
  hp: { current: number; max: number };
  armorClass: number;
  initiative: number | null;
  conditions: string[];
  resources: Array<{
    id: string;
    label: string;
    current: number;
    max: number;
  }>;
  inventory: Array<{
    id: string;
    name: string;
    quantity: number;
    detail?: string;
  }>;
  notes: string[];
  image?: string | null;
  stats?: { str: number; dex: number; con: number; int: number; wis: number; cha: number; skills: string[] };
  claimedByClientId: string | null;
  claimedByLabel: string | null;
};

type RollRecord = {
  id: string;
  actorId: string;
  actorName: string;
  dice: string;
  modifier: number;
  rolled: number | number[];
  total: number;
  advantage: boolean | null;
  note: string;
  timestamp: string;
};

type MemoryEntry = {
  id: string;
  kind: string;
  visibility: string;
  summary: string;
  createdAt: string;
};

type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  party: Character[];
  rollLog: RollRecord[];
  memoryEntries: MemoryEntry[];
  currentAction?: { type: string; description: string; ability: string; dc: number | null } | null;
};

type PlayerSocketEnvelope =
  | { type: "connected"; payload: { sessionSnapshot: SessionSnapshot } }
  | { type: "session_snapshot"; payload: SessionSnapshot }
  | { type: "roll_recorded"; payload: RollRecord };

type RollRequest = {
  actorId: string;
  actorName: string;
  modifier: number;
  dice?: string;
  note: string;
  requestId: string;
};

const storageKey = "black-dice-engine-player-client-id";
const pendingRequestStorageKey = "black-dice-engine-pending-requests";

function createClientId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `client-${Date.now().toString(36)}-${randomPart}`;
}

function getOrCreateClientId() {
  const existing = window.localStorage.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const created = createClientId();
  window.localStorage.setItem(storageKey, created);
  return created;
}

function createRequestId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `request-${Date.now().toString(36)}-${randomPart}`;
}

function readPendingRequests() {
  try {
    const raw = window.sessionStorage.getItem(pendingRequestStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writePendingRequests(value: Record<string, string>) {
  window.sessionStorage.setItem(pendingRequestStorageKey, JSON.stringify(value));
}

function getOrCreatePendingRequestId(fingerprint: string) {
  const pending = readPendingRequests();
  const existing = pending[fingerprint];

  if (existing) {
    return existing;
  }

  const created = createRequestId();
  writePendingRequests({
    ...pending,
    [fingerprint]: created
  });
  return created;
}

function clearPendingRequestId(fingerprint: string) {
  const pending = readPendingRequests();

  if (!(fingerprint in pending)) {
    return;
  }

  delete pending[fingerprint];
  writePendingRequests(pending);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function DiceOverlay({ roll, onClose }: { roll: RollRecord; onClose: () => void }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiceHandle | null>(null);
  const thrownRef = useRef(false);
  const [showResult, setShowResult] = useState(false);
  const [canThrow, setCanThrow] = useState(false);
  const [thrown, setThrown] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    try {
      handleRef.current = renderDiceOverlay(el, roll.dice, () => {
        setLoading(false);
        setShowResult(true);
      });
      // Poll for when the model is loaded
      const checkLoaded = setInterval(() => {
        if (handleRef.current) {
          // If we have a handle, the overlay is initialized
          // Check if we can throw (model loaded)
          setLoading(false);
          clearInterval(checkLoaded);
        }
      }, 200);
      const timer = setTimeout(() => {
        setCanThrow(true);
        clearInterval(checkLoaded);
        setLoading(false);
      }, 3000); // Max 3s wait before showing button
      return () => {
        clearTimeout(timer);
        clearInterval(checkLoaded);
        handleRef.current?.dispose();
        handleRef.current = null;
      };
    } catch {
      setLoading(false);
      setShowResult(true);
    }
  }, []);

  useEffect(() => {
    if (!showResult) return;
    const timer = setTimeout(onClose, 7000);
    return () => clearTimeout(timer);
  }, [showResult]);

  // Shake detection
  useEffect(() => {
    if (!canThrow || thrown) return;
    let lastShake = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      if (thrownRef.current) return;
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      if (mag > 25 && performance.now() - lastShake > 800) {
        lastShake = performance.now();
        if (!thrownRef.current) {
          thrownRef.current = true;
          setThrown(true);
          playDiceRollSound();
          handleRef.current?.throwDice();
        }
      }
    };
    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      (DeviceMotionEvent as any)
        .requestPermission()
        .then((s: string) => { if (s === "granted") window.addEventListener("devicemotion", onMotion); })
        .catch(() => {});
    } else {
      window.addEventListener("devicemotion", onMotion);
    }
    return () => { window.removeEventListener("devicemotion", onMotion); };
  }, [canThrow, thrown]);

  const doThrow = useCallback(() => {
    if (thrownRef.current) return;
    thrownRef.current = true;
    setThrown(true);
    playDiceRollSound();
    handleRef.current?.throwDice();
  }, []);

  return (
    <div className="dice-overlay">
      <div className="dice-overlay-bg" />
      <div className="dice-roll-card">
        <div className="dice-3d-container" ref={sceneRef} />
        {loading ? (
          <div className="dice-loading">Loading dice...</div>
        ) : canThrow && !thrown ? (
          <button className="dice-throw-btn" onClick={(e) => { e.stopPropagation(); doThrow(); }}>
            TAP TO THROW
          </button>
        ) : null}
        {showResult ? (
          <div className="dice-result-wrap" onClick={onClose}>
            <div className="dice-result-number">{roll.total}</div>
            <p className="dice-roll-who">{roll.actorName}</p>
            <p className="dice-roll-what">{roll.dice} — {roll.note}</p>
            <p className="dice-roll-tap">tap to close</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useAdvancedMode() {
  const [advancedMode, setAdvancedMode] = useState(() => {
    try {
      return window.localStorage.getItem("bde-player-advanced") === "true";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setAdvancedMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("bde-player-advanced", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);
  return { advancedMode, toggle };
}

export default function App() {
  const { advancedMode, toggle: toggleAdvancedMode } = useAdvancedMode();
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [note, setNote] = useState("Perception");
  const [dice, setDice] = useState("d20");
  const [modifier, setModifier] = useState(3);
  const [advantage, setAdvantage] = useState<boolean | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [submitting, setSubmitting] = useState(false);
  const [playerLabel, setPlayerLabel] = useState(() => {
    try { return localStorage.getItem("bde-player-label") || "Player"; } catch { return "Player"; }
  });
  const [clientId, setClientId] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [diceAnimation, setDiceAnimation] = useState<RollRecord | null>(null);
  const [preset, setPreset] = useState<string>("custom");

  useEffect(() => {
    let mounted = true;

    async function load() {
      const localClientId = getOrCreateClientId();
      const response = await fetch("/api/session-snapshot");
      const sessionSnapshot = (await response.json()) as SessionSnapshot;

      if (!mounted) {
        return;
      }

      setClientId(localClientId);
      setSnapshot(sessionSnapshot);
      const alreadyClaimed = sessionSnapshot.party.find(
        (character) => character.claimedByClientId === localClientId
      );
      if (alreadyClaimed) {
        setSelectedCharacterId(alreadyClaimed.id);
      } else {
        // NEVER auto-claim. Player must claim manually.
        setSelectedCharacterId("");
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const localClientId = getOrCreateClientId();
    setClientId(localClientId);
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;

    function clearTimers() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    function connect() {
      if (!active) {
        return;
      }

      setConnectionLabel((current) => (current === "connected" ? "reconnecting" : "connecting"));
      socket = new WebSocket(
        `${protocol}://${window.location.host}/ws?role=player&clientId=${encodeURIComponent(localClientId)}`
      );

      socket.addEventListener("open", () => {
        setConnectionLabel("connected");
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 5000);
      });

      socket.addEventListener("close", () => {
        clearTimers();
        setConnectionLabel("reconnecting");

        if (active) {
          reconnectTimer = window.setTimeout(() => {
            connect();
          }, 1500);
        }
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as PlayerSocketEnvelope;

        if (message.type === "connected") {
          setSnapshot(message.payload.sessionSnapshot);
          return;
        }

        if (message.type === "session_snapshot") {
          setSnapshot(message.payload);
          return;
        }

        if (message.type === "roll_recorded") {
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  rollLog: [message.payload, ...current.rollLog].slice(0, 8)
                }
              : current
          );
          // Only show dice animation for this player's claimed character
          const char = snapshot?.party.find(c => c.claimedByClientId === clientId);
          if (char && message.payload.actorId === char.id) {
            setDiceAnimation(message.payload as RollRecord);
          }
        }
      });
    }

    connect();

    return () => {
      active = false;
      clearTimers();
      socket?.close();
    };
  }, []);

  const selectedCharacter =
    snapshot?.party.find((character) => character.id === selectedCharacterId) ?? null;
  const claimedCharacter =
    snapshot?.party.find((character) => character.claimedByClientId === clientId) ?? null;

  async function submitRollWith(diceStr: string, noteText: string, mod: number) {
    if (!claimedCharacter) return;
    setSubmitting(true);
    try {
      const fingerprint = `roll:${claimedCharacter.id}:${noteText}:${diceStr}:${mod}`;
      await fetch("/api/rolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorId: claimedCharacter.id,
          actorName: claimedCharacter.name,
          modifier: mod,
          dice: diceStr,
          note: noteText,
          requestId: getOrCreatePendingRequestId(fingerprint)
        })
      });
    } finally { setSubmitting(false); }
  }

  async function claimCharacter() {
    if (!selectedCharacterId || !clientId) {
      return;
    }

    setClaimBusy(true);
    const fingerprint = `claim:${clientId}:${selectedCharacterId}:${playerLabel.trim() || "Player"}`;
    const requestId = getOrCreatePendingRequestId(fingerprint);

    try {
      const response = await fetch("/api/claim-character", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId,
          characterId: selectedCharacterId,
          playerLabel,
          requestId
        })
      });

      if (response.ok) {
        const json = (await response.json()) as { sessionSnapshot: SessionSnapshot };
        setSnapshot(json.sessionSnapshot);
        clearPendingRequestId(fingerprint);
      }
    } finally {
      setClaimBusy(false);
    }
  }

  async function releaseCharacter() {
    if (!clientId) {
      return;
    }

    setClaimBusy(true);
    const fingerprint = `release:${clientId}`;
    const requestId = getOrCreatePendingRequestId(fingerprint);

    try {
      const response = await fetch("/api/release-character", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          clientId,
          requestId
        })
      });

      if (response.ok) {
        const json = (await response.json()) as { sessionSnapshot: SessionSnapshot };
        setSnapshot(json.sessionSnapshot);
        clearPendingRequestId(fingerprint);
      }
    } finally {
      setClaimBusy(false);
    }
  }

  return (
    <main className="player-shell">
      <section className="player-header">
        <div>
          <p className="eyebrow">Black Dice Engine</p>
          <h1>Player Companion</h1>
          <p className="subline">
            Phone-first state, quick rolls, and reconnect-safe table access.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
          <div className="status-chip">{connectionLabel}</div>
          <button
            onClick={toggleAdvancedMode}
            type="button"
            style={{
              fontSize: "0.7rem",
              padding: "4px 10px",
              borderRadius: "4px",
              border: "1px solid #5a4a2a",
              background: "linear-gradient(135deg, #3a2a1a 0%, #1a1209 100%)",
              color: "#bca06d",
              cursor: "pointer"
            }}
          >
            {advancedMode ? "🔽 Simple" : "🔧 Advanced"}
          </button>
        </div>
      </section>

      <section className="companion-stack">
        <article className="panel">
          <p className="eyebrow">Campaign</p>
          <h2>{snapshot?.campaignTitle ?? "Loading..."}</h2>
          <p>{snapshot?.currentScene ?? "Waiting for session snapshot..."}</p>
          <p className="table-pin">Table PIN {snapshot?.tablePin ?? "----"}</p>
        </article>

        <article className="panel">
          <label className="label">Your name</label>
          <input value={playerLabel} onChange={(e) => { setPlayerLabel(e.target.value); try { localStorage.setItem("bde-player-label", e.target.value); } catch {} }} style={{ fontSize: "1rem", padding: "8px" }} />

          {!claimedCharacter ? (
            <div style={{ marginTop: 10 }}>
              <p className="eyebrow" style={{ marginBottom: 8 }}>Tap your character:</p>
              {snapshot?.party.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCharacterId(c.id); void (async () => { setClaimBusy(true); try { const r = await fetch("/api/claim-character", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, characterId: c.id, playerLabel, requestId: `claim-${Date.now()}` }) }); if (r.ok) { const j = await r.json(); setSnapshot(j.sessionSnapshot); } } finally { setClaimBusy(false); } })(); }}
                  disabled={!!(c.claimedByClientId && c.claimedByClientId !== clientId) || claimBusy}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 10, marginBottom: 8,
                    border: "1px solid #4a3a2a", borderRadius: 8, background: c.claimedByClientId === clientId ? "rgba(60,120,60,0.3)" : "rgba(30,20,10,0.6)",
                    color: c.claimedByClientId && c.claimedByClientId !== clientId ? "#666" : "#f0dcaf",
                    cursor: c.claimedByClientId && c.claimedByClientId !== clientId ? "default" : "pointer",
                    fontSize: "0.95rem"
                  }}
                  type="button"
                >
                  {c.image ? <img src={c.image} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} /> : null}
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: "0.75rem", color: "#8a7a4a" }}>{c.classLabel} · HP {c.hp.current}/{c.hp.max} · AC {c.armorClass}</div>
                  </div>
                  {c.claimedByClientId && c.claimedByClientId !== clientId ? <span style={{ fontSize: "0.7rem", color: "#e44" }}>{c.claimedByLabel || "taken"}</span> : c.claimedByClientId === clientId ? <span style={{ color: "#7bc47f" }}>✓</span> : <span style={{ color: "#c9a45f", fontSize: "0.8rem" }}>CLAIM</span>}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ background: "rgba(60,120,60,0.2)", border: "1px solid #3a6b3a", borderRadius: 8, padding: 12, marginTop: 10, marginBottom: 10, textAlign: "center" }}>
                <strong style={{ color: "#7bc47f", fontSize: "1.1rem" }}>{claimedCharacter.name}</strong>
                <div style={{ fontSize: "0.8rem", color: "#8a8a6a" }}>{claimedCharacter.classLabel} · HP {claimedCharacter.hp.current}/{claimedCharacter.hp.max} · AC {claimedCharacter.armorClass}</div>
              </div>
              {claimedCharacter.image ? <img src={claimedCharacter.image} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} /> : null}
            </div>
          )}
        </article>

        {diceAnimation ? (
          <DiceOverlay roll={diceAnimation} onClose={() => setDiceAnimation(null)} />
        ) : null}

        <article className="panel">
          {snapshot?.currentAction ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ background: "rgba(40,30,10,0.8)", border: "1px solid #5a4a2a", borderRadius: 8, padding: "10px 12px" }}>
                <strong style={{ color: "#c9a45f" }}>{snapshot.currentAction.type.toUpperCase()}</strong>
                <p style={{ fontSize: "0.85rem", color: "#f0dcaf", margin: "4px 0 0" }}>{snapshot.currentAction.description}</p>
                {snapshot.currentAction.dc !== null ? <p style={{ fontSize: "0.75rem", color: "#8a7a4a" }}>DC {snapshot.currentAction.dc}</p> : null}
              </div>
            </div>
          ) : (
            <p style={{ color: "#8a7a4a", fontSize: "0.85rem", fontStyle: "italic", marginBottom: 8 }}>Waiting for the GM to set an action...</p>
          )}

          <button
            className="big-roll-btn"
            disabled={!claimedCharacter || submitting}
            onClick={(e) => { e.preventDefault(); if (snapshot?.currentAction && claimedCharacter) {
              const ability = snapshot.currentAction.ability;
              const abiModMap: Record<string, string> = { str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha" };
              const abiKey = abiModMap[ability] || "wis";
              const statVal = claimedCharacter.stats?.[abiKey as keyof typeof claimedCharacter.stats] ?? 10;
              const mod = Math.floor(((statVal as number) - 10) / 2);
              void submitRollWith(dice, snapshot.currentAction.type, mod);
            }}}
            type="button"
            style={{ width: "100%", padding: "18px", fontSize: "1.4rem", fontWeight: "bold" }}
          >
            {submitting ? "Rolling..." : snapshot?.currentAction ? `ROLL d20 + ${((): number => {
              if (!claimedCharacter?.stats || !snapshot?.currentAction) return 0;
              const ability = snapshot.currentAction.ability;
              const map: Record<string, keyof typeof claimedCharacter.stats> = { str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha" };
              const key = map[ability] || "wis";
              return Math.floor((Number(claimedCharacter.stats![key]) - 10) / 2);
            })()}` : "WAITING..."}
          </button>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Recent table rolls</h2>
          </div>
          <div className="roll-log">
            {snapshot?.rollLog.map((roll) => (
              <div className="roll-row" key={roll.id}>
                <div>
                  <strong>{roll.actorName}</strong>
                  <p>{roll.note} — {roll.dice}</p>
                </div>
                <div className="roll-values">
                  <strong>{roll.total}</strong>
                  <small>{formatTime(roll.timestamp)}</small>
                </div>
              </div>
            )) ?? <p>Waiting for live rolls.</p>}
          </div>
        </article>

        {snapshot?.memoryEntries?.filter((e) => e.visibility === "player_visible").length ? (
          <article className="panel">
            <div className="panel-header">
              <h2>Session memory</h2>
            </div>
            <div className="roll-log">
              {snapshot.memoryEntries
                .filter((e) => e.visibility === "player_visible")
                .map((entry) => (
                  <div className="roll-row" key={entry.id}>
                    <div>
                      <span style={{ color: "#c9a45f", fontSize: "0.7rem", textTransform: "uppercase" }}>
                        {entry.kind}
                      </span>
                      <p>{entry.summary}</p>
                    </div>
                  </div>
                ))}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
