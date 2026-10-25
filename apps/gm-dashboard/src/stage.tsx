import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The Stage is the couch-facing view: scene art beside large narration text.
// It renders inside the dashboard's Stage tab, or alone in a second window
// (?view=stage) that can be dragged to the TV and made fullscreen.

type StageCharacter = {
  id: string;
  name: string;
  classLabel: string;
  hp: { current: number; max: number };
  armorClass: number;
  conditions: string[];
  image?: string | null;
  claimedByLabel: string | null;
};

type StageRoll = {
  id: string;
  actorId: string;
  actorName: string;
  dice: string;
  rolled: number | number[];
  total: number;
  note: string;
  timestamp: string;
};

type StageAction = { type: string; description: string; ability: string; dc: number | null };

export type StageSnapshot = {
  campaignTitle: string;
  currentScene: string;
  party: StageCharacter[];
  rollLog: StageRoll[];
  currentAction?: StageAction | null;
};

type SceneImage = { filename: string; url: string; mtime?: number };

const abilityNames: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
};

const GENERATION_TIMEOUT_MS = 120_000;

// --- Scene art ------------------------------------------------------------------------

export type SceneArt = {
  images: SceneImage[];
  latest: SceneImage | null;
  generating: { title: string; since: number } | null;
  /** True when generation timed out, so the art on screen may belong to an earlier scene. */
  stale: boolean;
};

export function useSceneArt(currentScene: string | undefined): SceneArt {
  const [images, setImages] = useState<SceneImage[]>([]);
  const [generating, setGenerating] = useState<{ title: string; since: number; baseline: string | null } | null>(null);
  const [stale, setStale] = useState(false);
  const lastScene = useRef<string | undefined>(undefined);
  const latestRef = useRef<string | null>(null);

  // A scene change kicks off ComfyUI on the server; treat it as "painting" until a new file lands.
  useEffect(() => {
    if (!currentScene) return;
    if (lastScene.current !== undefined && lastScene.current !== currentScene) {
      setGenerating({ title: currentScene, since: Date.now(), baseline: latestRef.current });
      setStale(false);
    }
    lastScene.current = currentScene;
  }, [currentScene]);

  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/images");
        if (!res.ok) return;
        const data = (await res.json()) as { images?: SceneImage[] };
        if (!mounted) return;
        const next = data.images ?? [];
        setImages((current) =>
          current.length === next.length && current.every((img, i) => img.filename === next[i].filename) ? current : next
        );
        latestRef.current = next[0]?.filename ?? null;
      } catch {
        // server unreachable; keep showing what we have
      }
    }
    void poll();
    const interval = window.setInterval(poll, generating ? 2000 : 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [generating]);

  useEffect(() => {
    if (!generating) return;
    if (images[0] && images[0].filename !== generating.baseline) {
      setGenerating(null);
      return;
    }
    const remaining = generating.since + GENERATION_TIMEOUT_MS - Date.now();
    const timer = window.setTimeout(() => {
      setGenerating(null);
      setStale(true);
    }, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [generating, images]);

  return {
    images,
    latest: images[0] ?? null,
    generating: generating ? { title: generating.title, since: generating.since } : null,
    stale
  };
}

// --- Narration ------------------------------------------------------------------------

export type Narration = {
  text: string;
  speaking: boolean;
  /** 0..1 through the spoken audio, used to highlight words as they are read. */
  progress: number;
  audioReady: boolean;
  ttsUnavailable: boolean;
  unlockAudio: () => void;
  speak: (text?: string) => Promise<void>;
};

export function useNarration({ autoSpeak }: { autoSpeak: boolean }): Narration {
  const [text, setText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [ttsUnavailable, setTtsUnavailable] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const speakingRef = useRef(false);
  const lastSeen = useRef<string | null>(null);
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;

  const unlockAudio = useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      void ctxRef.current.resume().then(() => setAudioReady(true));
    } catch {
      setAudioReady(true);
    }
  }, []);

  const speak = useCallback(async (override?: string) => {
    const spoken = (override ?? "").trim();
    if (!spoken || speakingRef.current) return;
    setText(spoken);
    speakingRef.current = true;
    setSpeaking(true);
    setProgress(0);
    const finish = () => {
      speakingRef.current = false;
      setSpeaking(false);
      setProgress(1);
    };
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bde-role": "gm" },
        body: JSON.stringify({ text: spoken.length > 500 ? `${spoken.slice(0, 500)}...` : spoken })
      });
      if (!res.ok) {
        setTtsUnavailable(true);
        finish();
        return;
      }
      setTtsUnavailable(false);
      const data = await res.arrayBuffer();
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const buffer = await ctx.decodeAudioData(data);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const startedAt = ctx.currentTime;
      let frame = 0;
      const tick = () => {
        setProgress(Math.min(1, (ctx.currentTime - startedAt) / buffer.duration));
        frame = requestAnimationFrame(tick);
      };
      source.onended = () => {
        cancelAnimationFrame(frame);
        finish();
      };
      source.start();
      tick();
    } catch {
      setTtsUnavailable(true);
      finish();
    }
  }, []);

  // New narration from the server: show it, and read it aloud when this screen owns the voice.
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/pending-narration");
        if (!res.ok) return;
        const data = (await res.json()) as { text?: string; timestamp?: number } | null;
        if (!mounted || !data?.text) return;
        const key = `${data.timestamp ?? ""}:${data.text}`;
        if (key === lastSeen.current) return;
        const firstLoad = lastSeen.current === null;
        lastSeen.current = key;
        if (!firstLoad && autoSpeakRef.current && !speakingRef.current) {
          void speak(data.text);
        } else if (!speakingRef.current) {
          setText(data.text);
          setProgress(1);
        }
      } catch {
        // ignore
      }
    }
    void poll();
    const interval = window.setInterval(poll, 2500);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [speak]);

  return { text, speaking, progress, audioReady, ttsUnavailable, unlockAudio, speak };
}

