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
  const [exportPath, setExportPath] = useState("");
  const [scenePacket, setScenePacket] = useState<ScenePacket | null>(null);
  const [scenePacketStatus, setScenePacketStatus] = useState("");
  const [scenePacketValidation, setScenePacketValidation] = useState<ScenePacketValidation | null>(null);
  const [mediaQueueStatus, setMediaQueueStatus] = useState("");
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [cleanupReportStatus, setCleanupReportStatus] = useState("");
  const [memoryEntryStatus, setMemoryEntryStatus] = useState("");
  const [memoryEntryExportPath, setMemoryEntryExportPath] = useState("");
  const [localModelDraft, setLocalModelDraft] = useState<LocalModelAdapterDraft | null>(null);
  const [localModelStatus, setLocalModelStatus] = useState("");
  const [directorDraft, setDirectorDraft] = useState<DirectorModeAdapterDraft | null>(null);
  const [directorStatus, setDirectorStatus] = useState("");
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>([]);

  async function exportSessionSummary() {
    setExportStatus("exporting");

    try {
      const response = await fetch("/api/session-summary.md");

      if (!response.ok) {
        setExportStatus("failed");
        return;
      }

      setExportPath(response.headers.get("X-Export-Path") ?? "");
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

  async function loadCleanupReport(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setCleanupReportStatus("loading");
    }

    try {
      const response = await fetch("/api/media-cleanup-report");

      if (!response.ok) {
        if (!options?.silent) {
          setCleanupReportStatus("failed");
        }
        return;
      }

      const json = (await response.json()) as {
        report: CleanupReport;
      };
      setCleanupReport(json.report);
      if (!options?.silent) {
        setCleanupReportStatus("ready");
      }
    } catch {
      if (!options?.silent) {
        setCleanupReportStatus("failed");
      }
    }
  }

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
                <button
                  className="mini-button secondary-button"
                  disabled={pendingActionKey !== ""}
                  onClick={() => void queueCharacterVisualCanonJob(character.id)}
                  type="button"
                >
                  Queue Visual Canon Job
                </button>
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

        <article className="panel">
          <div className="panel-header">
            <h2>Scene Packet Draft</h2>
            <span>{scenePacket ? scenePacket.visibility : "not generated"}</span>
          </div>
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
                Use in order: generate the packet, queue any risky state or media work you want to keep, then
                run the local/director drafts against that packet.
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
              {mediaQueueStatus === "queueing" ||
              mediaQueueStatus.startsWith("queued:") ||
              mediaQueueStatus === "queueing-visual-canon" ||
              mediaQueueStatus.startsWith("visual-canon:") ||
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
                      : "Media jobs failed to queue."}
                </p>
              ) : null}
            </div>
          ) : (
            <p>No scene packet generated yet.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>Media Job Queue</h2>
            <span>{snapshot?.mediaJobs.length ?? 0} tracked</span>
          </div>
          <p className="muted-line">
            These jobs are the async visual or audio work hanging off scene packets. They are local queue entries
            for now, not a full ComfyUI execution pipeline yet.
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

        <article className="panel">
          <div className="panel-header">
            <h2>Generated Media Metadata</h2>
            <span>{snapshot?.assetRecords.length ?? 0} tracked</span>
          </div>
          <p className="muted-line">
            These records keep prompts, workflows, and intended local output paths in runtime state while the
            actual files stay outside Git.
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

        <article className="panel">
          <div className="panel-header">
            <h2>Memory Entry Drafts</h2>
            <span>{snapshot?.memoryEntries.length ?? 0} saved</span>
          </div>
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

        <article className="panel">
          <div className="panel-header">
            <h2>Local Model Adapter</h2>
            <span>{localModelDraft?.adapter.mode ?? "placeholder"}</span>
          </div>
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

        <article className="panel">
          <div className="panel-header">
            <h2>Director Mode Adapter</h2>
            <span>{directorDraft?.adapter.mode ?? "placeholder"}</span>
          </div>
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

        <article className="panel panel-wide">
          <div className="panel-header">
            <h2>AI Activity Log</h2>
            <span>{aiLogs.length} recent entries</span>
          </div>
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
