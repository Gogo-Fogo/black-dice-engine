import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preloadDice } from "./dice3d";
import { DiceOverlay } from "./DiceOverlay";
import {
  abilities,
  abilityName,
  actionKey,
  characterAbilityMod,
  clearPendingRequestId,
  diceWithMode,
  formatMod,
  formatTime,
  getJson,
  getOrCreateClientId,
  getPendingRequestId,
  haptic,
  hpTone,
  naturalRolls,
  postJson,
  proficiencyBonus,
  readPref,
  skillInfo,
  writePref
} from "./lib";
import type {
  Character,
  ConnectionState,
  CurrentAction,
  PlayerSocketEnvelope,
  RollMode,
  RollRecord,
  SessionSnapshot
} from "./types";

preloadDice();

type Tab = "play" | "sheet" | "table" | "lore";

type RollIntent = {
  dice: string;
  modifier: number;
  note: string;
  /** DC to compare against in the result overlay, when this roll answers the GM's call. */
  dc?: number | null;
};

const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  {
    id: "play",
    label: "Play",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" />
        <path d="M12 2.5v6.3m0 0L3.5 16.6M12 8.8l8.5 7.8M3.5 16.6h17" />
      </svg>
    )
  },
  {
    id: "sheet",
    label: "Sheet",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l3 3v15H6Z" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </svg>
    )
  },
  {
    id: "table",
    label: "Table",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="9" r="3" />
        <circle cx="16.5" cy="9.5" r="2.5" />
        <path d="M2.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14 14.6c.8-.4 1.6-.6 2.5-.6 2.3 0 4.2 1.6 4.8 4.5" />
      </svg>
    )
  },
  {
    id: "lore",
    label: "Lore",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5C6.5 4 9.5 4 12 5.5v14C9.5 18 6.5 18 4 19.5Z" />
        <path d="M20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0Z" />
      </svg>
    )
  }
];

function isTab(value: string): value is Tab {
  return tabs.some((tab) => tab.id === value);
}

