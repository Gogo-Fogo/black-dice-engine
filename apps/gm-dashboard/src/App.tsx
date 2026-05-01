import { useEffect, useState } from "react";
import QRCode from "qrcode";

type RuntimeStatus = {
  id: string;
  status: "ok" | "degraded" | "offline" | "maintenance";
  mode: "fast" | "scene" | "cinematic" | "prep" | "offline";
  updatedAt: string;
  services: Array<{
    name: string;
    status: "ok" | "degraded" | "offline" | "unknown";
    latencyMs?: number;
    message?: string;
  }>;
  clients: Array<{
    id: string;
    role: "gm" | "player" | "spectator" | "ai" | "admin";
    clientId: string;
    status: "active" | "stale";
    connectedAt: string;
    lastSeenAt: string;
    playerLabel: string | null;
    claimedCharacterName: string | null;
  }>;
  warnings?: string[];
};

type Character = {
  id: string;
  name: string;
  classLabel: string;
  hp: { current: number; max: number };
  armorClass: number;
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
  rolled: number;
  total: number;
  note: string;
  timestamp: string;
};

type TableEventRecord = {
  id: string;
  category: "roll" | "state" | "claim";
  type:
    | "roll_recorded"
    | "hp_changed"
    | "resource_changed"
    | "condition_added"
    | "condition_removed"
    | "character_claimed"
    | "character_released"
    | "proposal_approved"
    | "proposal_rejected";
  actor: {
    id: string;
    kind: "gm" | "player" | "system" | "ai_assistant";
    label: string;
  };
  visibility: "gm_only" | "player_visible" | "public_demo";
  timestamp: string;
  summary: string;
  payload: Record<string, unknown>;
};

type StateEventProposal = {
  id: string;
  createdAt: string;
  summary: string;
  submittedBy: {
    id: string;
    kind: "gm" | "player" | "system" | "ai_assistant";
    label: string;
  };
  event: StateEventDraft;
};

type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  party: Character[];
  rollLog: RollRecord[];
  eventLog: TableEventRecord[];
  approvalQueue: StateEventProposal[];
};

type SocketEnvelope =
  | { type: "connected"; payload: { runtimeStatus: RuntimeStatus; sessionSnapshot: SessionSnapshot } }
  | { type: "runtime_status"; payload: RuntimeStatus }
  | { type: "roll_recorded"; payload: RollRecord }
  | { type: "session_snapshot"; payload: SessionSnapshot };

function formatRelativeTime(value: string) {
  const elapsedMs = Date.now() - new Date(value).getTime();
  const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  return `${elapsedMinutes}m ago`;
}

type StateEventRequest =
  | {
      type: "hp_delta";
      characterId: string;
      amount: number;
      requestId: string;
    }
  | {
      type: "condition_add";
      characterId: string;
      condition: string;
      requestId: string;
    }
  | {
      type: "condition_remove";
      characterId: string;
      condition: string;
      requestId: string;
    }
  | {
      type: "resource_set";
      characterId: string;
      resourceId: string;
      value: number;
      requestId: string;
    };

type StateEventDraft =
  | {
      type: "hp_delta";
      characterId: string;
      amount: number;
    }
  | {
      type: "condition_add";
      characterId: string;
      condition: string;
    }
  | {
      type: "condition_remove";
      characterId: string;
      condition: string;
    }
  | {
      type: "resource_set";
      characterId: string;
      resourceId: string;
      value: number;
    };

