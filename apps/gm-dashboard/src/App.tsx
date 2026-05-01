import { useEffect, useState } from "react";

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
  warnings?: string[];
};

type Character = {
  id: string;
  name: string;
  classLabel: string;
  hp: { current: number; max: number };
  armorClass: number;
  notes: string[];
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

type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  party: Character[];
  rollLog: RollRecord[];
};

type SocketEnvelope =
  | { type: "connected"; payload: { runtimeStatus: RuntimeStatus; sessionSnapshot: SessionSnapshot } }
  | { type: "runtime_status"; payload: RuntimeStatus }
  | { type: "roll_recorded"; payload: RollRecord }
  | { type: "session_snapshot"; payload: SessionSnapshot };

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("connecting");

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
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws?role=gm`);

    socket.addEventListener("open", () => {
      setConnectionLabel("connected");
    });

    socket.addEventListener("close", () => {
      setConnectionLabel("disconnected");
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

    return () => {
      socket.close();
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
            <h2>Party State</h2>
            <span>{snapshot?.party.length ?? 0} linked</span>
          </div>
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
                <p className="party-note">{character.notes[0]}</p>
              </div>
            )) ?? <p>No party state yet.</p>}
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
      </section>
    </main>
  );
}