export default function App() {
  const [clientId] = useState(getOrCreateClientId);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = readPref("bde-player-tab", "play");
    return isTab(saved) ? saved : "play";
  });
  const [playerLabel, setPlayerLabel] = useState(() => readPref("bde-player-label", ""));
  const [soundOn, setSoundOn] = useState(() => readPref("bde-player-sound", "on") === "on");
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [rolling, setRolling] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ roll: RollRecord; dc: number | null } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "error" | "info" } | null>(null);
  const [answeredActionKey, setAnsweredActionKey] = useState(() => {
    try {
      return window.sessionStorage.getItem("bde-player-answered-action") ?? "";
    } catch {
      return "";
    }
  });

  const shownRollIds = useRef(new Set<string>());
  const pendingDc = useRef(new Map<string, number | null>());
  const claimedIdRef = useRef<string | null>(null);

  const claimed = snapshot?.party.find((c) => c.claimedByClientId === clientId) ?? null;
  claimedIdRef.current = claimed?.id ?? null;
  const action = snapshot?.currentAction ?? null;
  const actionPending = !!action && actionKey(action) !== answeredActionKey;

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    writePref("bde-player-tab", next);
    window.scrollTo({ top: 0 });
  }, []);

  const showToast = useCallback((text: string, tone: "error" | "info" = "error") => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showRoll = useCallback((roll: RollRecord, dc: number | null) => {
    if (shownRollIds.current.has(roll.id)) return;
    shownRollIds.current.add(roll.id);
    setOverlay({ roll, dc });
  }, []);

  // Initial snapshot over HTTP
  const loadSnapshot = useCallback(async () => {
    setLoadError(null);
    try {
      setSnapshot(await getJson<SessionSnapshot>("/api/session-snapshot"));
    } catch {
      setLoadError("Can't reach the table host. Make sure you're on the same Wi-Fi as the GM.");
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  // Live updates over WebSocket with automatic reconnect
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;

    function clearTimers() {
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      reconnectTimer = heartbeatTimer = null;
    }

    function connect() {
      if (!active) return;
      setConnection((current) => (current === "connected" ? "reconnecting" : current));
      socket = new WebSocket(
        `${protocol}://${window.location.host}/ws?role=player&clientId=${encodeURIComponent(clientId)}`
      );

      socket.addEventListener("open", () => {
        setConnection("connected");
        setLoadError(null);
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "heartbeat" }));
        }, 5000);
      });

      socket.addEventListener("close", () => {
        clearTimers();
        if (!active) return;
        setConnection("reconnecting");
        reconnectTimer = window.setTimeout(connect, 1500);
      });

      socket.addEventListener("message", (event) => {
        let message: PlayerSocketEnvelope;
        try {
          message = JSON.parse(event.data) as PlayerSocketEnvelope;
        } catch {
          return;
        }
        if (message.type === "connected") {
          setSnapshot(message.payload.sessionSnapshot);
        } else if (message.type === "session_snapshot") {
          setSnapshot(message.payload);
        } else if (message.type === "roll_recorded") {
          const roll = message.payload;
          setSnapshot((current) =>
            current && !current.rollLog.some((r) => r.id === roll.id)
              ? { ...current, rollLog: [roll, ...current.rollLog].slice(0, 12) }
              : current
          );
          if (roll.actorId === claimedIdRef.current) {
            showRoll(roll, pendingDc.current.get(roll.note) ?? null);
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
  }, [clientId, showRoll]);

  // Nudge the player when the GM calls for a roll
  const lastActionKey = useRef<string | null>(null);
  useEffect(() => {
    const key = action ? actionKey(action) : null;
    if (key && key !== lastActionKey.current && actionPending && claimed) haptic([20, 60, 20]);
    lastActionKey.current = key;
  }, [action, actionPending, claimed]);

  async function roll(intent: RollIntent) {
    if (!claimed || rolling) return;
    setRolling(true);
    haptic(10);
    const dice = intent.dice.startsWith("1d20") || intent.dice === "d20" ? diceWithMode(intent.dice, rollMode) : intent.dice;
    const fingerprint = `roll:${claimed.id}:${intent.note}:${dice}:${intent.modifier}`;
    pendingDc.current.set(intent.note, intent.dc ?? null);
    try {
      const record = await postJson<RollRecord>("/api/rolls", {
        actorId: claimed.id,
        actorName: claimed.name,
        modifier: intent.modifier,
        dice,
        note: intent.note,
        requestId: getPendingRequestId(fingerprint)
      });
      clearPendingRequestId(fingerprint);
      setRollMode("normal");
      showRoll(record, intent.dc ?? null);
      if (action && intent.note === action.type) {
        const key = actionKey(action);
        setAnsweredActionKey(key);
        try {
          window.sessionStorage.setItem("bde-player-answered-action", key);
        } catch {
          // ignore
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Roll failed. Try again.");
    } finally {
      setRolling(false);
    }
  }

  async function claim(character: Character) {
    const label = playerLabel.trim();
    if (!label) {
      showToast("Add your name first so the GM knows who's playing.");
      document.getElementById("player-name")?.focus();
      return;
    }
    setClaimingId(character.id);
    const fingerprint = `claim:${clientId}:${character.id}:${label}`;
    try {
      const result = await postJson<{ sessionSnapshot: SessionSnapshot }>("/api/claim-character", {
        clientId,
        characterId: character.id,
        playerLabel: label,
        requestId: getPendingRequestId(fingerprint)
      });
      clearPendingRequestId(fingerprint);
      setSnapshot(result.sessionSnapshot);
      setTab("play");
      haptic(20);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't claim that character.");
    } finally {
      setClaimingId(null);
    }
  }

  async function release() {
    const fingerprint = `release:${clientId}`;
    try {
      const result = await postJson<{ sessionSnapshot: SessionSnapshot }>("/api/release-character", {
        clientId,
        requestId: getPendingRequestId(fingerprint)
      });
      clearPendingRequestId(fingerprint);
      setSnapshot(result.sessionSnapshot);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't release the character.");
    }
  }

  function toggleSound() {
    setSoundOn((on) => {
      writePref("bde-player-sound", on ? "off" : "on");
      return !on;
    });
  }

  let body: ReactNode;
  if (!snapshot) {
    body = <Splash error={loadError} onRetry={loadSnapshot} />;
  } else if (!claimed) {
    body = (
      <JoinScreen
        snapshot={snapshot}
        clientId={clientId}
        playerLabel={playerLabel}
        onLabelChange={(value) => {
          setPlayerLabel(value);
          writePref("bde-player-label", value);
        }}
        claimingId={claimingId}
        onClaim={claim}
      />
    );
  } else {
    body = (
      <div className="app">
        <TopBar
          character={claimed}
          connection={connection}
          actionPending={actionPending && tab !== "play"}
          onActionTap={() => setTab("play")}
        />
        <main className="content" id="main">
          {tab === "play" ? (
            <PlayTab
              snapshot={snapshot}
              character={claimed}
              action={action}
              actionPending={actionPending}
              rollMode={rollMode}
              onRollMode={setRollMode}
              rolling={rolling}
              onRoll={roll}
            />
          ) : null}
          {tab === "sheet" ? (
            <SheetTab
              character={claimed}
              rollMode={rollMode}
              onRollMode={setRollMode}
              rolling={rolling}
              onRoll={roll}
              soundOn={soundOn}
              onToggleSound={toggleSound}
              onRelease={release}
            />
          ) : null}
          {tab === "table" ? <TableTab snapshot={snapshot} clientId={clientId} /> : null}
          {tab === "lore" ? <LoreTab snapshot={snapshot} /> : null}
        </main>
        <nav className="tabbar" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? "active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">
                {t.icon}
                {t.id === "play" && actionPending ? <span className="tab-badge" aria-label="Roll requested" /> : null}
              </span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <>
      {body}
      {overlay ? (
        <DiceOverlay roll={overlay.roll} dc={overlay.dc} soundOn={soundOn} onClose={() => setOverlay(null)} />
      ) : null}
      <div className="toast-region" aria-live="polite">
        {toast ? <div className={`toast ${toast.tone}`}>{toast.text}</div> : null}
      </div>
    </>
  );
}

// --- Shared bits -----------------------------------------------------------------------

/** Character art lives outside the repo, so treat a missing image like no image. */
function useImageOk(src: string | null | undefined) {
  const [failed, setFailed] = useState<string | null>(null);
  return { ok: !!src && failed !== src, onError: () => setFailed(src ?? null) };
}

function Portrait({ character, size = 44 }: { character: Character; size?: number }) {
  const image = useImageOk(character.image);
  const initials = character.name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, "")[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="portrait" style={{ width: size, height: size }}>
      {image.ok ? <img src={character.image!} alt="" loading="lazy" onError={image.onError} /> : <span>{initials}</span>}
    </span>
  );
}

function HpBar({ hp }: { hp: Character["hp"] }) {
  const pct = hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0;
  return (
    <span
      className={`hp-bar ${hpTone(hp)}`}
      role="meter"
      aria-label="Hit points"
      aria-valuemin={0}
      aria-valuemax={hp.max}
      aria-valuenow={hp.current}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

function ModeSwitch({ value, onChange }: { value: RollMode; onChange: (mode: RollMode) => void }) {
  const options: Array<{ id: RollMode; label: string }> = [
    { id: "dis", label: "Disadv." },
    { id: "normal", label: "Normal" },
    { id: "adv", label: "Advantage" }
  ];
  return (
    <div className="segmented" role="radiogroup" aria-label="Roll mode for d20 rolls">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={`${value === option.id ? "active" : ""} ${option.id}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RollRow({ roll, highlight }: { roll: RollRecord; highlight?: boolean }) {
  const natural = naturalRolls(roll.rolled);
  const isD20 = /d20/.test(roll.dice) && natural.length === 1;
  const flag = isD20 && natural[0] === 20 ? "crit" : isD20 && natural[0] === 1 ? "fumble" : "";
  return (
    <li className={`roll-row ${highlight ? "mine" : ""}`}>
      <div className="roll-main">
        <strong>{roll.actorName}</strong>
        <span>
          {roll.note} · {roll.dice}
        </span>
      </div>
      <div className="roll-side">
        <span className={`roll-total ${flag}`}>{roll.total}</span>
        <time dateTime={roll.timestamp}>{formatTime(roll.timestamp)}</time>
      </div>
    </li>
  );
}

// --- Screens ---------------------------------------------------------------------------

function Splash({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="splash">
      <div className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" />
          <path d="M12 2.5v6.3m0 0L3.5 16.6M12 8.8l8.5 7.8M3.5 16.6h17" />
        </svg>
      </div>
      <p className="eyebrow">Black Dice Engine</p>
      {error ? (
        <>
          <h1>Table not found</h1>
          <p className="muted">{error}</p>
          <button type="button" className="btn primary" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <>
          <h1>Joining the table…</h1>
          <span className="spinner" aria-label="Loading" />
        </>
      )}
    </div>
  );
}

function JoinScreen({
  snapshot,
  clientId,
  playerLabel,
  onLabelChange,
  claimingId,
  onClaim
}: {
  snapshot: SessionSnapshot;
  clientId: string;
  playerLabel: string;
  onLabelChange: (value: string) => void;
  claimingId: string | null;
  onClaim: (character: Character) => void;
}) {
  const nameMissing = !playerLabel.trim();
  return (
    <div className="join">
      <header className="join-hero">
        <p className="eyebrow">You're joining</p>
        <h1>{snapshot.campaignTitle}</h1>
        <p className="muted">{snapshot.currentScene}</p>
        <span className="pin-chip">Table PIN · {snapshot.tablePin}</span>
      </header>

      <section className="join-step">
        <label className="step-label" htmlFor="player-name">
          <span className="step-num">1</span> Your name
        </label>
        <input
          id="player-name"
          className="text-input"
          value={playerLabel}
          autoComplete="given-name"
          enterKeyHint="done"
          placeholder="What should the table call you?"
          maxLength={32}
          onChange={(event) => onLabelChange(event.target.value)}
        />
      </section>

      <section className="join-step">
        <p className="step-label">
          <span className="step-num">2</span> Pick your character
        </p>
        <ul className="claim-list">
          {snapshot.party.map((character) => {
            const takenBy = character.claimedByClientId && character.claimedByClientId !== clientId;
            const busy = claimingId === character.id;
            return (
              <li key={character.id}>
                <button
                  type="button"
                  className={`claim-card ${takenBy ? "taken" : ""}`}
                  disabled={!!takenBy || !!claimingId}
                  aria-disabled={nameMissing || undefined}
                  onClick={() => onClaim(character)}
                >
                  <Portrait character={character} size={64} />
                  <span className="claim-body">
                    <strong>{character.name}</strong>
                    <span className="muted">{character.classLabel}</span>
                    <span className="claim-stats">
                      <span>HP {character.hp.max}</span>
                      <span>AC {character.armorClass}</span>
                    </span>
                  </span>
                  <span className="claim-cta">
                    {takenBy ? (character.claimedByLabel || "Taken") : busy ? "Joining…" : "Play"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {nameMissing ? <p className="hint">Add your name above, then tap a character.</p> : null}
      </section>
    </div>
  );
}

function TopBar({
  character,
  connection,
  actionPending,
  onActionTap
}: {
  character: Character;
  connection: ConnectionState;
  actionPending: boolean;
  onActionTap: () => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-row">
        <Portrait character={character} size={40} />
        <div className="topbar-id">
          <strong>{character.name}</strong>
          <span>{character.classLabel}</span>
        </div>
        <div className="topbar-vitals">
          <span className="vital">
            <small>HP</small>
            <b className={`hp-text ${hpTone(character.hp)}`}>
              {character.hp.current}
              <i>/{character.hp.max}</i>
            </b>
          </span>
          <span className="vital">
            <small>AC</small>
            <b>{character.armorClass}</b>
          </span>
        </div>
        <span
          className={`conn-dot ${connection}`}
          role="status"
          aria-label={connection === "connected" ? "Connected to table" : "Reconnecting to table"}
          title={connection}
        />
      </div>
      <HpBar hp={character.hp} />
      {connection !== "connected" ? (
        <div className="conn-banner" role="status">
          <span className="spinner small" aria-hidden="true" />
          {connection === "connecting" ? "Connecting to the table…" : "Connection lost — reconnecting…"}
        </div>
      ) : null}
      {actionPending ? (
        <button type="button" className="action-pill" onClick={onActionTap}>
          The GM is asking for a roll <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </header>
  );
}

function PlayTab({
  snapshot,
  character,
  action,
  actionPending,
  rollMode,
  onRollMode,
  rolling,
  onRoll
}: {
  snapshot: SessionSnapshot;
  character: Character;
  action: CurrentAction | null;
  actionPending: boolean;
  rollMode: RollMode;
  onRollMode: (mode: RollMode) => void;
  rolling: boolean;
  onRoll: (intent: RollIntent) => void;
}) {
  const [count, setCount] = useState(1);
  const myRolls = snapshot.rollLog.filter((r) => r.actorId === character.id).slice(0, 3);
  const actionMod = action ? characterAbilityMod(character, action.ability) : 0;
  const answered = action && !actionPending ? myRolls.find((r) => r.note === action.type) : undefined;

  return (
    <div className="stack">
      <section className="scene-card">
        <p className="eyebrow">Current scene</p>
        <h1>{snapshot.currentScene}</h1>
        <p className="muted">{snapshot.campaignTitle}</p>
      </section>

      {action ? (
        <section className={`action-card ${actionPending ? "live" : "done"}`} aria-live="polite">
          <p className="eyebrow">{actionPending ? "The GM calls for" : "You answered"}</p>
          <h2>{action.type}</h2>
          {action.description && action.description !== action.type ? <p>{action.description}</p> : null}
          <div className="chip-row">
            <span className="chip">{abilityName(action.ability)}</span>
            {action.dc !== null ? <span className="chip">DC {action.dc}</span> : null}
          </div>
          {actionPending ? (
            <>
              <ModeSwitch value={rollMode} onChange={onRollMode} />
              <button
                type="button"
                className="btn primary roll-cta"
                disabled={rolling}
                onClick={() =>
                  onRoll({ dice: "1d20", modifier: actionMod, note: action.type, dc: action.dc })
                }
              >
                {rolling ? (
                  "Rolling…"
                ) : (
                  <>
                    Roll d20 <span className="roll-cta-mod">{formatMod(actionMod)}</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <p className="answered">
              {answered ? (
                <>
                  You rolled <b>{answered.total}</b>
                  {action.dc !== null ? (answered.total >= action.dc ? " — that meets the DC." : " — short of the DC.") : "."}{" "}
                </>
              ) : null}
              Waiting for the rest of the table.
            </p>
          )}
        </section>
      ) : (
        <section className="waiting-card">
          <span className="waiting-glyph" aria-hidden="true" />
          <div>
            <h2>Listen to the GM</h2>
            <p className="muted">When a roll is needed it will appear here and your phone will buzz.</p>
          </div>
        </section>
      )}

      <section className="card">
        <SectionHeader title="Free roll" hint="no modifiers" />
        <div className="count-row" role="radiogroup" aria-label="Number of dice">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={count === n}
              className={count === n ? "active" : ""}
              onClick={() => setCount(n)}
            >
              ×{n}
            </button>
          ))}
        </div>
        <div className="dice-grid">
          {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
            <button
              key={sides}
              type="button"
              className="die-btn"
              disabled={rolling}
              onClick={() => onRoll({ dice: `${count}d${sides}`, modifier: 0, note: "Free roll" })}
            >
              <span className="die-count">{count > 1 ? `${count}` : ""}</span>d{sides}
            </button>
          ))}
        </div>
      </section>

      {myRolls.length ? (
        <section className="card">
          <SectionHeader title="Your last rolls" />
          <ul className="roll-list">
            {myRolls.map((r) => (
              <RollRow key={r.id} roll={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SheetTab({
  character,
  rollMode,
  onRollMode,
  rolling,
  onRoll,
  soundOn,
  onToggleSound,
  onRelease
}: {
  character: Character;
  rollMode: RollMode;
  onRollMode: (mode: RollMode) => void;
  rolling: boolean;
  onRoll: (intent: RollIntent) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onRelease: () => void;
}) {
  const [confirmRelease, setConfirmRelease] = useState(false);
  const heroImage = useImageOk(character.image);
  const skills = useMemo(
    () => (character.stats?.skills ?? []).map((skill) => ({ id: skill, ...skillInfo(character, skill) })),
    [character]
  );

  useEffect(() => {
    if (!confirmRelease) return;
    const timer = window.setTimeout(() => setConfirmRelease(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmRelease]);

  return (
    <div className="stack">
      <section className="sheet-hero">
        {heroImage.ok ? (
          <img src={character.image!} alt={`Portrait of ${character.name}`} onError={heroImage.onError} />
        ) : null}
        <div className="sheet-hero-text">
          <h1>{character.name}</h1>
          <p>{character.classLabel}</p>
        </div>
      </section>

      <section className="vitals">
        <div className="vital-box hp">
          <small>Hit points</small>
          <b className={`hp-text ${hpTone(character.hp)}`}>
            {character.hp.current}
            <i> / {character.hp.max}</i>
          </b>
          <HpBar hp={character.hp} />
        </div>
        <div className="vital-box">
          <small>Armor</small>
          <b>{character.armorClass}</b>
        </div>
        <div className="vital-box">
          <small>Init</small>
          <b>{character.initiative ?? "—"}</b>
        </div>
        <div className="vital-box">
          <small>Prof</small>
          <b>{formatMod(proficiencyBonus(character))}</b>
        </div>
      </section>

      <section className="card">
        <SectionHeader title="Conditions" />
        {character.conditions.length ? (
          <div className="chip-row">
            {character.conditions.map((condition) => (
              <span key={condition} className="chip warn">
                {condition}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">None — you're in fighting shape.</p>
        )}
      </section>

      {character.stats ? (
        <section className="card">
          <SectionHeader title="Abilities" hint="tap to roll a check" />
          <ModeSwitch value={rollMode} onChange={onRollMode} />
          <div className="ability-grid">
            {abilities.map((ability) => {
              const score = character.stats![ability.key];
              const mod = characterAbilityMod(character, ability.key);
              return (
                <button
                  key={ability.key}
                  type="button"
                  className="ability"
                  disabled={rolling}
                  aria-label={`Roll ${ability.name} check, ${formatMod(mod)}`}
                  onClick={() => onRoll({ dice: "1d20", modifier: mod, note: `${ability.name} check` })}
                >
                  <small>{ability.short}</small>
                  <b>{formatMod(mod)}</b>
                  <span>{score}</span>
                </button>
              );
            })}
          </div>

          {skills.length ? (
            <>
              <h3 className="subhead">Proficient skills</h3>
              <ul className="list">
                {skills.map((skill) => (
                  <li key={skill.id}>
                    <button
                      type="button"
                      className="list-row tappable"
                      disabled={rolling}
                      onClick={() => onRoll({ dice: "1d20", modifier: skill.modifier, note: skill.label })}
                    >
                      <span>
                        {skill.label} <small className="muted">{skill.ability.toUpperCase()}</small>
                      </span>
                      <b>{formatMod(skill.modifier)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {character.resources.length ? (
        <section className="card">
          <SectionHeader title="Resources" />
          <ul className="list">
            {character.resources.map((resource) => (
              <li key={resource.id} className="list-row">
                <span>{resource.label}</span>
                {resource.max <= 8 ? (
                  <span className="pips" aria-label={`${resource.current} of ${resource.max}`}>
                    {Array.from({ length: resource.max }, (_, i) => (
                      <i key={i} className={i < resource.current ? "on" : ""} />
                    ))}
                  </span>
                ) : (
                  <b>
                    {resource.current}/{resource.max}
                  </b>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {character.inventory.length ? (
        <section className="card">
          <SectionHeader title="Inventory" hint={`${character.inventory.length} items`} />
          <ul className="list">
            {character.inventory.map((item) => (
              <li key={item.id} className="list-row">
                <span>
                  {item.name}
                  {item.detail ? <small className="muted block">{item.detail}</small> : null}
                </span>
                {item.quantity > 1 ? <b>×{item.quantity}</b> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {character.notes.length ? (
        <section className="card">
          <SectionHeader title="Character notes" />
          <ul className="notes">
            {character.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <SectionHeader title="This device" />
        <ul className="list">
          <li className="list-row">
            <span>Playing as</span>
            <b>{character.claimedByLabel || "Player"}</b>
          </li>
          <li>
            <button type="button" className="list-row tappable" role="switch" aria-checked={soundOn} onClick={onToggleSound}>
              <span>Dice sound</span>
              <span className={`switch ${soundOn ? "on" : ""}`} aria-hidden="true" />
            </button>
          </li>
        </ul>
        <button
          type="button"
          className={`btn ${confirmRelease ? "danger" : "ghost"}`}
          onClick={() => (confirmRelease ? onRelease() : setConfirmRelease(true))}
        >
          {confirmRelease ? "Tap again to leave this character" : "Switch character"}
        </button>
      </section>
    </div>
  );
}

function TableTab({ snapshot, clientId }: { snapshot: SessionSnapshot; clientId: string }) {
  const mineId = snapshot.party.find((c) => c.claimedByClientId === clientId)?.id;
  return (
    <div className="stack">
      <section className="card">
        <SectionHeader title="Party" hint={`${snapshot.party.filter((c) => c.claimedByClientId).length}/${snapshot.party.length} at the table`} />
        <ul className="party-list">
          {snapshot.party.map((member) => (
            <li key={member.id} className={`party-row ${member.id === mineId ? "mine" : ""}`}>
              <Portrait character={member} size={44} />
              <div className="party-body">
                <div className="party-top">
                  <strong>{member.name}</strong>
                  <span className="muted small">
                    {member.id === mineId ? "You" : member.claimedByLabel || "Open seat"}
                  </span>
                </div>
                <HpBar hp={member.hp} />
                <div className="party-meta">
                  <span>
                    HP {member.hp.current}/{member.hp.max}
                  </span>
                  <span>AC {member.armorClass}</span>
                  {member.initiative !== null ? <span>Init {member.initiative}</span> : null}
                  {member.conditions.map((condition) => (
                    <span key={condition} className="chip warn tiny">
                      {condition}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <SectionHeader title="Roll feed" />
        {snapshot.rollLog.length ? (
          <ul className="roll-list">
            {snapshot.rollLog.map((r) => (
              <RollRow key={r.id} roll={r} highlight={r.actorId === mineId} />
            ))}
          </ul>
        ) : (
          <p className="muted small">No rolls yet tonight.</p>
        )}
      </section>

      <section className="card subtle">
        <SectionHeader title="Invite a friend" />
        <p className="muted small">
          Join at <span className="mono">{snapshot.joinUrl}</span> with PIN <b className="mono">{snapshot.tablePin}</b>
        </p>
      </section>
    </div>
  );
}

function LoreTab({ snapshot }: { snapshot: SessionSnapshot }) {
  const entries = (snapshot.memoryEntries ?? []).filter((entry) => entry.visibility === "player_visible");
  const kinds = Array.from(new Set(entries.map((entry) => entry.kind)));
  const [filter, setFilter] = useState<string>("all");
  const shown = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);

  return (
    <div className="stack">
      <section className="card">
        <SectionHeader title="What the party knows" hint={entries.length ? `${entries.length} entries` : undefined} />
        {kinds.length > 1 ? (
          <div className="filter-row" role="tablist" aria-label="Filter lore">
            {["all", ...kinds].map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={filter === kind}
                className={filter === kind ? "active" : ""}
                onClick={() => setFilter(kind)}
              >
                {kind === "all" ? "All" : kind.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        ) : null}
        {shown.length ? (
          <ul className="lore-list">
            {shown.map((entry) => (
              <li key={entry.id}>
                <span className="lore-kind">{entry.kind.replace(/_/g, " ")}</span>
                <p>{entry.summary}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>Nothing recorded yet.</p>
            <p className="muted small">Discoveries, NPCs and clues the GM shares will collect here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
