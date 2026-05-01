import { FormEvent, useEffect, useState } from "react";

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

type RollRequest = {
  actorId: string;
  actorName: string;
  modifier: number;
  note: string;
};

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
  const [modifier, setModifier] = useState(3);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const response = await fetch("/api/session-snapshot");
      const sessionSnapshot = (await response.json()) as SessionSnapshot;

      if (!mounted) {
        return;
      }

      setSnapshot(sessionSnapshot);
      setSelectedCharacterId(sessionSnapshot.party[0]?.id ?? "");
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws?role=player`);

    socket.addEventListener("open", () => {
      setConnectionLabel("connected");
    });

    socket.addEventListener("close", () => {
      setConnectionLabel("disconnected");
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as
        | { type: "connected"; payload: { sessionSnapshot: SessionSnapshot } }
        | { type: "session_snapshot"; payload: SessionSnapshot }
        | { type: "roll_recorded"; payload: RollRecord };

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

    return () => {
      socket.close();
    };
  }, []);

  const selectedCharacter =
    snapshot?.party.find((character) => character.id === selectedCharacterId) ?? null;

  async function submitRoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedCharacter) {
      return;
    }

    const payload: RollRequest = {
      actorId: selectedCharacter.id,
      actorName: selectedCharacter.name,
      modifier,
      note
    };

    setSubmitting(true);

    try {
      await fetch("/api/rolls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } finally {
      setSubmitting(false);
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
          <label className="label" htmlFor="character-select">
            Claimed character
          </label>
          <select
            id="character-select"
            value={selectedCharacterId}
            onChange={(event) => setSelectedCharacterId(event.target.value)}
          >
            {snapshot?.party.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>

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
              <p className="note">{selectedCharacter.notes[0]}</p>
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
            <label className="label" htmlFor="roll-modifier">
              Modifier
            </label>
            <input
              id="roll-modifier"
              type="number"
              value={modifier}
              onChange={(event) => setModifier(Number(event.target.value))}
            />
            <button disabled={!selectedCharacter || submitting} type="submit">
              {submitting ? "Rolling..." : "Roll d20"}
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
                  <p>{roll.note}</p>
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