// --- TV window presence ---------------------------------------------------------------

const channelName = "bde-stage";

/** The TV window announces itself so the dashboard doesn't read narration aloud twice. */
export function useAnnounceStageWindow() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(channelName);
    const send = () => channel.postMessage({ type: "stage-alive" });
    send();
    const interval = window.setInterval(send, 2000);
    const bye = () => channel.postMessage({ type: "stage-closed" });
    window.addEventListener("beforeunload", bye);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", bye);
      bye();
      channel.close();
    };
  }, []);
}

export function useStageWindowOpen() {
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event) => {
      if (event.data?.type === "stage-alive") setLastSeen(Date.now());
      if (event.data?.type === "stage-closed") setLastSeen(0);
    };
    const interval = window.setInterval(() => setNow(Date.now()), 2000);
    return () => {
      channel.close();
      window.clearInterval(interval);
    };
  }, []);
  return now - lastSeen < 5000;
}

export function openStageWindow() {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "stage");
  url.hash = "";
  window.open(url.toString(), "bde-stage", "popup,width=1600,height=900");
}

// --- Presentational pieces ------------------------------------------------------------

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, "")[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function hpTone(hp: { current: number; max: number }) {
  const ratio = hp.max > 0 ? hp.current / hp.max : 0;
  if (hp.current <= 0 || ratio <= 0.25) return "critical";
  if (ratio <= 0.6) return "wounded";
  return "healthy";
}

function ArtFrame({ art }: { art: SceneArt }) {
  // Keep the previous image underneath so a new one fades in rather than popping.
  const [layers, setLayers] = useState<SceneImage[]>([]);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!art.latest || failed.has(art.latest.url)) return;
    setLayers((current) =>
      current[current.length - 1]?.url === art.latest!.url ? current : [...current.slice(-1), art.latest!]
    );
  }, [art.latest, failed]);

  useEffect(() => {
    if (!art.generating) return;
    const tick = () => setElapsed(Math.floor((Date.now() - art.generating!.since) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [art.generating]);

  const hasArt = layers.length > 0;

  return (
    <div className={`stage-art ${art.generating ? "is-generating" : ""}`}>
      {layers.map((layer, index) => (
        <img
          key={layer.url}
          className={`stage-art-img ${index === layers.length - 1 ? "top" : ""}`}
          src={layer.url}
          alt=""
          onError={() => {
            setFailed((current) => new Set(current).add(layer.url));
            setLayers((current) => current.filter((l) => l.url !== layer.url));
          }}
        />
      ))}

      {!hasArt && !art.generating ? (
        <div className="stage-art-empty">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" />
            <path d="M12 2.5v6.3m0 0L3.5 16.6M12 8.8l8.5 7.8M3.5 16.6h17" />
          </svg>
          <p>Scene art appears here when the GM sets a scene.</p>
        </div>
      ) : null}

      {art.generating ? (
        <div className="stage-generating" role="status" aria-live="polite">
          <div className="stage-generating-sheen" aria-hidden="true" />
          <div className="stage-generating-card">
            <span className="stage-brush" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p className="stage-generating-label">Painting the scene</p>
            <p className="stage-generating-title">{art.generating.title}</p>
            <p className="stage-generating-time">{elapsed}s</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NarrationText({ narration, scene }: { narration: Narration; scene: string }) {
  const words = useMemo(() => narration.text.split(/(\s+)/).filter(Boolean), [narration.text]);
  const wordCount = words.filter((w) => !/^\s+$/.test(w)).length;
  const spokenCount = narration.speaking ? Math.floor(narration.progress * wordCount) : wordCount;
  const size = narration.text.length > 420 ? "long" : narration.text.length > 220 ? "medium" : "short";

  if (!narration.text) {
    return <p className="stage-narration placeholder">The story continues at {scene || "the table"}…</p>;
  }

  let wordIndex = 0;
  return (
    <p className={`stage-narration ${size} ${narration.speaking ? "is-speaking" : ""}`} key={narration.text}>
      {words.map((word, i) => {
        if (/^\s+$/.test(word)) return word;
        const spoken = wordIndex < spokenCount;
        wordIndex += 1;
        return (
          <span key={i} className={spoken ? "w spoken" : "w"}>
            {word}
          </span>
        );
      })}
    </p>
  );
}

function RollCall({ action, snapshot }: { action: StageAction; snapshot: StageSnapshot }) {
  const claimed = snapshot.party.filter((c) => c.claimedByLabel);
  const recent = snapshot.rollLog.filter(
    (r) => r.note === action.type && Date.now() - new Date(r.timestamp).getTime() < 15 * 60_000
  );
  return (
    <div className="stage-rollcall">
      <p className="stage-kicker">Roll for it</p>
      <p className="stage-rollcall-title">
        {action.type}
        {action.dc !== null ? <span className="stage-dc">DC {action.dc}</span> : null}
      </p>
      <p className="stage-rollcall-sub">{abilityNames[action.ability] ?? action.ability}</p>
      {claimed.length ? (
        <div className="stage-rollcall-party">
          {claimed.map((c) => {
            const roll = recent.find((r) => r.actorId === c.id);
            return (
              <span key={c.id} className={`stage-rollcall-chip ${roll ? "done" : ""}`}>
                {c.name.split(" ")[0]}
                <b>{roll ? roll.total : "…"}</b>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PartyStrip({ party }: { party: StageCharacter[] }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const shown = party.filter((c) => c.claimedByLabel).length ? party.filter((c) => c.claimedByLabel) : party;
  return (
    <div className="stage-party">
      {shown.map((c) => {
        const pct = c.hp.max > 0 ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;
        return (
          <div key={c.id} className="stage-member">
            <span className="stage-portrait">
              {c.image && !broken.has(c.image) ? (
                <img src={c.image} alt="" onError={() => setBroken((s) => new Set(s).add(c.image!))} />
              ) : (
                initials(c.name)
              )}
            </span>
            <span className="stage-member-body">
              <span className="stage-member-name">{c.name}</span>
              <span className={`stage-hp ${hpTone(c.hp)}`}>
                <span style={{ width: `${pct}%` }} />
              </span>
              <span className="stage-member-meta">
                {c.hp.current}/{c.hp.max} HP{c.conditions.length ? ` · ${c.conditions.join(", ")}` : ""}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RollBanner({ roll, onDone }: { roll: StageRoll; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 6000);
    return () => window.clearTimeout(timer);
  }, [roll.id, onDone]);
  const natural = Array.isArray(roll.rolled) ? roll.rolled : [roll.rolled];
  const d20 = /d20/.test(roll.dice) && natural.length === 1;
  const flag = d20 && natural[0] === 20 ? "crit" : d20 && natural[0] === 1 ? "fumble" : "";
  return (
    <div className={`stage-roll-banner ${flag}`} role="status" aria-live="polite" key={roll.id}>
      <span className="stage-roll-who">
        {roll.actorName}
        <small>
          {roll.note} · {roll.dice}
        </small>
      </span>
      <span className="stage-roll-total">{roll.total}</span>
      {flag ? <span className="stage-roll-flag">{flag === "crit" ? "Natural 20" : "Natural 1"}</span> : null}
    </div>
  );
}

// --- Stage ----------------------------------------------------------------------------

export function Stage({
  snapshot,
  art,
  narration,
  latestRoll,
  onRollShown,
  fullscreen
}: {
  snapshot: StageSnapshot | null;
  art: SceneArt;
  narration: Narration;
  latestRoll: StageRoll | null;
  onRollShown: () => void;
  fullscreen?: boolean;
}) {
  const action = snapshot?.currentAction ?? null;
  return (
    <div className={`stage ${fullscreen ? "stage-full" : ""}`}>
      <ArtFrame art={art} />
      <div className="stage-text">
        <div className="stage-heading">
          <p className="stage-kicker">{snapshot?.campaignTitle ?? "Black Dice Engine"}</p>
          <h1 className="stage-scene">{snapshot?.currentScene ?? "Waiting for the table…"}</h1>
        </div>
        <div className="stage-narration-wrap">
          <NarrationText narration={narration} scene={snapshot?.currentScene ?? ""} />
        </div>
        {action && snapshot ? <RollCall action={action} snapshot={snapshot} /> : null}
      </div>
      {snapshot?.party.length ? <PartyStrip party={snapshot.party} /> : null}
      {latestRoll ? <RollBanner roll={latestRoll} onDone={onRollShown} /> : null}
    </div>
  );
}

// --- Standalone TV window ---------------------------------------------------------------

export function StageApp() {
  const [snapshot, setSnapshot] = useState<StageSnapshot | null>(null);
  const [latestRoll, setLatestRoll] = useState<StageRoll | null>(null);
  const [started, setStarted] = useState(false);
  const [idle, setIdle] = useState(false);
  const [online, setOnline] = useState(true);
  const art = useSceneArt(snapshot?.currentScene);
  const narration = useNarration({ autoSpeak: started });
  useAnnounceStageWindow();

  useEffect(() => {
    document.title = "Black Dice · Table";
    fetch("/api/session-snapshot")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSnapshot(data as StageSnapshot))
      .catch(() => setOnline(false));
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let active = true;
    let socket: WebSocket | null = null;
    let retry: number | null = null;
    function connect() {
      if (!active) return;
      socket = new WebSocket(`${protocol}://${window.location.host}/ws?role=spectator`);
      socket.addEventListener("open", () => setOnline(true));
      socket.addEventListener("close", () => {
        setOnline(false);
        if (active) retry = window.setTimeout(connect, 2000);
      });
      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "connected") setSnapshot(message.payload.sessionSnapshot);
          if (message.type === "session_snapshot") setSnapshot(message.payload);
          if (message.type === "roll_recorded") setLatestRoll(message.payload);
        } catch {
          // ignore malformed frames
        }
      });
    }
    connect();
    return () => {
      active = false;
      if (retry !== null) window.clearTimeout(retry);
      socket?.close();
    };
  }, []);

  // Hide the cursor and controls when nobody is touching the mouse.
  useEffect(() => {
    let timer = window.setTimeout(() => setIdle(true), 2500);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2500);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  function start() {
    narration.unlockAudio();
    setStarted(true);
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  return (
    <div className={`stage-window ${idle && started ? "idle" : ""}`}>
      <Stage
        snapshot={snapshot}
        art={art}
        narration={narration}
        latestRoll={latestRoll}
        onRollShown={() => setLatestRoll(null)}
        fullscreen
      />
      {!online ? <div className="stage-offline">Reconnecting to the table…</div> : null}
      {started ? (
        <div className="stage-window-controls">
          <button type="button" onClick={toggleFullscreen}>
            Fullscreen
          </button>
          <button type="button" disabled={narration.speaking || !narration.text} onClick={() => void narration.speak(narration.text)}>
            {narration.speaking ? "Reading…" : "Read again"}
          </button>
        </div>
      ) : (
        <button type="button" className="stage-start" onClick={start}>
          <span>Start table display</span>
          <small>Goes fullscreen and turns on the narrator voice</small>
        </button>
      )}
    </div>
  );
}
