import { FormEvent, useEffect, useState } from "react";

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

type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  party: Character[];
  rollLog: RollRecord[];
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

export default function App() {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [note, setNote] = useState("Perception");
  const [dice, setDice] = useState("d20");
  const [modifier, setModifier] = useState(3);
  const [advantage, setAdvantage] = useState<boolean | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [submitting, setSubmitting] = useState(false);
  const [playerLabel, setPlayerLabel] = useState("Player");
  const [clientId, setClientId] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);

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
      setSelectedCharacterId(alreadyClaimed?.id ?? sessionSnapshot.party[0]?.id ?? "");
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

  async function submitRoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!claimedCharacter) {
      return;
    }

    const diceFinal = advantage !== null ? `${dice} ${advantage ? "adv" : "dis"}` : dice;
    const payload: RollRequest = {
      actorId: claimedCharacter.id,
      actorName: claimedCharacter.name,
      modifier,
      dice: diceFinal,
      note,
      requestId: getOrCreatePendingRequestId(
        `roll:${claimedCharacter.id}:${note.trim() || "Check"}:${diceFinal}:${modifier}`
      )
    };
    const fingerprint = `roll:${claimedCharacter.id}:${note.trim() || "Check"}:${diceFinal}:${modifier}`;

    setSubmitting(true);

    try {
      const response = await fetch("/api/rolls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        clearPendingRequestId(fingerprint);
      }
    } finally {
      setSubmitting(false);
    }
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
        <div className="status-chip">{connectionLabel}</div>
      </section>

      <section className="companion-stack">
        <article className="panel">
          <p className="eyebrow">Campaign</p>
          <h2>{snapshot?.campaignTitle ?? "Loading..."}</h2>
          <p>{snapshot?.currentScene ?? "Waiting for session snapshot..."}</p>
          <p className="table-pin">Table PIN {snapshot?.tablePin ?? "----"}</p>
        </article>

        <article className="panel">
          <label className="label" htmlFor="player-label">
            Player label
          </label>
          <input
            id="player-label"
            value={playerLabel}
            onChange={(event) => setPlayerLabel(event.target.value)}
          />

          <label className="label" htmlFor="character-select">
            Character selection
          </label>
          <select
            id="character-select"
            value={selectedCharacterId}
            onChange={(event) => setSelectedCharacterId(event.target.value)}
          >
            {snapshot?.party.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
                {character.claimedByLabel ? ` - claimed by ${character.claimedByLabel}` : ""}
              </option>
            ))}
          </select>

          <div className="claim-actions">
            <button
              disabled={!selectedCharacterId || claimBusy}
              onClick={() => void claimCharacter()}
              type="button"
            >
              {claimBusy ? "Saving..." : "Claim character"}
            </button>
            <button
              className="secondary-button"
              disabled={!claimedCharacter || claimBusy}
              onClick={() => void releaseCharacter()}
              type="button"
            >
              Release
            </button>
          </div>

          {selectedCharacter ? (
            <div className="character-card">
              <h3>{selectedCharacter.name}</h3>
              <p>{selectedCharacter.classLabel}</p>
              <div className="stats-row">
                <span>
                  HP {selectedCharacter.hp.current}/{selectedCharacter.hp.max}
                </span>
                <span>AC {selectedCharacter.armorClass}</span>
              </div>
              <div className="tag-row">
                {selectedCharacter.conditions.length > 0 ? (
                  selectedCharacter.conditions.map((condition) => (
                    <span key={condition} className="tag-chip">
                      {condition}
                    </span>
                  ))
                ) : (
                  <span className="tag-chip muted-chip">No conditions</span>
                )}
              </div>
              <div className="detail-block">
                <p className="detail-label">Resources</p>
                <div className="resource-list">
                  {selectedCharacter.resources.map((resource) => (
                    <div className="resource-row" key={resource.id}>
                      <span>{resource.label}</span>
                      <strong>
                        {resource.current}/{resource.max}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="detail-block">
                <p className="detail-label">Inventory</p>
                <div className="inventory-list">
                  {selectedCharacter.inventory.map((item) => (
                    <div className="inventory-row" key={item.id}>
                      <span>
                        {item.name}
                        {item.detail ? ` - ${item.detail}` : ""}
                      </span>
                      <strong>x{item.quantity}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <p className="note">{selectedCharacter.notes[0]}</p>
              <p className="claim-status">
                {selectedCharacter.claimedByClientId === clientId
                  ? "Claimed by this device"
                  : selectedCharacter.claimedByLabel
                    ? `Claimed by ${selectedCharacter.claimedByLabel}`
                    : "Not claimed yet"}
              </p>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <form className="roll-form" onSubmit={submitRoll}>
            <label className="label" htmlFor="roll-note">
              Roll
            </label>
            <input
              id="roll-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <label className="label" htmlFor="roll-dice">
              Dice
            </label>
            <input
              id="roll-dice"
              value={dice}
              onChange={(event) => setDice(event.target.value)}
              placeholder="d20"
            />
            <label className="label" htmlFor="roll-modifier">
              Modifier
            </label>
            <input
              id="roll-modifier"
              type="number"
              value={modifier}
              onChange={(event) => setModifier(Number(event.target.value))}
            />
            <div className="roll-toggle-row">
              <button type="button" className={advantage === true ? "active" : ""} onClick={() => setAdvantage(advantage === true ? null : true)}>
                ADV
              </button>
              <button type="button" className={advantage === null ? "active" : ""} onClick={() => setAdvantage(null)}>
                NORM
              </button>
              <button type="button" className={advantage === false ? "active" : ""} onClick={() => setAdvantage(advantage === false ? null : false)}>
                DIS
              </button>
            </div>
            <button disabled={!claimedCharacter || submitting} type="submit">
              {submitting ? "Rolling..." : `Roll ${dice}${advantage !== null ? (advantage ? " (adv)" : " (dis)") : ""}`}
            </button>
          </form>
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
      </section>
    </main>
  );
}
