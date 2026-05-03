import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { startAmbient, stopAmbient, setAmbientVolume } from "./ambient";
import { DiceHandle, preloadDice, renderDiceOverlay } from "./dice3d";
import { playDiceRollSound } from "./diceSound";

preloadDice();

const _originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input.toString();
  if (url.startsWith("/api/")) {
    init = init || {};
    const headers = new Headers(init.headers);
    headers.set("x-bde-role", "gm");
    init.headers = headers;
  }
  return _originalFetch(input, init);
};

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
  mediaPressure?: {
    level: "low" | "elevated" | "high";
    summary: string;
    reasons: string[];
    blockedJobTypes: MediaJob["type"][];
  };
  warnings?: string[];
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

type TableEventRecord = {
  id: string;
  category: "roll" | "state" | "claim" | "memory" | "media";
  type:
    | "roll_recorded"
    | "hp_changed"
    | "resource_changed"
    | "condition_added"
    | "condition_removed"
    | "character_claimed"
    | "character_released"
    | "proposal_approved"
    | "proposal_rejected"
    | "memory_entry_created"
    | "media_job_started"
    | "media_job_failed"
    | "media_metadata_recorded";
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

type MemoryEntry = {
  id: string;
  campaignId: string;
  sceneId?: string;
  sessionId?: string;
  kind:
    | "campaign_fact"
    | "scene_summary"
    | "session_summary"
    | "npc_fact"
    | "location_fact"
    | "faction_change"
    | "character_development"
    | "open_thread"
    | "resolved_thread"
    | "rules_note";
  visibility: "gm_only" | "player_visible" | "public_demo";
  status: "proposed" | "confirmed" | "rejected" | "superseded";
  summary: string;
  entities: string[];
  stateEventIds: string[];
  assetIds: string[];
  source: {
    kind: "session" | "scene" | "campaign_bible" | "import" | "manual" | "ai_summary";
    label: string;
    sourcePath?: string;
    license?: string;
    pageOrLocation?: string;
  };
  createdAt: string;
};

type CampaignFact = {
  id: string;
  text: string;
  source: string;
};

type CampaignBible = {
  id: string;
  title: string;
  subtitle: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  tone: string[];
  safety: {
    rating: string;
    lines: string[];
    veils: string[];
  };
  facts: CampaignFact[];
};

type CampaignLocation = {
  id: string;
  name: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  summary: string;
  features: string[];
};

type CampaignNpc = {
  id: string;
  name: string;
  role: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  motive: string;
  detail: string;
};

type ActiveSceneContext = {
  title: string;
  location: CampaignLocation | null;
  npcs: CampaignNpc[];
  facts: CampaignFact[];
  tone: string[];
  safety: CampaignBible["safety"];
};

type LocalModelAdapterDraft = {
  adapter: {
    mode: "placeholder";
    provider: "local_llm";
    endpointConfigured: boolean;
    endpoint: string | null;
  };
  request: {
    scenePacketId: string;
    sceneTitle: string;
    promptPreview: string;
    contextSummary: string;
    proposedStateEventCount: number;
    mediaRequestCount: number;
    audioCueCount: number;
  };
  response: {
    narration: string;
    gmNotes: string[];
    suggestedNextBeat: string;
    riskyStateChangeWarning: string | null;
  };
};

type DirectorModeAdapterDraft = {
  adapter: {
    mode: "placeholder";
    provider: "chatgpt_director";
    enabled: boolean;
    model: string | null;
  };
  request: {
    scenePacketId: string;
    sceneTitle: string;
    promptPreview: string;
    contextSummary: string;
    memoryEntryCount: number;
    pendingApprovalCount: number;
  };
  response: {
    directorGuidance: string;
    revealPlan: string[];
    canonizationNotes: string[];
    escalationWarning: string | null;
  };
};

type AiLogEntry = {
  id: string;
  kind: "input_packet" | "output_packet" | "tool_call" | "validation_failure";
  adapter: "scene_packet" | "local_model" | "director_mode";
  createdAt: string;
  summary: string;
  correlationId: string;
  details: Record<string, unknown>;
};

type ErrorEvent = {
  id: string;
  severity: "warning" | "error" | "critical";
  service: string;
  summary: string;
  message: string;
  recoveryHint: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  createdAt: string;
  resolvedAt?: string;
  correlationId?: string;
};

type MediaJob = {
  id: string;
  campaignId: string;
  sceneId?: string;
  type: "image" | "video" | "audio" | "upscale" | "interpolation" | "visual_canon";
  status: "draft" | "queued" | "running" | "generated" | "failed" | "rejected" | "archived";
  priority: "low" | "normal" | "high" | "session_break";
  visibility: "gm_only" | "player_visible" | "public_demo";
  prompt?: string;
  negativePrompt?: string;
  workflowId?: string;
  linkedAssetId?: string;
  runWhen: "now" | "background" | "session_break" | "manual";
  outputPath?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  settings: Record<string, unknown>;
  comfyRouterJobId?: string;
  comfyPromptId?: string;
};

type AudioTrack = {
  id: string;
  filename: string;
  relativePath: string;
  localPath: string;
  urlPath: string;
  kind: "music" | "ambience" | "stinger" | "unknown";
  tags: string[];
  durationSeconds?: number;
  notes?: string;
};

type PlaybackState = {
  status: "idle" | "playing" | "paused";
  currentTrackId: string | null;
  volume: number;
  muted: boolean;
  loop: boolean;
  startedAt: string | null;
  pausedAt: string | null;
};

type AssetRecord = {
  id: string;
  campaignId: string;
  sceneId?: string;
  kind: "image" | "video" | "audio" | "map" | "handout";
  visibility: "gm_only" | "player_visible" | "public_demo";
  status: "requested" | "approved" | "queued" | "generated" | "rejected" | "failed";
  prompt?: string;
  workflowId?: string;
  localPath?: string;
  metadata: Record<string, unknown>;
};

type CleanupPolicy = {
  failedJobArchiveAfterHours: number;
  draftJobArchiveAfterHours: number;
  rejectedJobArchiveAfterHours: number;
  protectedGeneratedAssetCount: number;
  notes: string[];
};

type CleanupCandidate = {
  kind: "media_job" | "asset_record";
  id: string;
  status: string;
  reason: string;
  recommendedAction: "archive_metadata" | "review_output" | "keep_final";
  workflowId?: string | null;
  localPath?: string | null;
  timestamp?: string | null;
};

type CleanupReport = {
  generatedAt: string;
  policy: CleanupPolicy;
  outputRoots: {
    mediaOutputRoot: string;
    repoExportsRoot: string;
  };
  summary: {
    trackedMediaJobs: number;
    trackedAssets: number;
    archiveCandidateCount: number;
    reviewCandidateCount: number;
    protectedFinalAssetCount: number;
  };
  archiveCandidates: CleanupCandidate[];
  reviewCandidates: CleanupCandidate[];
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

type ScenePacket = {
  id: string;
  campaignId: string;
  sceneTitle: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  summary: string;
  beats: Array<{
    kind: "description" | "choice" | "threat" | "clue" | "consequence";
    text: string;
  }>;
  proposedStateEvents: Array<{
    id: string;
    campaignId: string;
    type: "hp_changed" | "resource_changed" | "condition_added" | "condition_removed";
    actor: {
      id: string;
      kind: "gm" | "player" | "system" | "ai_assistant";
      label: string;
    };
    visibility: "gm_only" | "player_visible" | "public_demo";
    timestamp: string;
    payload: Record<string, unknown>;
  }>;
  mediaRequests: Array<Record<string, unknown>>;
  audioCues: Array<Record<string, unknown>>;
};

type ScenePacketValidation = {
  ok: boolean;
  errors: string[];
};

type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  campaignBible: CampaignBible;
  activeSceneContext: ActiveSceneContext;
  party: Character[];
  rollLog: RollRecord[];
  eventLog: TableEventRecord[];
  approvalQueue: StateEventProposal[];
  mediaJobs: MediaJob[];
  assetRecords: AssetRecord[];
  memoryEntries: MemoryEntry[];
  audioCueQueue: Array<{
    id: string;
    kind: string;
    status: string;
    visibility: string;
    trigger: string;
    tags: string[];
    loop: boolean;
    volume: number;
    fadeInSeconds: number;
    fadeOutSeconds: number;
    notes?: string;
    sceneId?: string;
    createdAt: string;
  }>;
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
    }
  | {
      type: "initiative_set";
      characterId: string;
      value: number | null;
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
    }
  | {
      type: "initiative_set";
      characterId: string;
      value: number | null;
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

function formatMemoryKind(value: MemoryEntry["kind"]) {
  return value.replace(/_/g, " ");
}

function formatMediaJobType(value: MediaJob["type"]) {
  return value.replace(/_/g, " ");
}

function formatAssetKind(value: AssetRecord["kind"]) {
  return value.replace(/_/g, " ");
}

function formatMediaJobStatus(value: MediaJob["status"]) {
  return value.replace(/_/g, " ");
}

function formatSimpleLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatInitiative(value: number | null) {
  if (value === null) return "--";
  return `Init ${value}`;
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

function extractYtId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function formatYtLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return `/${u.pathname.slice(1)}`;
    return u.searchParams.get("v") || url.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

function DiceOverlay({ roll, onClose }: { roll: RollRecord; onClose: () => void }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<DiceHandle | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [canThrow, setCanThrow] = useState(false);
  const [thrown, setThrown] = useState(false);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    try {
      handleRef.current = renderDiceOverlay(el, roll.dice, () => setShowResult(true));
    } catch {
      setShowResult(true);
    }
    const timer = setTimeout(() => setCanThrow(true), 1200);
    return () => {
      clearTimeout(timer);
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!showResult) return;
    const timer = setTimeout(onClose, 7000);
    return () => clearTimeout(timer);
  }, [showResult]);

  const doThrow = useCallback(() => {
    if (thrown) return;
    setThrown(true);
    playDiceRollSound();
    handleRef.current?.throwDice();
  }, [thrown]);

  return (
    <div className="dice-overlay">
      <div className="dice-overlay-bg" />
      <div className="dice-roll-card">
        <div className="dice-3d-container" ref={sceneRef} />
        {canThrow && !thrown ? (
          <button className="dice-throw-btn" onClick={(e) => { e.stopPropagation(); doThrow(); }}>
            CLICK TO THROW
          </button>
        ) : null}
        {showResult ? (
          <div className="dice-result-wrap" onClick={onClose}>
            <div className="dice-result-number">{roll.total}</div>
            <p className="dice-roll-who">{roll.actorName}</p>
            <p className="dice-roll-what">{roll.dice} — {roll.note}</p>
            <p className="dice-roll-tap">click to close</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useAdvancedMode() {
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
  const { advancedMode, toggle: toggleAdvancedMode } = useAdvancedMode();
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [conditionDrafts, setConditionDrafts] = useState<Record<string, string>>({});
  const [queueApprovalMode, setQueueApprovalMode] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [scenePacket, setScenePacket] = useState<ScenePacket | null>(null);
  const [scenePacketStatus, setScenePacketStatus] = useState("");
  const [scenePacketValidation, setScenePacketValidation] = useState<ScenePacketValidation | null>(null);
  const [mediaQueueStatus, setMediaQueueStatus] = useState("");
  const [galleryImages, setGalleryImages] = useState<Array<{filename:string;url:string}>>([]);
  const [galleryFull, setGalleryFull] = useState<string | null>(null);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [cleanupReportStatus, setCleanupReportStatus] = useState("");
  const [memoryEntryStatus, setMemoryEntryStatus] = useState("");
  const [memoryEntryExportPath, setMemoryEntryExportPath] = useState("");
  const [localModelDraft, setLocalModelDraft] = useState<LocalModelAdapterDraft | null>(null);
  const [localModelStatus, setLocalModelStatus] = useState("");
  const [directorDraft, setDirectorDraft] = useState<DirectorModeAdapterDraft | null>(null);
  const [directorStatus, setDirectorStatus] = useState("");
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [audioPlayback, setAudioPlayback] = useState<PlaybackState | null>(null);
  const [audioServiceUrl, setAudioServiceUrl] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const [errorEvents, setErrorEvents] = useState<ErrorEvent[]>([]);
  const [ytUrl, setYtUrl] = useState("");
  const [ytVideoId, setYtVideoId] = useState("");
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytLoop, setYtLoop] = useState(true);
  const [ytVolume, setYtVolume] = useState(30);
  const [ytTracks, setYtTracks] = useState<Array<{ url: string; id: string; label: string }>>([]);
  const [ytFading, setYtFading] = useState(false);
  const [audioCuePlayStatus, setAudioCuePlayStatus] = useState("");
  const [diceAnimation, setDiceAnimation] = useState<RollRecord | null>(null);
  const [combatMode, setCombatMode] = useState(false);
  const [combatRound, setCombatRound] = useState(1);
  const [combatTurnIndex, setCombatTurnIndex] = useState(0);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterClass, setNewCharacterClass] = useState("");
  const [newCharacterLevel, setNewCharacterLevel] = useState(1);
  const [newCharacterMaxHp, setNewCharacterMaxHp] = useState(10);
  const [newCharacterAc, setNewCharacterAc] = useState(10);
  const [newCharacterImage, setNewCharacterImage] = useState<string | null>(null);
  const [creatingCharacter, setCreatingCharacter] = useState(false);

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNewCharacterImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function createCharacter() {
    if (!newCharacterName.trim() || !newCharacterClass.trim()) return;
    setCreatingCharacter(true);
    try {
      const body: Record<string, unknown> = {
        name: newCharacterName.trim(),
        classLabel: newCharacterClass.trim(),
        maxHp: newCharacterMaxHp,
        armorClass: newCharacterAc,
        level: newCharacterLevel,
        notes: [`Created at level ${newCharacterLevel}`]
      };
      if (newCharacterImage) body.image = newCharacterImage;
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setNewCharacterName("");
        setNewCharacterClass("");
        setNewCharacterLevel(1);
        setNewCharacterMaxHp(10);
        setNewCharacterAc(10);
        setNewCharacterImage(null);
      }
    } catch {
      /* ignore */
    } finally {
      setCreatingCharacter(false);
    }
  }

  // stub handlers (restored from earlier edits)
  const loadCleanupReport = async (_opts?: {silent?:boolean}) => {};
  const loadErrorEvents = async () => {};
  const exportSessionSummary = async () => {};
  
  const [speaking, setSpeaking] = useState(false);
  const [narrationText, setNarrationText] = useState("");
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const lastSceneImageRef = useRef("");
  const audioCtxRef = useRef<AudioContext | null>(null);

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      audioCtxRef.current.resume().then(() => setAudioUnlocked(true));
    } catch { setAudioUnlocked(true); }
  }

  async function speakSceneText(textOverride?: string) {
    let text = textOverride;
    if (!text) {
      try { const r = await fetch("/api/pending-narration"); if (r.ok) { const d = await r.json(); if (d?.text) text = d.text; } } catch {}
    }
    if (!text) text = snapshot?.memoryEntries?.[0]?.summary;
    if (!text || speaking) return;
    const shortText = text.length > 500 ? text.slice(0, 500) + "..." : text;
    setNarrationText(text);
    setSpeaking(true);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: shortText })
      });
      if (!res.ok) { setSpeaking(false); setNarrationText(""); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioCtxRef.current) {
        const audioBuffer = await audioCtxRef.current.decodeAudioData(await blob.arrayBuffer());
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtxRef.current.destination);
        source.onended = () => { setSpeaking(false); setNarrationText(""); URL.revokeObjectURL(url); };
        source.start();
      } else {
        const audio = new Audio(url);
        audio.onended = () => { setSpeaking(false); setNarrationText(""); URL.revokeObjectURL(url); };
        audio.onerror = () => { setSpeaking(false); setNarrationText(""); URL.revokeObjectURL(url); };
        await audio.play();
      }
    } catch { setSpeaking(false); setNarrationText(""); }
  }

  const lastNarrationTextRef = useRef("");
  useEffect(() => {
    const interval = setInterval(() => {
      if (speaking) return;
      fetch("/api/pending-narration")
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.text && d.text !== lastNarrationTextRef.current) {
            lastNarrationTextRef.current = d.text;
            void speakSceneText(d.text);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [speaking]);

  useEffect(() => {
    setTimeout(() => void speakSceneText(), 2000);
  }, []);

  async function loadScenePacket() {
    setScenePacketStatus("loading");

    try {
      const response = await fetch("/api/scene-packet");

      if (!response.ok) {
        setScenePacketStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        packet: ScenePacket;
        validation: ScenePacketValidation;
      };
      setScenePacket(json.packet);
      setScenePacketValidation(json.validation);
      setScenePacketStatus("ready");
    } catch {
      setScenePacketStatus("failed");
    }
  }

  async function queueScenePacketProposals() {
    if (!scenePacket) {
      return;
    }

    setPendingActionKey("scene-packet-queue");
    try {
      const response = await fetch("/api/scene-packet/queue-proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket)
      });

      if (!response.ok) {
        setScenePacketStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        queuedCount: number;
        validation: ScenePacketValidation;
      };
      setSnapshot(json.sessionSnapshot);
      setScenePacketValidation(json.validation);
      setScenePacketStatus(`queued:${json.queuedCount}`);
    } finally {
      setPendingActionKey("");
    }
  }

  async function queueScenePacketMediaJobs() {
    if (!scenePacket) {
      return;
    }

    setPendingActionKey("scene-packet-media");
    setMediaQueueStatus("queueing");
    try {
      const response = await fetch("/api/scene-packet/queue-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket)
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        queuedCount: number;
        validation: ScenePacketValidation;
      };
      setSnapshot(json.sessionSnapshot);
      setScenePacketValidation(json.validation);
      setMediaQueueStatus(`queued:${json.queuedCount}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function queueScenePacketAudioCues() {
    if (!scenePacket) {
      return;
    }

    setPendingActionKey("scene-packet-audio");
    setMediaQueueStatus("queueing-audio");
    try {
      const response = await fetch("/api/scene-packet/queue-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket)
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        queuedCount: number;
        cues: Array<Record<string, unknown>>;
        validation: ScenePacketValidation;
      };
      setSnapshot(json.sessionSnapshot);
      setScenePacketValidation(json.validation);
      setMediaQueueStatus(`queued-audio:${json.queuedCount}`);
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function queueCharacterVisualCanonJob(characterId: string) {
    setPendingActionKey(`visual-canon-${characterId}`);
    setMediaQueueStatus("queueing-visual-canon");
    try {
      const response = await fetch(`/api/characters/${characterId}/visual-canon-job`, {
        method: "POST"
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        job: MediaJob;
      };
      setSnapshot(json.sessionSnapshot);
      setMediaQueueStatus(`visual-canon:${json.job.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function markMediaJobGenerated(jobId: string) {
    setPendingActionKey(`media-generated-${jobId}`);
    setMediaQueueStatus("recording");
    try {
      const response = await fetch(`/api/media-jobs/${jobId}/mark-generated`, {
        method: "POST"
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        asset: AssetRecord;
      };
      setSnapshot(json.sessionSnapshot);
      setMediaQueueStatus(`generated:${json.asset.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function startMediaJob(jobId: string) {
    setPendingActionKey(`media-start-${jobId}`);
    setMediaQueueStatus("starting");
    try {
      const response = await fetch(`/api/media-jobs/${jobId}/start`, {
        method: "POST"
      });

      if (!response.ok) {
        try {
          const json = (await response.json()) as {
            error?: string;
            pressure?: RuntimeStatus["mediaPressure"];
            runtimeStatus?: RuntimeStatus;
          };
          if (json.runtimeStatus) {
            setRuntime(json.runtimeStatus);
          }
          if (json.pressure?.summary) {
            setMediaQueueStatus(`blocked:${json.pressure.summary}`);
            return;
          }
          if (json.error) {
            setMediaQueueStatus(`blocked:${json.error}`);
            return;
          }
        } catch {
          // fall through to generic failure below
        }
        setMediaQueueStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        job: MediaJob;
        runtimeStatus?: RuntimeStatus;
      };
      setSnapshot(json.sessionSnapshot);
      if (json.runtimeStatus) {
        setRuntime(json.runtimeStatus);
      }
      setMediaQueueStatus(`started:${json.job.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function failMediaJob(jobId: string) {
    setPendingActionKey(`media-failed-${jobId}`);
    setMediaQueueStatus("failing");
    try {
      const response = await fetch(`/api/media-jobs/${jobId}/fail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Marked failed from GM dashboard."
        })
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        sessionSnapshot: SessionSnapshot;
        job: MediaJob;
      };
      setSnapshot(json.sessionSnapshot);
      setMediaQueueStatus(`failed-job:${json.job.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function createMemoryEntry() {
    setPendingActionKey("memory-entry-create");
    setMemoryEntryStatus("creating");

    try {
      const response = await fetch("/api/memory-entries", {
        method: "POST"
      });

      if (!response.ok) {
        setMemoryEntryStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        entry: MemoryEntry;
        exportPath: string;
        sessionSnapshot: SessionSnapshot;
      };
      setSnapshot(json.sessionSnapshot);
      setMemoryEntryExportPath(json.exportPath);
      setMemoryEntryStatus(`ready:${json.entry.id}`);
    } catch {
      setMemoryEntryStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function runLocalModelDraft() {
    setPendingActionKey("local-model-draft");
    setLocalModelStatus("running");

    try {
      const response = await fetch("/api/local-model/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket ? { packet: scenePacket } : {})
      });

      if (!response.ok) {
        setLocalModelStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        draft: LocalModelAdapterDraft;
        validation: ScenePacketValidation;
      };
      setLocalModelDraft(json.draft);
      setScenePacketValidation(json.validation);
      setLocalModelStatus("ready");
    } catch {
      setLocalModelStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function runDirectorModeDraft() {
    setPendingActionKey("director-mode-draft");
    setDirectorStatus("running");

    try {
      const response = await fetch("/api/director-mode/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket ? { packet: scenePacket } : {})
      });

      if (!response.ok) {
        setDirectorStatus("failed");
        return;
      }

      const json = (await response.json()) as {
        draft: DirectorModeAdapterDraft;
        validation: ScenePacketValidation;
      };
      setDirectorDraft(json.draft);
      setScenePacketValidation(json.validation);
      setDirectorStatus("ready");
    } catch {
      setDirectorStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function loadAiLogs() {
    try {
      const response = await fetch("/api/ai-logs");

      if (!response.ok) {
        return;
      }

      const json = (await response.json()) as { logs: AiLogEntry[] };
      setAiLogs(json.logs);
    } catch {
      // Keep this quiet in the UI for now.
    }
  }

  async function loadAudioLibrary() {
    if (!audioServiceUrl) return;
    try {
      const response = await fetch(`${audioServiceUrl}/api/library`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = (await response.json()) as { tracks: AudioTrack[] };
      setAudioTracks(json.tracks);
    } catch {
      // ignore
    }
  }

  async function loadAudioStatus() {
    if (!audioServiceUrl) return;
    try {
      const response = await fetch(`${audioServiceUrl}/api/status`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = (await response.json()) as { playbackState: PlaybackState };
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function playAudioTrack(trackId: string, loop = false) {
    if (!audioServiceUrl) return;
    setAudioStatus("playing");
    try {
      const response = await fetch(`${audioServiceUrl}/api/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, loop }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        setAudioStatus("failed");
        return;
      }
      const json = (await response.json()) as { playbackState: PlaybackState };
      setAudioPlayback(json.playbackState);
      setAudioStatus("ready");
    } catch {
      setAudioStatus("failed");
    }
  }

  async function pauseAudio() {
    if (!audioServiceUrl) return;
    try {
      const response = await fetch(`${audioServiceUrl}/api/pause`, {
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = (await response.json()) as { playbackState: PlaybackState };
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function stopAudio() {
    if (!audioServiceUrl) return;
    try {
      const response = await fetch(`${audioServiceUrl}/api/stop`, {
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = (await response.json()) as { playbackState: PlaybackState };
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function setAudioVolume(volume: number) {
    if (!audioServiceUrl) return;
    try {
      const response = await fetch(`${audioServiceUrl}/api/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = (await response.json()) as { playbackState: PlaybackState };
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function toggleAudioMute() {
    if (!audioServiceUrl || !audioPlayback) return;
    const next = !audioPlayback.muted;
    try {
      const response = await fetch(`${audioServiceUrl}/api/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: next }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = (await response.json()) as { playbackState: PlaybackState };
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function playAudioCue(cueId: string) {
    setAudioCuePlayStatus("playing");
    try {
      const response = await fetch(`/api/audio-cues/${cueId}/play`, {
        method: "POST",
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setAudioCuePlayStatus(`failed:${json.error ?? "Unknown error"}`);
        return;
      }

      const json = (await response.json()) as {
        cue: Record<string, unknown>;
        matchedTrack: { filename: string };
      };
      setAudioCuePlayStatus(`playing:${String(json.matchedTrack?.filename ?? "track")}`);
      await loadAudioStatus();
    } catch {
      setAudioCuePlayStatus("failed:request");
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
      const [runtimeResponse, snapshotResponse, cleanupResponse] = await Promise.all([
        fetch("/api/runtime-status"),
        fetch("/api/session-snapshot"),
        fetch("/api/media-cleanup-report")
      ]);

      const runtimeJson = (await runtimeResponse.json()) as RuntimeStatus;
      const snapshotJson = (await snapshotResponse.json()) as SessionSnapshot;
      const cleanupJson = (await cleanupResponse.json()) as {
        report: CleanupReport;
      };

      if (!isMounted) {
        return;
      }

      setRuntime(runtimeJson);
      setSnapshot(snapshotJson);
      setCleanupReport(cleanupJson.report);
      await loadAiLogs();
      await loadErrorEvents();
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const audioService = runtime?.services.find((s) => s.name === "audio-service");
    const message = audioService?.message ?? "";
    const match = message.match(/https?:\/\/[^\s]+/);
    const nextUrl = match ? match[0] : "";
    if (nextUrl && nextUrl !== audioServiceUrl) {
      setAudioServiceUrl(nextUrl);
    }
  }, [runtime, audioServiceUrl]);

  useEffect(() => {
    if (!audioServiceUrl) return;
    void loadAudioLibrary();
    void loadAudioStatus();
    const interval = window.setInterval(() => {
      void loadAudioStatus();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [audioServiceUrl]);

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
    let mounted = true;
    async function poll() {
      try {
        const res = await fetch("/api/images");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setGalleryImages(data.images ?? []);
      } catch { /* ignore */ }
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

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
          setDiceAnimation(message.payload as RollRecord);
          return;
        }

      if (message.type === "session_snapshot") {
        setSnapshot(message.payload);
        void loadAiLogs();
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
    <main className="dashboard-shell" onClick={unlockAudio}>
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
                      const autoSearch = document.getElementById("auto-yt-search") as HTMLInputElement | null;
                      if (autoSearch?.checked) {
                        const query = encodeURIComponent(`DnD ambience ${title} 1 hour`);
                        window.open(`https://www.youtube.com/results?search_query=${query}`, "_blank");
                      }
                    });
                  }
                }}
                style={{ flex: 1, fontSize: "0.85rem", padding: "6px 10px" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "#bca06d", whiteSpace: "nowrap" }}>
                <input id="auto-yt-search" type="checkbox" defaultChecked />
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
          </div>
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

      <section className="dashboard-grid">
        {advancedMode ? (
        <article className="panel">
          <div className="panel-header">
            <h2>Runtime Status</h2>
            <span className={`pill pill-${runtime?.status ?? "offline"}`}>
              {runtime?.status ?? "offline"}
            </span>
          </div>
          <p className="muted-line">Mode: {runtime?.mode ?? "offline"}</p>
          {runtime?.mediaPressure ? (
            <div className="scene-packet-block">
              <div className="panel-header">
                <h3>Media Pressure</h3>
                <span className={`pill pill-${runtime.mediaPressure.level === "low" ? "ok" : "degraded"}`}>
                  {runtime.mediaPressure.level}
                </span>
              </div>
              <p className="helper-note">{runtime.mediaPressure.summary}</p>
              {runtime.mediaPressure.blockedJobTypes.length ? (
                <div className="tag-row">
                  {runtime.mediaPressure.blockedJobTypes.map((type) => (
                    <span className="tag-chip" key={type}>
                      blocked: {formatMediaJobType(type)}
                    </span>
                  ))}
                </div>
              ) : null}
              {runtime.mediaPressure.reasons.length ? (
                <div className="validation-list">
                  {runtime.mediaPressure.reasons.map((reason) => (
                    <p key={reason}>{reason}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {runtime?.warnings?.length ? (
            <div className="validation-list">
              {runtime.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
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
        ) : null}

        {advancedMode ? (

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

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Campaign Context</h2>
            <span>{snapshot?.campaignBible.visibility ?? "loading"}</span>
          </div>
          {snapshot ? (
            <div className="context-block">
              <strong>{snapshot.campaignBible.subtitle}</strong>
              <p>{snapshot.activeSceneContext.location?.summary ?? "No scene location summary resolved yet."}</p>
              <div className="packet-meta-grid">
                <div>
                  <span>Scene Location</span>
                  <strong>{snapshot.activeSceneContext.location?.name ?? "Unresolved"}</strong>
                </div>
                <div>
                  <span>Safety Rating</span>
                  <strong>{snapshot.activeSceneContext.safety.rating}</strong>
                </div>
              </div>
              <div className="tag-row">
                {snapshot.activeSceneContext.tone.map((tone) => (
                  <span className="tag-chip" key={tone}>
                    {tone}
                  </span>
                ))}
              </div>
              {snapshot.activeSceneContext.location?.features.length ? (
                <div>
                  <p className="detail-label">Location Features</p>
                  <div className="tag-row">
                    {snapshot.activeSceneContext.location.features.map((feature) => (
                      <span className="tag-chip" key={feature}>
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {snapshot.activeSceneContext.npcs.length ? (
                <div>
                  <p className="detail-label">Relevant NPCs</p>
                  <div className="context-list">
                    {snapshot.activeSceneContext.npcs.map((npc) => (
                      <div className="context-row" key={npc.id}>
                        <strong>{npc.name}</strong>
                        <p>
                          {npc.role} · {npc.motive}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {snapshot.activeSceneContext.facts.length ? (
                <div>
                  <p className="detail-label">Matched Facts</p>
                  <div className="context-list">
                    {snapshot.activeSceneContext.facts.map((fact) => (
                      <div className="context-row" key={fact.id}>
                        <strong>{formatSimpleLabel(fact.id)}</strong>
                        <p>{fact.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p>No campaign facts matched this scene yet.</p>
              )}
            </div>
          ) : (
            <p>Waiting for campaign context.</p>
          )}
        </article>

        ) : null}

        {advancedMode ? (
        <article className="panel panel-wide">
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
            <div className="character-form-row" style={{ alignItems: "center" }}>
              <div>
                <label className="label">Portrait Image</label>
                <input type="file" accept="image/*" onChange={handleImagePick} style={{ maxWidth: 220 }} />
              </div>
              {newCharacterImage ? (
                <img src={newCharacterImage} alt="Preview" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, border: "2px solid #555" }} />
              ) : null}
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
        </article>
        ) : null}

        {galleryImages.length > 0 ? (
          <article className="panel" id="scene-image-hero">
            <div className="panel-header">
              <h2>🏞 Latest Scene</h2>
              <span>{snapshot?.currentScene ?? ""}</span>
            </div>
            <img
              src={galleryImages[0].url}
              alt="Current scene"
              style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 8, cursor: "pointer" }}
              onClick={() => setGalleryFull(galleryImages[0].url)}
            />
          </article>
        ) : null}

        {narrationText ? (
          <div style={{
            background: "linear-gradient(135deg, #1a1209 0%, #2a1a0a 100%)",
            border: "1px solid #5a4a2a", borderRadius: 8, padding: "20px 24px",
            marginBottom: 12, fontSize: "1.35rem", lineHeight: 1.7,
            color: "#f0dcaf", fontStyle: "italic", position: "relative"
          }}>
            <div style={{ position: "absolute", top: 6, right: 10, fontSize: "0.7rem", color: "#8a7a4a" }}>
              {speaking ? "🔊 speaking..." : ""}
            </div>
            {narrationText}
          </div>
        ) : null}

        {advancedMode && galleryImages.length > 0 ? (
          <article className="panel">
            <div className="panel-header">
              <h2>🖼 All Images</h2>
              <span>{galleryImages.length}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {galleryImages.map((img) => (
                <img
                  key={img.filename}
                  src={img.url}
                  alt={img.filename}
                  loading="lazy"
                  style={{
                    width: 160, height: 110, objectFit: "cover",
                    cursor: "pointer", borderRadius: 6,
                    border: "2px solid #333"
                  }}
                  onClick={() => setGalleryFull(img.url)}
                />
              ))}
          </div>
        </article>
        ) : null}

        {galleryFull ? (
          <div
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
              zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer"
            }}
            onClick={() => setGalleryFull(null)}
          >
            <img src={galleryFull} style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
          </div>
        ) : null}

        <article className="panel">
          <div className="panel-header">
            <h2>Party State</h2>
            <span>{snapshot?.party.length ?? 0} linked</span>
            {advancedMode ? (
              <button
                className="mini-button"
                disabled={pendingActionKey !== ""}
                onClick={() => {
                  snapshot?.party.forEach((character) => {
                    if (character.initiative !== null) {
                      void submitStateEvent(
                        { type: "initiative_set", characterId: character.id, value: null },
                        `init-clear:${character.id}`,
                        `init-clear-${character.id}`
                      );
                    }
                  });
                }}
                type="button"
              >
                Clear Initiative
              </button>
            ) : null}
          </div>
          {advancedMode ? (
            <label className="mode-toggle">
              <input
                checked={queueApprovalMode}
                onChange={(event) => setQueueApprovalMode(event.target.checked)}
                type="checkbox"
              />
              <span>Queue risky state changes for approval</span>
            </label>
          ) : null}

          {snapshot?.party.some((c) => c.initiative !== null) ? (
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
              <button
                className="mini-button"
                onClick={() => {
                  setCombatMode(!combatMode);
                  if (!combatMode) {
                    setCombatRound(1);
                    setCombatTurnIndex(0);
                  }
                }}
                type="button"
              >
                {combatMode ? "End Combat" : "Start Combat"}
              </button>
            </div>
          ) : null}

          {combatMode && snapshot?.party.some((c) => c.initiative !== null) ? (
            <div className="combat-tracker" style={{ marginBottom: "14px" }}>
              <div className="combat-header">
                <span className="combat-round">Round {combatRound}</span>
                <button
                  className="combat-next-btn"
                  onClick={() => {
                    const combatants = snapshot.party
                      .filter((c) => c.initiative !== null)
                      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
                    if (combatTurnIndex + 1 >= combatants.length) {
                      setCombatTurnIndex(0);
                      setCombatRound((r) => r + 1);
                    } else {
                      setCombatTurnIndex((i) => i + 1);
                    }
                  }}
                  type="button"
                >
                  Next Turn →
                </button>
              </div>
              <div className="combat-order">
                {snapshot.party
                  .filter((c) => c.initiative !== null)
                  .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0))
                  .map((character, idx) => (
                    <div
                      key={character.id}
                      className={`combat-turn ${idx === combatTurnIndex ? "combat-active" : ""}`}
                    >
                      <span className="combat-init">{character.initiative}</span>
                      <div>
                        <strong>{character.name}</strong>
                        <span className="combat-hp">HP {character.hp.current}/{character.hp.max}</span>
                        {character.conditions.length > 0 ? (
                          <span className="combat-conditions">{character.conditions.join(", ")}</span>
                        ) : null}
                      </div>
                      {idx === combatTurnIndex ? <span className="combat-badge">ACTIVE</span> : null}
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="party-list">
            {snapshot?.party
              .slice()
              .sort((a, b) => {
                const ai = a.initiative ?? -1;
                const bi = b.initiative ?? -1;
                if (ai !== bi) return bi - ai;
                return a.name.localeCompare(b.name);
              })
              .map((character) => {
                const hpPct = Math.max(0, Math.min(100, Math.round((character.hp.current / character.hp.max) * 100)));
                const hpClass = character.hp.current <= character.hp.max * 0.25 ? "hp-critical" : character.hp.current <= character.hp.max * 0.5 ? "hp-wounded" : "";
                return advancedMode ? (
                  <div key={character.id} className="party-card">
                    <div>
                      <h3>{character.name}</h3>
                      <p>{character.classLabel}</p>
                    </div>
                    <div className="party-stats">
                      <span>HP {character.hp.current}/{character.hp.max}</span>
                      <span>AC {character.armorClass}</span>
                      <span>{formatInitiative(character.initiative)}</span>
                    </div>
                    <div className="initiative-row">
                      <input
                        className="initiative-input"
                        type="number"
                        value={character.initiative ?? ""}
                        onChange={(event) => {
                          const value = event.target.value ? Number(event.target.value) : null;
                          void submitStateEvent(
                            { type: "initiative_set", characterId: character.id, value },
                            `init:${character.id}:${value}`,
                            `init-${character.id}`
                          );
                        }}
                        placeholder="Init"
                      />
                    </div>
                    <div className="tag-row">
                      {character.conditions.length > 0 ? (
                        character.conditions.map((condition) => (
                          <span key={condition} className="tag-chip">{condition}</span>
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
                                <strong>{resource.current}/{resource.max}</strong>
                                <div className="stepper-row">
                                  <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "resource_set", characterId: character.id, resourceId: resource.id, value: resource.current - 1 }, `resource:${character.id}:${resource.id}:${resource.current - 1}`, `resource-dec-${character.id}-${resource.id}`)} type="button">-</button>
                                  <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "resource_set", characterId: character.id, resourceId: resource.id, value: resource.current + 1 }, `resource:${character.id}:${resource.id}:${resource.current + 1}`, `resource-inc-${character.id}-${resource.id}`)} type="button">+</button>
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
                            <li key={item.id}><span>{item.name}</span><strong>x{item.quantity}</strong></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="gm-action-grid">
                      <div className="action-panel">
                        <p className="detail-label">Quick HP</p>
                        <div className="hp-quick-row">
                          <input
                            type="number"
                            className="hp-quick-input"
                            placeholder="DMG"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = Number((e.target as HTMLInputElement).value);
                                if (!isNaN(val) && val !== 0) {
                                  void submitStateEvent(
                                    { type: "hp_delta", characterId: character.id, amount: -Math.abs(val) },
                                    `hp:${character.id}:-${Math.abs(val)}`,
                                    `hp-dmg-${character.id}`
                                  );
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                          <input
                            type="number"
                            className="hp-quick-input heal"
                            placeholder="HEAL"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = Number((e.target as HTMLInputElement).value);
                                if (!isNaN(val) && val !== 0) {
                                  void submitStateEvent(
                                    { type: "hp_delta", characterId: character.id, amount: Math.abs(val) },
                                    `hp:${character.id}:+${Math.abs(val)}`,
                                    `hp-heal-${character.id}`
                                  );
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }
                            }}
                          />
                        </div>
                        <div className="quick-action-row">
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -1 }, `hp:${character.id}:-1`, `hp-1-${character.id}`)} type="button">-1</button>
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -5 }, `hp:${character.id}:-5`, `hp-5-${character.id}`)} type="button">-5</button>
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 1 }, `hp:${character.id}:1`, `hp+1-${character.id}`)} type="button">+1</button>
                          <button className="mini-button" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 5 }, `hp:${character.id}:5`, `hp+5-${character.id}`)} type="button">+5</button>
                        </div>
                      </div>
                      <div className="action-panel">
                        <p className="detail-label">Condition Controls</p>
                        <div className="condition-entry-row">
                          <input className="inline-input" onChange={(event) => setConditionDrafts((current) => ({ ...current, [character.id]: event.target.value }))} placeholder="Add condition" value={conditionDrafts[character.id] ?? ""} />
                          <button className="mini-button" disabled={pendingActionKey !== "" || !(conditionDrafts[character.id] ?? "").trim()} onClick={() => void submitStateEvent({ type: "condition_add", characterId: character.id, condition: (conditionDrafts[character.id] ?? "").trim() }, `condition-add:${character.id}:${(conditionDrafts[character.id] ?? "").trim()}`, `condition-add-${character.id}`, { clearConditionDraftFor: character.id })} type="button">Add</button>
                        </div>
                        {character.conditions.length > 0 ? (
                          <div className="removal-chip-row">
                            {character.conditions.map((condition) => (
                              <button className="tag-chip removable-chip" disabled={pendingActionKey !== ""} key={`${character.id}-${condition}`} onClick={() => void submitStateEvent({ type: "condition_remove", characterId: character.id, condition }, `condition-remove:${character.id}:${condition}`, `condition-remove-${character.id}-${condition}`)} type="button">{condition} x</button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <p className="party-note">{character.notes[0]}</p>
                    <p className="claim-note">{character.claimedByLabel ? `Claimed by ${character.claimedByLabel}` : "Unclaimed"}</p>
                    <button className="mini-button secondary-button" disabled={pendingActionKey !== ""} onClick={() => void queueCharacterVisualCanonJob(character.id)} type="button">Queue Visual Canon Job</button>
                  </div>
                ) : (
                  <div key={character.id} className="simple-party-card">
                    <div className="simple-party-header">
                      <h3>{character.name}</h3>
                      <span>{character.classLabel}</span>
                    </div>
                    <div className="hp-bar">
                      <div className={`hp-bar-fill ${hpClass}`} style={{ width: `${hpPct}%` }} />
                    </div>
                    <div className="simple-party-stats">
                      <span>HP<strong>{character.hp.current}/{character.hp.max}</strong></span>
                      <span>AC<strong>{character.armorClass}</strong></span>
                      {character.initiative !== null ? <span>INIT<strong>{character.initiative}</strong></span> : null}
                    </div>
                    <div className="tag-row">
                      {character.conditions.length > 0 ? (
                        character.conditions.map((condition) => (
                          <span key={condition} className="tag-chip">{condition}</span>
                        ))
                      ) : (
                        <span className="tag-chip muted-chip">No conditions</span>
                      )}
                    </div>
                    <div className="hp-simple-row">
                      <button className="hp-big-btn dmg" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -5 }, `hp:${character.id}:-5`, `hp-5-${character.id}`)} type="button">-5</button>
                      <button className="hp-big-btn dmg" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: -1 }, `hp:${character.id}:-1`, `hp-1-${character.id}`)} type="button">-1</button>
                      <button className="hp-big-btn heal" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 1 }, `hp:${character.id}:1`, `hp+1-${character.id}`)} type="button">+1</button>
                      <button className="hp-big-btn heal" disabled={pendingActionKey !== ""} onClick={() => void submitStateEvent({ type: "hp_delta", characterId: character.id, amount: 5 }, `hp:${character.id}:5`, `hp+5-${character.id}`)} type="button">+5</button>
                    </div>
                  </div>
                );
              }) ?? <p>No party state yet.</p>}
          </div>
        </article>

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Approval Queue</h2>
            <span>{snapshot?.approvalQueue.length ?? 0} waiting</span>
          </div>
          <p className="muted-line">
            Risky state changes land here before they become canon. Approve to apply them to the table, or reject
            to discard them.
          </p>
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

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Scene Packet Draft</h2>
            <span>{scenePacket ? scenePacket.visibility : "not generated"}</span>
          </div>
          <p className="muted-line">
            This is the working scene bundle for AI and media tools. Start here, then branch into approval,
            narration, director planning, or queued media.
          </p>
          <button className="export-button" onClick={() => void loadScenePacket()} type="button">
            Generate Scene Packet
          </button>
          {scenePacketStatus ? (
            <p className="export-note">
              {scenePacketStatus === "loading"
                ? "Building scene packet..."
                : scenePacketStatus === "ready"
                  ? "Scene packet refreshed."
                  : scenePacketStatus.startsWith("queued:")
                    ? `${scenePacketStatus.split(":")[1]} proposal(s) added to the approval queue.`
                  : "Scene packet failed to load."}
            </p>
          ) : null}
          {scenePacket ? (
            <div className="scene-packet-block">
              <strong>{scenePacket.sceneTitle}</strong>
              <p>{scenePacket.summary}</p>
              <p className="helper-note">
                Suggested order: 1) Generate the packet. 2) Queue risky state or media work you want to keep. 3)
                Run Local Model Draft for moment-to-moment narration. 4) Run Director Mode Draft for pacing,
                reveals, and canon notes. 5) Create a memory entry when the scene settles.
              </p>
              <div className="packet-meta-grid">
                <div>
                  <span>Beats</span>
                  <strong>{scenePacket.beats.length}</strong>
                </div>
                <div>
                  <span>Proposed State</span>
                  <strong>{scenePacket.proposedStateEvents.length}</strong>
                </div>
                <div>
                  <span>Media</span>
                  <strong>{scenePacket.mediaRequests.length}</strong>
                </div>
                <div>
                  <span>Audio</span>
                  <strong>{scenePacket.audioCues.length}</strong>
                </div>
                <div>
                  <span>Validation</span>
                  <strong>{scenePacketValidation?.ok ? "Valid" : "Needs fixes"}</strong>
                </div>
              </div>
              {scenePacketValidation && !scenePacketValidation.ok ? (
                <div className="validation-list">
                  {scenePacketValidation.errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              ) : null}
              <div className="packet-beat-list">
                {scenePacket.beats.map((beat, index) => (
                  <div className="packet-beat" key={`${scenePacket.id}-${index}`}>
                    <span className="event-pill event-state">{beat.kind}</span>
                    <p>{beat.text}</p>
                  </div>
                ))}
              </div>
              {scenePacket.proposedStateEvents.length ? (
                <div className="packet-beat-list">
                  {scenePacket.proposedStateEvents.map((event) => (
                    <div className="packet-beat" key={event.id}>
                      <span className="event-pill event-claim">{event.type}</span>
                      <p>{event.actor.label} proposed a GM-reviewed state change.</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                className="export-button"
                disabled={
                  pendingActionKey !== "" ||
                  !scenePacket.proposedStateEvents.length ||
                  scenePacketValidation?.ok === false
                }
                onClick={() => void queueScenePacketProposals()}
                type="button"
              >
                Queue Proposed State Events
              </button>
              <button
                className="export-button secondary-action"
                disabled={
                  pendingActionKey !== "" ||
                  !scenePacket.mediaRequests.length ||
                  scenePacketValidation?.ok === false
                }
                onClick={() => void queueScenePacketMediaJobs()}
                type="button"
              >
                Queue Media Jobs
              </button>
              <button
                className="export-button secondary-action"
                disabled={
                  pendingActionKey !== "" ||
                  !scenePacket.audioCues.length ||
                  scenePacketValidation?.ok === false
                }
                onClick={() => void queueScenePacketAudioCues()}
                type="button"
              >
                Queue Audio Cues
              </button>
              {scenePacket.audioCues.length ? (
                <div className="packet-beat-list">
                  {scenePacket.audioCues.map((cue, index) => (
                    <div className="packet-beat" key={`${scenePacket.id}-audio-${index}`}>
                      <span className="event-pill event-memory">{String(cue.kind ?? "audio")}</span>
                      <p>
                        {String(cue.notes ?? "Suggested audio cue")}
                        {Array.isArray(cue.tags) && cue.tags.length ? (
                          <span className="tag-row" style={{ marginLeft: 8 }}>
                            {cue.tags.map((tag: string) => (
                              <span className="tag-chip" key={tag}>{tag}</span>
                            ))}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              {mediaQueueStatus === "queueing" ||
              mediaQueueStatus.startsWith("queued:") ||
              mediaQueueStatus === "queueing-visual-canon" ||
              mediaQueueStatus.startsWith("visual-canon:") ||
              mediaQueueStatus === "queueing-audio" ||
              mediaQueueStatus.startsWith("queued-audio:") ||
              mediaQueueStatus === "failed" ? (
                <p className="export-note">
                  {mediaQueueStatus === "queueing"
                    ? "Queueing media jobs..."
                    : mediaQueueStatus.startsWith("queued:")
                      ? `${mediaQueueStatus.split(":")[1]} media job(s) added to the queue.`
                      : mediaQueueStatus === "queueing-visual-canon"
                        ? "Queueing character visual-canon job..."
                        : mediaQueueStatus.startsWith("visual-canon:")
                          ? `Character visual-canon job ${mediaQueueStatus.split(":")[1]} added to the queue.`
                          : mediaQueueStatus === "queueing-audio"
                            ? "Queueing audio cues..."
                            : mediaQueueStatus.startsWith("queued-audio:")
                              ? `${mediaQueueStatus.split(":")[1]} audio cue(s) added to the queue.`
                      : "Media jobs failed to queue."}
                </p>
              ) : null}
            </div>
          ) : (
            <p>No scene packet generated yet.</p>
          )}
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Media Job Queue</h2>
            <span>{snapshot?.mediaJobs.length ?? 0} tracked</span>
          </div>
          <p className="muted-line">
            Jobs auto-submit to ComfyUI when the router is configured. If ComfyUI is offline or the router is
            unconfigured, Start/Fail/Record remain manual overrides.
          </p>
          <div className="memory-entry-list">
            {snapshot?.mediaJobs.length ? (
              snapshot.mediaJobs.map((job) => (
                <div className="memory-entry-card" key={job.id}>
                  <div className="memory-entry-header">
                    <strong>{formatMediaJobType(job.type)}</strong>
                    <span className="event-pill event-memory">{formatMediaJobStatus(job.status)}</span>
                  </div>
                  <p>{job.prompt ?? "No prompt attached."}</p>
                  <div className="memory-entry-meta">
                    <span>{formatVisibilityLabel(job.visibility)}</span>
                    <span>{job.priority}</span>
                    <span>{job.runWhen}</span>
                    <span>{formatTime(job.createdAt)}</span>
                  </div>
                  <div className="memory-entry-meta">
                    <span>{job.startedAt ? `started ${formatTime(job.startedAt)}` : "not started"}</span>
                    <span>{job.completedAt ? `completed ${formatTime(job.completedAt)}` : "not completed"}</span>
                  </div>
                  <div className="tag-row">
                    {job.workflowId ? <span className="tag-chip">workflow: {job.workflowId}</span> : null}
                    {job.sceneId ? <span className="tag-chip">scene: {job.sceneId}</span> : null}
                    {job.comfyPromptId ? (
                      <span className="tag-chip">comfy: {job.comfyPromptId.slice(0, 8)}…</span>
                    ) : null}
                    {job.settings?.subjectName ? (
                      <span className="tag-chip">subject: {String(job.settings.subjectName)}</span>
                    ) : null}
                    {Array.isArray(job.settings?.variantSet)
                      ? job.settings.variantSet.map((variant) => (
                          <span className="tag-chip" key={`${job.id}-${String(variant)}`}>
                            view: {String(variant).replace(/_/g, " ")}
                          </span>
                        ))
                      : null}
                  </div>
                  {job.error ? <p className="export-note">Last error: {job.error}</p> : null}
                  <div className="approval-actions">
                    <button
                      className="mini-button"
                      disabled={
                        pendingActionKey !== "" ||
                        job.status === "running" ||
                        job.status === "generated" ||
                        job.status === "archived" ||
                        job.status === "rejected"
                      }
                      onClick={() => void startMediaJob(job.id)}
                      type="button"
                    >
                      {job.status === "failed" ? "Retry Job" : "Start Job"}
                    </button>
                    <button
                      className="mini-button"
                      disabled={
                        pendingActionKey !== "" ||
                        job.status === "failed" ||
                        job.status === "generated" ||
                        job.status === "archived" ||
                        job.status === "rejected"
                      }
                      onClick={() => void failMediaJob(job.id)}
                      type="button"
                    >
                      Mark Failed
                    </button>
                    <button
                      className="mini-button"
                      disabled={
                        pendingActionKey !== "" ||
                        job.status === "generated" ||
                        job.status === "failed" ||
                        job.status === "archived" ||
                        job.status === "rejected"
                      }
                      onClick={() => void markMediaJobGenerated(job.id)}
                      type="button"
                    >
                      {job.status === "generated" ? "Metadata Recorded" : "Record Generated Metadata"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>No queued media jobs yet.</p>
            )}
          </div>
          {mediaQueueStatus ? (
            <p className="export-note">
              {mediaQueueStatus === "starting"
                ? "Starting media job..."
                : mediaQueueStatus === "failing"
                  ? "Marking media job as failed..."
                  : mediaQueueStatus === "recording"
                    ? "Recording generated media metadata..."
                    : mediaQueueStatus.startsWith("blocked:")
                      ? mediaQueueStatus.slice("blocked:".length)
                    : mediaQueueStatus.startsWith("started:")
                      ? `Media job ${mediaQueueStatus.split(":")[1]} is now running.`
                      : mediaQueueStatus.startsWith("failed-job:")
                        ? `Media job ${mediaQueueStatus.split(":")[1]} was marked failed.`
                        : mediaQueueStatus.startsWith("generated:")
                          ? `Stored asset metadata as ${mediaQueueStatus.split(":")[1]}.`
                          : mediaQueueStatus.startsWith("queued:")
                            ? `${mediaQueueStatus.split(":")[1]} media job(s) added to the queue.`
                            : mediaQueueStatus === "queueing"
                              ? "Queueing media jobs..."
                              : "Media metadata update failed."}
            </p>
          ) : null}
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Audio Library</h2>
            <span>{audioTracks.length} tracks</span>
          </div>
          <p className="muted-line">
            Browse the local audio library by kind. Playback controls the host audio service state; the GM
            dashboard is the default playback source.
          </p>
          {audioServiceUrl ? (
            <div>
              <div className="panel-header">
                <h3>Now Playing</h3>
                <span className={`pill pill-${audioPlayback?.status === "playing" ? "ok" : "degraded"}`}>
                  {audioPlayback?.status ?? "idle"}
                </span>
              </div>
              {audioPlayback?.currentTrackId ? (
                <div className="context-row">
                  <strong>
                    {audioTracks.find((t) => t.id === audioPlayback.currentTrackId)?.filename ?? "Unknown track"}
                  </strong>
                  <p>
                    Volume: {Math.round((audioPlayback?.volume ?? 0) * 100)}%
                    {audioPlayback?.muted ? " · muted" : ""}
                    {audioPlayback?.loop ? " · looping" : ""}
                  </p>
                </div>
              ) : (
                <p className="muted-line">No track selected.</p>
              )}
              <div className="quick-action-row">
                <button
                  className="mini-button"
                  disabled={!audioPlayback?.currentTrackId}
                  onClick={() => void pauseAudio()}
                  type="button"
                >
                  Pause
                </button>
                <button
                  className="mini-button"
                  disabled={audioPlayback?.status === "idle"}
                  onClick={() => void stopAudio()}
                  type="button"
                >
                  Stop
                </button>
                <button
                  className="mini-button"
                  disabled={audioPlayback?.status === "idle"}
                  onClick={() => void toggleAudioMute()}
                  type="button"
                >
                  {audioPlayback?.muted ? "Unmute" : "Mute"}
                </button>
              </div>
              <div className="quick-action-row">
                <button className="mini-button" onClick={() => void setAudioVolume(0.2)} type="button">
                  Vol 20%
                </button>
                <button className="mini-button" onClick={() => void setAudioVolume(0.5)} type="button">
                  Vol 50%
                </button>
                <button className="mini-button" onClick={() => void setAudioVolume(0.8)} type="button">
                  Vol 80%
                </button>
                <button className="mini-button" onClick={() => void setAudioVolume(1.0)} type="button">
                  Vol 100%
                </button>
              </div>
              <div>
                <p className="detail-label">Tracks</p>
                <div className="memory-entry-list">
                  {audioTracks.length ? (
                    audioTracks.map((track) => (
                      <div className="memory-entry-card" key={track.id}>
                        <div className="memory-entry-header">
                          <strong>{track.filename}</strong>
                          <span className="event-pill event-memory">{track.kind}</span>
                        </div>
                        <div className="tag-row">
                          {track.tags.map((tag) => (
                            <span className="tag-chip" key={`${track.id}-${tag}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="approval-actions">
                          <button
                            className="mini-button"
                            onClick={() => void playAudioTrack(track.id, false)}
                            type="button"
                          >
                            Play
                          </button>
                          <button
                            className="mini-button"
                            onClick={() => void playAudioTrack(track.id, true)}
                            type="button"
                          >
                            Loop
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No audio tracks found in library.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p>Audio service not configured in runtime status.</p>
          )}
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Audio Cue Queue</h2>
            <span>{snapshot?.audioCueQueue.length ?? 0} queued</span>
          </div>
          <p className="muted-line">
            Scene-packet audio cues land here. The GM can trigger playback manually; auto-play on scene
            change is not wired yet.
          </p>
          <div className="memory-entry-list">
            {snapshot?.audioCueQueue.length ? (
              snapshot.audioCueQueue.map((cue) => (
                <div className="memory-entry-card" key={cue.id}>
                  <div className="memory-entry-header">
                    <strong>{cue.kind}</strong>
                    <span className="event-pill event-memory">{cue.status}</span>
                  </div>
                  <p>{cue.notes ?? "No notes attached."}</p>
                  <div className="tag-row">
                    {cue.tags.map((tag) => (
                      <span className="tag-chip" key={`${cue.id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                    {cue.loop ? <span className="tag-chip">loop</span> : null}
                    <span className="tag-chip">vol: {Math.round(cue.volume * 100)}%</span>
                  </div>
                  <div className="approval-actions">
                    <button
                      className="mini-button"
                      disabled={pendingActionKey !== "" || cue.status === "playing"}
                      onClick={() => void playAudioCue(cue.id)}
                      type="button"
                    >
                      {cue.status === "playing" ? "Playing" : "Play Cue"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>No audio cues queued yet.</p>
            )}
          </div>
          {audioCuePlayStatus ? (
            <p className="export-note">
              {audioCuePlayStatus === "playing"
                ? "Starting audio cue..."
                : audioCuePlayStatus.startsWith("playing:")
                  ? `Playing track: ${audioCuePlayStatus.split(":")[1]}`
                  : audioCuePlayStatus.startsWith("failed:")
                    ? `Failed: ${audioCuePlayStatus.slice("failed:".length)}`
                    : "Audio cue playback updated."}
            </p>
          ) : null}
        </article>

        ) : null}

        {advancedMode ? (
        <article className="panel">
          <div className="panel-header">
            <h2>🎵 YouTube Music</h2>
            <span>{ytTracks.length} tracks</span>
          </div>
          <p className="muted-line">
            Paste any YouTube URL below. Works with full-length ambience videos, music compilations, or short loops.
            Premium account = no ads.
          </p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const url = ytUrl.trim();
                  const id = extractYtId(url);
                  if (id) {
                    setYtTracks((prev) => [...prev, { url, id, label: url }]);
                    setYtUrl("");
                  }
                }
              }}
              placeholder="Paste YouTube URL and press Enter..."
              style={{ flex: 1, fontSize: "0.85rem", padding: "8px 12px" }}
            />
          </div>
          {ytTracks.length > 0 ? (
            <div className="yt-controls">
              <div className={`yt-player-wrap ${ytFading ? "yt-fading" : ""}`}>
                {ytVideoId ? (
                  <iframe
                    key={ytVideoId}
                    src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=1&loop=${ytLoop ? "1" : "0"}${ytLoop ? `&playlist=${ytVideoId}` : ""}&controls=0&enablejsapi=1`}
                    allow="autoplay"
                    style={{ width: "100%", height: "120px", border: "none", borderRadius: "4px", opacity: ytFading ? 0 : 1, transition: "opacity 0.5s" }}
                  />
                ) : (
                  <div className="yt-placeholder">Select a track below to play</div>
                )}
              </div>
              <div className="quick-action-row" style={{ marginTop: "8px" }}>
                <button className="mini-button" disabled={!ytVideoId} onClick={() => { setYtPlaying(!ytPlaying); setYtVideoId(ytPlaying ? "" : ytVideoId); }} type="button">
                  {ytPlaying ? "⏹ Stop" : "▶ Play"}
                </button>
                <button className="mini-button" disabled={!ytVideoId} onClick={() => setYtLoop(!ytLoop)} type="button">
                  {ytLoop ? "🔁 Looping" : "🔂 Once"}
                </button>
                <span style={{ fontSize: "0.78rem", color: "#bca06d", padding: "4px 8px" }}>Vol {ytVolume}%</span>
                <button className="mini-button" onClick={() => setYtVolume(Math.max(0, ytVolume - 10))} type="button">−</button>
                <button className="mini-button" onClick={() => setYtVolume(Math.min(100, ytVolume + 10))} type="button">+</button>
              </div>
              <div className="tag-row" style={{ marginTop: "8px" }}>
                {ytTracks.map((track) => (
                  <span
                    key={track.id}
                    className={`tag-chip ${track.id === ytVideoId ? "condition-chip" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (track.id !== ytVideoId) {
                        setYtFading(true);
                        setTimeout(() => {
                          setYtVideoId(track.id);
                          setYtPlaying(true);
                          setYtFading(false);
                        }, 300);
                      }
                    }}
                  >
                    {track.id === ytVideoId && ytPlaying ? "▶ " : ""}{formatYtLabel(track.url)}
                  </span>
                ))}
                <span className="tag-chip muted-chip" style={{ cursor: "pointer" }} onClick={() => setYtTracks([])}>Clear all</span>
              </div>
            </div>
          ) : null}
        </article>
        ) : null}

        <article className="panel">
          <div className="panel-header">
            <h2>Generated Media Metadata</h2>
            <span>{snapshot?.assetRecords.length ?? 0} tracked</span>
          </div>
          <p className="muted-line">
            These records keep prompts, workflows, and intended local output paths in runtime state while the
            actual files stay outside Git. Think of this as the campaign's memory of what art exists, not the art
            files themselves.
          </p>
          <div className="memory-entry-list">
            {snapshot?.assetRecords.length ? (
              snapshot.assetRecords.map((asset) => (
                <div className="memory-entry-card" key={asset.id}>
                  <div className="memory-entry-header">
                    <strong>{formatAssetKind(asset.kind)}</strong>
                    <span className="event-pill event-memory">{asset.status}</span>
                  </div>
                  <p>{asset.prompt ?? "No prompt attached."}</p>
                  <div className="memory-entry-meta">
                    <span>{formatVisibilityLabel(asset.visibility)}</span>
                    <span>{asset.workflowId ?? "no workflow"}</span>
                    <span>{asset.localPath ?? "no local path"}</span>
                  </div>
                  <div className="tag-row">
                    {asset.sceneId ? <span className="tag-chip">scene: {asset.sceneId}</span> : null}
                    <span className="tag-chip">asset: {asset.id}</span>
                  </div>
                </div>
              ))
            ) : (
              <p>No generated media metadata recorded yet.</p>
            )}
          </div>
        </article>

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Cleanup Policy</h2>
            <span>{cleanupReport ? formatTime(cleanupReport.generatedAt) : "not loaded"}</span>
          </div>
          <p className="muted-line">
            This is a report-only cleanup pass. It shows what should be archived or reviewed later while keeping
            final files outside Git and untouched for now.
          </p>
          <button className="export-button" onClick={() => void loadCleanupReport()} type="button">
            Refresh Cleanup Report
          </button>
          {cleanupReportStatus ? (
            <p className="export-note">
              {cleanupReportStatus === "loading"
                ? "Refreshing cleanup report..."
                : cleanupReportStatus === "ready"
                  ? "Cleanup report refreshed."
                  : "Cleanup report failed to load."}
            </p>
          ) : null}
          {cleanupReport ? (
            <div className="context-block">
              <div className="packet-meta-grid">
                <div>
                  <span>Tracked Jobs</span>
                  <strong>{cleanupReport.summary.trackedMediaJobs}</strong>
                </div>
                <div>
                  <span>Tracked Assets</span>
                  <strong>{cleanupReport.summary.trackedAssets}</strong>
                </div>
                <div>
                  <span>Archive Candidates</span>
                  <strong>{cleanupReport.summary.archiveCandidateCount}</strong>
                </div>
                <div>
                  <span>Review Candidates</span>
                  <strong>{cleanupReport.summary.reviewCandidateCount}</strong>
                </div>
                <div>
                  <span>Protected Finals</span>
                  <strong>{cleanupReport.summary.protectedFinalAssetCount}</strong>
                </div>
              </div>
              <div className="tag-row">
                <span className="tag-chip">media root: {cleanupReport.outputRoots.mediaOutputRoot}</span>
                <span className="tag-chip">repo exports: {cleanupReport.outputRoots.repoExportsRoot}</span>
              </div>
              <div className="validation-list">
                {cleanupReport.policy.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
              <div>
                <p className="detail-label">Archive Candidates</p>
                <div className="memory-entry-list">
                  {cleanupReport.archiveCandidates.length ? (
                    cleanupReport.archiveCandidates.map((candidate) => (
                      <div className="memory-entry-card" key={`archive-${candidate.kind}-${candidate.id}`}>
                        <div className="memory-entry-header">
                          <strong>{candidate.kind.replace("_", " ")}</strong>
                          <span className="event-pill event-memory">{candidate.status}</span>
                        </div>
                        <p>{candidate.reason}</p>
                        <div className="memory-entry-meta">
                          <span>{candidate.recommendedAction.replace("_", " ")}</span>
                          <span>{candidate.workflowId ?? "no workflow"}</span>
                          <span>{candidate.timestamp ? formatTime(candidate.timestamp) : "no timestamp"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No archive candidates yet.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="detail-label">Review / Protected Items</p>
                <div className="memory-entry-list">
                  {cleanupReport.reviewCandidates.length ? (
                    cleanupReport.reviewCandidates.map((candidate) => (
                      <div className="memory-entry-card" key={`review-${candidate.kind}-${candidate.id}`}>
                        <div className="memory-entry-header">
                          <strong>{candidate.kind.replace("_", " ")}</strong>
                          <span className="event-pill event-state">{candidate.recommendedAction.replace("_", " ")}</span>
                        </div>
                        <p>{candidate.reason}</p>
                        <div className="memory-entry-meta">
                          <span>{candidate.status}</span>
                          <span>{candidate.workflowId ?? "no workflow"}</span>
                          <span>{candidate.localPath ?? "no local path"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No review candidates yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p>No cleanup report loaded yet.</p>
          )}
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Memory Entry Drafts</h2>
            <span>{snapshot?.memoryEntries.length ?? 0} saved</span>
          </div>
          <p className="muted-line">
            Use this after a scene settles. It turns the current table state and recent events into a reusable
            campaign-memory artifact.
          </p>
          <button
            className="export-button"
            disabled={pendingActionKey !== ""}
            onClick={() => void createMemoryEntry()}
            type="button"
          >
            Create Memory Entry
          </button>
          {memoryEntryStatus ? (
            <p className="export-note">
              {memoryEntryStatus === "creating"
                ? "Building memory entry..."
                : memoryEntryStatus.startsWith("ready:")
                  ? memoryEntryExportPath
                    ? `Memory entry saved to ${memoryEntryExportPath}`
                    : "Memory entry created."
                  : "Memory entry generation failed."}
            </p>
          ) : null}
          <div className="memory-entry-list">
            {snapshot?.memoryEntries.length ? (
              snapshot.memoryEntries.map((entry) => (
                <div className="memory-entry-card" key={entry.id}>
                  <div className="memory-entry-header">
                    <strong>{entry.source.label}</strong>
                    <span className="event-pill event-memory">{formatMemoryKind(entry.kind)}</span>
                  </div>
                  <p>{entry.summary}</p>
                  <div className="memory-entry-meta">
                    <span>{formatVisibilityLabel(entry.visibility)}</span>
                    <span>{entry.status}</span>
                    <span>{formatTime(entry.createdAt)}</span>
                  </div>
                  {entry.entities.length ? (
                    <div className="tag-row">
                      {entry.entities.slice(0, 6).map((entity) => (
                        <span className="tag-chip" key={`${entry.id}-${entity}`}>
                          {entity}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p>No memory entries generated yet.</p>
            )}
          </div>
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Local Model Adapter</h2>
            <span>{localModelDraft?.adapter.mode ?? "placeholder"}</span>
          </div>
          <p className="muted-line">
            This is the fast narrator lane. Use it to preview moment-to-moment scene narration built from the
            current packet.
          </p>
          <button
            className="export-button"
            disabled={pendingActionKey !== ""}
            onClick={() => void runLocalModelDraft()}
            type="button"
          >
            Run Local Model Draft
          </button>
          {localModelStatus ? (
            <p className="export-note">
              {localModelStatus === "running"
                ? "Preparing local-model draft..."
                : localModelStatus === "ready"
                  ? localModelDraft?.adapter.endpointConfigured
                    ? `Placeholder contract built for ${localModelDraft.adapter.endpoint}`
                    : "Placeholder contract built with no local endpoint configured yet."
                  : "Local-model draft failed."}
            </p>
          ) : null}
          {localModelDraft ? (
            <div className="context-block">
              <div className="packet-meta-grid">
                <div>
                  <span>Scene Packet</span>
                  <strong>{localModelDraft.request.sceneTitle}</strong>
                </div>
                <div>
                  <span>State / Media / Audio</span>
                  <strong>
                    {localModelDraft.request.proposedStateEventCount} / {localModelDraft.request.mediaRequestCount} /{" "}
                    {localModelDraft.request.audioCueCount}
                  </strong>
                </div>
              </div>
              <div className="context-row">
                <strong>Prompt Preview</strong>
                <p>{localModelDraft.request.promptPreview}</p>
              </div>
              <div className="context-row">
                <strong>Context Summary</strong>
                <p>{localModelDraft.request.contextSummary}</p>
              </div>
              <div className="context-row">
                <strong>Draft Narration</strong>
                <p>{localModelDraft.response.narration}</p>
              </div>
              <div className="context-row">
                <strong>Suggested Next Beat</strong>
                <p>{localModelDraft.response.suggestedNextBeat}</p>
              </div>
              <div className="context-list">
                {localModelDraft.response.gmNotes.map((note) => (
                  <div className="context-row" key={note}>
                    <strong>GM Note</strong>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              {localModelDraft.response.riskyStateChangeWarning ? (
                <div className="validation-list">
                  <p>{localModelDraft.response.riskyStateChangeWarning}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p>No local-model draft run yet.</p>
          )}
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel">
          <div className="panel-header">
            <h2>Director Mode Adapter</h2>
            <span>{directorDraft?.adapter.mode ?? "placeholder"}</span>
          </div>
          <p className="muted-line">
            This is the higher-level planning lane. Use it for pacing, reveal order, canon notes, and scene
            escalation rather than line-by-line narration.
          </p>
          <button
            className="export-button"
            disabled={pendingActionKey !== ""}
            onClick={() => void runDirectorModeDraft()}
            type="button"
          >
            Run Director Mode Draft
          </button>
          {directorStatus ? (
            <p className="export-note">
              {directorStatus === "running"
                ? "Preparing director-mode draft..."
                : directorStatus === "ready"
                  ? directorDraft?.adapter.enabled
                    ? `Placeholder director contract built for ${directorDraft.adapter.model}`
                    : "Placeholder director contract built with no director model configured yet."
                  : "Director-mode draft failed."}
            </p>
          ) : null}
          {directorDraft ? (
            <div className="context-block">
              <div className="packet-meta-grid">
                <div>
                  <span>Scene Packet</span>
                  <strong>{directorDraft.request.sceneTitle}</strong>
                </div>
                <div>
                  <span>Memory / Approvals</span>
                  <strong>
                    {directorDraft.request.memoryEntryCount} / {directorDraft.request.pendingApprovalCount}
                  </strong>
                </div>
              </div>
              <div className="context-row">
                <strong>Prompt Preview</strong>
                <p>{directorDraft.request.promptPreview}</p>
              </div>
              <div className="context-row">
                <strong>Context Summary</strong>
                <p>{directorDraft.request.contextSummary}</p>
              </div>
              <div className="context-row">
                <strong>Director Guidance</strong>
                <p>{directorDraft.response.directorGuidance}</p>
              </div>
              <div className="context-list">
                {directorDraft.response.revealPlan.map((step) => (
                  <div className="context-row" key={step}>
                    <strong>Reveal Plan</strong>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
              <div className="context-list">
                {directorDraft.response.canonizationNotes.map((note) => (
                  <div className="context-row" key={note}>
                    <strong>Canonization Note</strong>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              {directorDraft.response.escalationWarning ? (
                <div className="validation-list">
                  <p>{directorDraft.response.escalationWarning}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p>No director-mode draft run yet.</p>
          )}
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>AI Activity Log</h2>
            <span>{aiLogs.length} recent entries</span>
          </div>
          <p className="muted-line">
            This log shows what the AI-facing runtime prepared, validated, queued, or refused. It is mainly for
            debugging and trust-building while we wire the real adapters in.
          </p>
          <div className="event-log">
            {aiLogs.length ? (
              aiLogs.map((entry) => (
                <div className="event-row" key={entry.id}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>
                      {entry.adapter} · {entry.kind} · {entry.correlationId}
                    </p>
                  </div>
                  <div className="event-meta">
                    <span className={`event-pill ${entry.kind === "validation_failure" ? "event-validation" : "event-memory"}`}>
                      {entry.kind.replace(/_/g, " ")}
                    </span>
                    <small>{formatTime(entry.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>No AI activity logged yet.</p>
            )}
          </div>
        </article>

        ) : null}

        {advancedMode ? (

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>Error Log</h2>
            <span>{errorEvents.length} recent events</span>
          </div>
          <p className="muted-line">
            These are service failures, degraded states, and recoverable errors the runtime detected. They are
            GM-only so players do not see system problems during a session.
          </p>
          <div className="event-log">
            {errorEvents.length ? (
              errorEvents.map((entry) => (
                <div className="event-row" key={entry.id}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>{entry.message}</p>
                    <p className="helper-note">{entry.recoveryHint}</p>
                  </div>
                  <div className="event-meta">
                    <span className={`event-pill ${entry.severity === "critical" ? "event-validation" : entry.severity === "error" ? "event-state" : "event-memory"}`}>
                      {entry.severity} · {entry.service}
                    </span>
                    <small>{formatTime(entry.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>No errors logged. Services are running cleanly.</p>
            )}
          </div>
        </article>

        ) : null}

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

        {advancedMode ? (

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

        ) : null}

        {diceAnimation ? (
          <DiceOverlay roll={diceAnimation} onClose={() => setDiceAnimation(null)} />
        ) : null}
      </section>
    </main>
  );
}