const pendingRequestStorageKey = "black-dice-engine-pending-requests";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatVisibilityLabel(value: TableEventRecord["visibility"]) {
  switch (value) {
    case "gm_only":
      return "GM only";
    case "public_demo":
      return "Public demo";
    default:
      return "Table visible";
  }
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

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [conditionDrafts, setConditionDrafts] = useState<Record<string, string>>({});
  const [queueApprovalMode, setQueueApprovalMode] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  async function exportSessionSummary() {
    setExportStatus("exporting");

    try {
      const response = await fetch("/api/session-summary.md");

      if (!response.ok) {
        setExportStatus("failed");
        return;
      }

      const markdown = await response.text();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch?.[1] ?? "black-dice-engine-session-summary.md";
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setExportStatus("ready");
    } catch {
      setExportStatus("failed");
    }
  }

  async function submitStateEvent(
    event: StateEventDraft,
    fingerprint: string,
    actionKey: string,
    options?: { clearConditionDraftFor?: string }
  ) {
    setPendingActionKey(actionKey);
    const requestId = getOrCreatePendingRequestId(fingerprint);

    try {
      const endpoint = queueApprovalMode ? "/api/state-events/propose" : "/api/state-events";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...event,
          requestId,
          submittedBy: queueApprovalMode
            ? {
                id: "gm-dashboard",
                kind: "gm",
                label: "GM Dashboard"
              }
            : undefined
        })
      });

      if (!response.ok) {
        return;
      }

      const json = (await response.json()) as { sessionSnapshot: SessionSnapshot };
      setSnapshot(json.sessionSnapshot);
      clearPendingRequestId(fingerprint);

      if (options?.clearConditionDraftFor) {
        const characterId = options.clearConditionDraftFor;
        setConditionDrafts((current) => ({
          ...current,
          [characterId]: ""
        }));
      }
    } finally {
      setPendingActionKey("");
    }
  }

  async function resolveProposal(proposalId: string, action: "approve" | "reject") {
    setPendingActionKey(`${action}-${proposalId}`);
    try {
      const response = await fetch(`/api/state-events/${proposalId}/${action}`, {
        method: "POST"
      });

      if (!response.ok) {
        return;
      }

      const json = (await response.json()) as { sessionSnapshot: SessionSnapshot };
      setSnapshot(json.sessionSnapshot);
    } finally {
      setPendingActionKey("");
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const [runtimeResponse, snapshotResponse] = await Promise.all([
        fetch("/api/runtime-status"),
        fetch("/api/session-snapshot")
      ]);

      const runtimeJson = (await runtimeResponse.json()) as RuntimeStatus;
      const snapshotJson = (await snapshotResponse.json()) as SessionSnapshot;

      if (!isMounted) {
        return;
      }

      setRuntime(runtimeJson);
      setSnapshot(snapshotJson);
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function buildQrCode() {
      if (!snapshot?.joinUrl) {
        setQrCodeUrl("");
        return;
      }

      const dataUrl = await QRCode.toDataURL(snapshot.joinUrl, {
        margin: 1,
        width: 220,
        color: {
          dark: "#f6e8c8",
          light: "#0d0b09"
        }
      });

      if (mounted) {
        setQrCodeUrl(dataUrl);
      }
    }

    void buildQrCode();

    return () => {
      mounted = false;
    };
  }, [snapshot?.joinUrl]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
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
      socket = new WebSocket(`${protocol}://${window.location.host}/ws?role=gm`);

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
        const message = JSON.parse(event.data) as SocketEnvelope;

        if (message.type === "connected") {
          setRuntime(message.payload.runtimeStatus);
          setSnapshot(message.payload.sessionSnapshot);
          return;
        }

        if (message.type === "runtime_status") {
          setRuntime(message.payload);
          return;
        }

        if (message.type === "roll_recorded") {
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  rollLog: [message.payload, ...current.rollLog].slice(0, 12)
                }
              : current
          );
          return;
        }

        if (message.type === "session_snapshot") {
          setSnapshot(message.payload);
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

  return (
    <main className="dashboard-shell">
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
              <strong>{snapshot?.currentScene ?? "Loading..."}</strong>
            </div>
            <div>
              <span>Socket</span>
              <strong>{connectionLabel}</strong>
            </div>
          </div>
        </div>
        <div className="hero-note">
          <span>Join path</span>
          <strong>{snapshot?.joinUrl ?? "Waiting for server..."}</strong>
          <p>Table PIN: {snapshot?.tablePin ?? "----"}</p>
          <button className="export-button" onClick={() => void exportSessionSummary()} type="button">
            Export Session Markdown
          </button>
          {exportStatus ? (
            <p className="export-note">
              {exportStatus === "exporting"
                ? "Preparing Markdown export..."
                : exportStatus === "ready"
                  ? "Session summary downloaded."
                  : "Export failed."}
            </p>
          ) : null}
          {qrCodeUrl ? <img className="qr-preview" src={qrCodeUrl} alt="Player join QR code" /> : null}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Runtime Status</h2>
            <span className={`pill pill-${runtime?.status ?? "offline"}`}>
              {runtime?.status ?? "offline"}
            </span>
          </div>
          <p className="muted-line">Mode: {runtime?.mode ?? "offline"}</p>
          <ul className="service-list">
            {runtime?.services.map((service) => (
              <li key={service.name}>
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.message ?? "Ready"}</span>
                </div>
                <span>{service.status}</span>
              </li>
            )) ?? <li>Waiting for runtime service data.</li>}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Presence</h2>
            <span>{runtime?.clients.length ?? 0} clients</span>
          </div>
          <div className="presence-list">
            {runtime?.clients.map((client) => (
              <div className="presence-row" key={client.id}>
                <div>
                  <strong>
                    {client.playerLabel ?? client.role}
                    {client.claimedCharacterName ? ` - ${client.claimedCharacterName}` : ""}
                  </strong>
                  <p>
                    {client.role} · last seen {formatRelativeTime(client.lastSeenAt)}
                  </p>
                </div>
                <span className={`presence-pill presence-${client.status}`}>{client.status}</span>
              </div>
            )) ?? <p>Waiting for connected clients.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Party State</h2>
            <span>{snapshot?.party.length ?? 0} linked</span>
          </div>
          <label className="mode-toggle">
            <input
              checked={queueApprovalMode}
              onChange={(event) => setQueueApprovalMode(event.target.checked)}
              type="checkbox"
            />
            <span>Queue risky state changes for approval</span>
          </label>
          <div className="party-list">
            {snapshot?.party.map((character) => (
              <div key={character.id} className="party-card">
                <div>
                  <h3>{character.name}</h3>
                  <p>{character.classLabel}</p>
                </div>
                <div className="party-stats">
                  <span>
                    HP {character.hp.current}/{character.hp.max}
                  </span>
                  <span>AC {character.armorClass}</span>
                </div>
                <div className="tag-row">
                  {character.conditions.length > 0 ? (
                    character.conditions.map((condition) => (
                      <span key={condition} className="tag-chip">
                        {condition}
                      </span>
                    ))
                  ) : (
                    <span className="tag-chip muted-chip">No conditions</span>
                  )}
                </div>
                <div className="party-detail-grid">
                  <div>
                    <p className="detail-label">Resources</p>
                    <ul className="detail-list">
                      {character.resources.map((resource) => (
                        <li key={resource.id}>
                          <span>{resource.label}</span>
                          <div className="detail-actions">
                            <strong>
                              {resource.current}/{resource.max}
                            </strong>
                            <div className="stepper-row">
                              <button
                                className="mini-button"
                                disabled={pendingActionKey !== ""}
                                onClick={() =>
                                  void submitStateEvent(
                                    {
                                      type: "resource_set",
                                      characterId: character.id,
                                      resourceId: resource.id,
                                      value: resource.current - 1
                                    },
                                    `resource:${character.id}:${resource.id}:${resource.current - 1}`,
                                    `resource-dec-${character.id}-${resource.id}`
                                  )
                                }
                                type="button"
                              >
                                -
                              </button>
                              <button
                                className="mini-button"
                                disabled={pendingActionKey !== ""}
                                onClick={() =>
                                  void submitStateEvent(
                                    {
                                      type: "resource_set",
                                      characterId: character.id,
                                      resourceId: resource.id,
                                      value: resource.current + 1
                                    },
                                    `resource:${character.id}:${resource.id}:${resource.current + 1}`,
                                    `resource-inc-${character.id}-${resource.id}`
                                  )
                                }
                                type="button"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="detail-label">Inventory</p>
                    <ul className="detail-list">
                      {character.inventory.map((item) => (
                        <li key={item.id}>
                          <span>{item.name}</span>
                          <strong>x{item.quantity}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="gm-action-grid">
                  <div className="action-panel">
                    <p className="detail-label">HP Controls</p>
                    <div className="quick-action-row">
                      <button
                        className="mini-button"
                        disabled={pendingActionKey !== ""}
                        onClick={() =>
                          void submitStateEvent(
                            { type: "hp_delta", characterId: character.id, amount: -1 },
                            `hp:${character.id}:-1`,
                            `hp-1-${character.id}`
                          )
                        }
                        type="button"
                      >
                        -1
                      </button>
                      <button
                        className="mini-button"
                        disabled={pendingActionKey !== ""}
                        onClick={() =>
                          void submitStateEvent(
                            { type: "hp_delta", characterId: character.id, amount: -5 },
                            `hp:${character.id}:-5`,
                            `hp-5-${character.id}`
                          )
                        }
                        type="button"
                      >
                        -5
                      </button>
                      <button
                        className="mini-button"
                        disabled={pendingActionKey !== ""}
                        onClick={() =>
                          void submitStateEvent(
                            { type: "hp_delta", characterId: character.id, amount: 1 },
                            `hp:${character.id}:1`,
                            `hp+1-${character.id}`
                          )
                        }
                        type="button"
                      >
                        +1
                      </button>
                      <button
                        className="mini-button"
                        disabled={pendingActionKey !== ""}
                        onClick={() =>
                          void submitStateEvent(
                            { type: "hp_delta", characterId: character.id, amount: 5 },
                            `hp:${character.id}:5`,
                            `hp+5-${character.id}`
                          )
                        }
                        type="button"
                      >
                        +5
                      </button>
                    </div>
                  </div>

                  <div className="action-panel">
                    <p className="detail-label">Condition Controls</p>
                    <div className="condition-entry-row">
                      <input
                        className="inline-input"
                        onChange={(event) =>
                          setConditionDrafts((current) => ({
                            ...current,
                            [character.id]: event.target.value
                          }))
                        }
                        placeholder="Add condition"
                        value={conditionDrafts[character.id] ?? ""}
                      />
                      <button
                        className="mini-button"
                        disabled={pendingActionKey !== "" || !(conditionDrafts[character.id] ?? "").trim()}
                        onClick={() =>
                          void submitStateEvent(
                            {
                              type: "condition_add",
                              characterId: character.id,
                              condition: (conditionDrafts[character.id] ?? "").trim()
                            },
                            `condition-add:${character.id}:${(conditionDrafts[character.id] ?? "").trim()}`,
                            `condition-add-${character.id}`,
                            { clearConditionDraftFor: character.id }
                          )
                        }
                        type="button"
                      >
                        Add
                      </button>
                    </div>
                    {character.conditions.length > 0 ? (
                      <div className="removal-chip-row">
                        {character.conditions.map((condition) => (
                          <button
                            className="tag-chip removable-chip"
                            disabled={pendingActionKey !== ""}
                            key={`${character.id}-${condition}`}
                            onClick={() =>
                              void submitStateEvent(
                                {
                                  type: "condition_remove",
                                  characterId: character.id,
                                  condition
                                },
                                `condition-remove:${character.id}:${condition}`,
                                `condition-remove-${character.id}-${condition}`
                              )
                            }
                            type="button"
                          >
                            {condition} x
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <p className="party-note">{character.notes[0]}</p>
                <p className="claim-note">
                  {character.claimedByLabel ? `Claimed by ${character.claimedByLabel}` : "Unclaimed"}
                </p>
              </div>
            )) ?? <p>No party state yet.</p>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Approval Queue</h2>
            <span>{snapshot?.approvalQueue.length ?? 0} waiting</span>
          </div>
          <div className="approval-list">
            {snapshot?.approvalQueue.length ? (
              snapshot.approvalQueue.map((proposal) => (
                <div className="approval-row" key={proposal.id}>
                  <div>
                    <strong>{proposal.summary}</strong>
                    <p>
                      queued by {proposal.submittedBy.label} · {formatTime(proposal.createdAt)}
                    </p>
                  </div>
                  <div className="approval-actions">
                    <button
                      className="mini-button"
                      disabled={pendingActionKey !== ""}
                      onClick={() => void resolveProposal(proposal.id, "approve")}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      className="mini-button secondary-button"
                      disabled={pendingActionKey !== ""}
                      onClick={() => void resolveProposal(proposal.id, "reject")}
                      type="button"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>No queued state changes.</p>
            )}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Live Roll Log</h2>
            <span>In-memory truth</span>
          </div>
          <div className="roll-log">
            {snapshot?.rollLog.map((roll) => (
              <div key={roll.id} className="roll-row">
                <div>
                  <strong>{roll.actorName}</strong>
                  <p>{roll.note}</p>
                </div>
                <div className="roll-values">
                  <span>{roll.dice}</span>
                  <strong>{roll.total}</strong>
                  <small>{formatTime(roll.timestamp)}</small>
                </div>
              </div>
            )) ?? <p>Waiting for the first roll.</p>}
          </div>
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Table Event History</h2>
            <span>{snapshot?.eventLog.length ?? 0} recent events</span>
          </div>
          <div className="event-log">
            {snapshot?.eventLog.map((entry) => (
              <div key={entry.id} className="event-row">
                <div>
                  <strong>{entry.summary}</strong>
                  <p>
                    {entry.actor.label} · {formatVisibilityLabel(entry.visibility)}
                  </p>
                </div>
                <div className="event-meta">
                  <span className={`event-pill event-${entry.category}`}>{entry.category}</span>
                  <small>{formatTime(entry.timestamp)}</small>
                </div>
              </div>
            )) ?? <p>Waiting for the first state change.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}
