export const capabilityStates = ["disabled", "unconfigured", "configured", "reachable", "ready", "busy", "failed"] as const;
export type CapabilityState = typeof capabilityStates[number];

// Browser-safe TTRPG host wire contracts. Audience projections remain server-owned.
import type { Character, RollRecord, CurrentAction } from "./index.js";

export type ServiceState = {
  capability?: { enabled: boolean; configured: boolean; state: CapabilityState; checkedAt: string | null };
  name: string;
  status: "ok" | "degraded" | "offline" | "unknown";
  latencyMs?: number;
  message?: string;
};

export type RuntimeResources = {
  sampledAt: string; rssBytes: number; heapUsedBytes: number; hostFreeMemoryBytes: number; hostTotalMemoryBytes: number;
  eventLoopDelayP95Ms: number | null; gpu: "unmeasured";
};
export type RuntimeStatus = {
  id: string;
  status: "ok" | "degraded" | "offline" | "maintenance";
  mode: "fast" | "scene" | "cinematic" | "prep" | "offline";
  updatedAt: string;
  services: ServiceState[];
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
  mediaPressure: {
    level: "low" | "elevated" | "high";
    summary: string;
    reasons: string[];
    blockedJobTypes: MediaJob["type"][];
  };
  warnings: string[];
  resources?: RuntimeResources;
};




export type TableEventRecord = {
  id: string;
  category: "roll" | "state" | "claim" | "memory" | "media";
  type:
    | "roll_recorded"
    | "hp_changed"
    | "resource_changed"
    | "condition_added"
    | "condition_removed"
    | "character_created"
    | "character_claimed"
    | "character_released"
    | "proposal_approved"
    | "proposal_rejected"
    | "memory_entry_created"
    | "media_job_started"
    | "media_job_failed"
    | "media_metadata_recorded"
    | "initiative_set";
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

export type MemoryEntry = {
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

export type CampaignFact = {
  id: string;
  text: string;
  source: string;
};

export type CampaignBible = {
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

export type CampaignLocation = {
  id: string;
  name: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  summary: string;
  features: string[];
};

export type CampaignNpc = {
  id: string;
  name: string;
  role: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  motive: string;
  detail: string;
};

export type ActiveSceneContext = {
  title: string;
  location: CampaignLocation | null;
  npcs: CampaignNpc[];
  facts: CampaignFact[];
  tone: string[];
  safety: CampaignBible["safety"];
};

export type LocalModelAdapterDraft = {
  adapter: {
    mode: "placeholder" | "live";
    provider: "local_llm" | "ollama" | "openai";
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

export type DirectorModeAdapterDraft = {
  adapter: {
    mode: "placeholder" | "live";
    provider: "chatgpt_director" | "ollama" | "openai";
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

export type AiLogEntry = {
  id: string;
  kind: "input_packet" | "output_packet" | "tool_call" | "validation_failure";
  adapter: "scene_packet" | "local_model" | "director_mode";
  createdAt: string;
  summary: string;
  correlationId: string;
  details: Record<string, unknown>;
};

export type ErrorEvent = {
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

export type MediaJob = {
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

export type AssetRecord = {
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

export type CleanupPolicy = {
  failedJobArchiveAfterHours: number;
  draftJobArchiveAfterHours: number;
  rejectedJobArchiveAfterHours: number;
  protectedGeneratedAssetCount: number;
  notes: string[];
};

export type CleanupCandidate = {
  kind: "media_job" | "asset_record";
  id: string;
  status: string;
  reason: string;
  recommendedAction: "archive_metadata" | "review_output" | "keep_final";
  workflowId?: string | null;
  localPath?: string | null;
  timestamp?: string | null;
};

export type CleanupReport = {
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

export type StateEventProposal = {
  id: string;
  createdAt: string;
  summary: string;
  submittedBy: {
    id: string;
    kind: "gm" | "player" | "system" | "ai_assistant";
    label: string;
  };
  event: StateEventRequest;
};

export const sceneBeatKinds = ["description", "choice", "threat", "clue", "consequence", "memory"] as const;

export type ScenePacket = {
  id: string;
  campaignId: string;
  sceneTitle: string;
  visibility: "gm_only" | "player_visible" | "public_demo";
  summary: string;
  beats: Array<{
    kind: typeof sceneBeatKinds[number];
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

export type ScenePacketValidation = {
  ok: boolean;
  errors: string[];
};

export type SessionSnapshot = {
  campaignProgress?: import("./campaign-progress.js").CampaignProgress;
  schemaVersion: 1;
  sessionId: string;
  mode: "ttrpg";
  roundId: null;
  stage: "table";
  revision: number;
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
  audioCueQueue: AudioCue[];
  currentAction: CurrentAction | null;
};

export type StateEventRequest =
  | {
      type: "hp_delta";
      characterId: string;
      amount: number;
      requestId?: string;
    }
  | {
      type: "condition_add";
      characterId: string;
      condition: string;
      requestId?: string;
    }
  | {
      type: "condition_remove";
      characterId: string;
      condition: string;
      requestId?: string;
    }
  | {
      type: "resource_set";
      characterId: string;
      resourceId: string;
      value: number;
      requestId?: string;
    }
  | {
      type: "initiative_set";
      characterId: string;
      value: number | null;
      requestId?: string;
    };

export type AudioCue = {
  id: string;
  kind: string;
  status: "queued" | "playing" | "played" | "skipped";
  visibility: "gm_only" | "player_visible" | "public_demo";
  trigger: string;
  tags: string[];
  loop: boolean;
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  notes?: string;
  sceneId?: string;
  createdAt: string;
};

export type AudioTrack = {
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

export type PlaybackState = {
  status: "idle" | "playing" | "paused";
  currentTrackId: string | null;
  volume: number;
  muted: boolean;
  loop: boolean;
  startedAt: string | null;
  pausedAt: string | null;
};

export type StateEventDraft = StateEventRequest extends infer Request
  ? Request extends StateEventRequest ? Omit<Request, "requestId"> : never : never;
export type StateEventCommand = StateEventRequest & { requestId: string };

export type HostSocketEnvelope =
  | { type: "connected"; payload: { runtimeStatus: RuntimeStatus; sessionSnapshot: SessionSnapshot } }
  | { type: "runtime_status"; payload: RuntimeStatus }
  | { type: "roll_recorded"; payload: RollRecord }
  | { type: "session_snapshot"; payload: SessionSnapshot };
