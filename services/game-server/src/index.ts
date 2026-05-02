import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  initDb,
  loadTable,
  saveTable,
  loadRollLog,
  saveRollLog,
  loadEventLog,
  saveEventLog,
  loadMediaJobs,
  saveMediaJobs,
  loadMemoryEntries,
  saveMemoryEntries,
  loadApprovalQueue,
  saveApprovalQueue,
  loadAudioCues,
  saveAudioCues
} from "./db.js";

type ServiceState = {
  name: string;
  status: "ok" | "degraded" | "offline" | "unknown";
  latencyMs?: number;
  message?: string;
};

type RuntimeStatus = {
  id: string;
  status: "ok" | "degraded" | "offline" | "maintenance";
  mode: "fast" | "scene" | "cinematic" | "prep" | "offline";
  updatedAt: string;
  services: ServiceState[];
  clients: Array<{
    id: string;
    role: ClientSession["role"];
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
  event: StateEventRequest;
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
  audioCueQueue: typeof audioCueQueue;
};

type StateEventRequest =
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
    };

type ClientSession = {
  id: string;
  role: "gm" | "player" | "spectator" | "ai" | "admin";
  clientId: string;
  connectedAt: string;
  lastSeenAt: string;
};

type CachedMutationResponse = {
  statusCode: number;
  body: unknown;
  expiresAt: number;
};

const host = process.env.BDE_HOST ?? "0.0.0.0";
const gameServerPort = Number(process.env.BDE_GAME_SERVER_PORT ?? 4310);
const playerCompanionPort = Number(process.env.BDE_PLAYER_COMPANION_PORT ?? 4311);
const comfyRouterEndpoint = process.env.BDE_COMFY_ROUTER_ENDPOINT?.trim() || "";
const mediaOutputRoot =
  process.env.BDE_MEDIA_OUTPUT_ROOT?.trim() || "G:\\AI-DM\\04_assets\\generated";
const localModelEndpoint = process.env.BDE_LOCAL_MODEL_ENDPOINT?.trim() || "";
const directorModeModel = process.env.BDE_DIRECTOR_MODE_MODEL?.trim() || "";
const audioServiceEndpoint = process.env.BDE_AUDIO_SERVICE_ENDPOINT?.trim() || "";
const currentDir = dirname(fileURLToPath(import.meta.url));
const playerCompanionDistDir = join(currentDir, "../../../apps/player-companion/dist");
const sessionSummaryExportDir = join(currentDir, "../../../_exports/session-summaries");
const memoryEntryExportDir = join(currentDir, "../../../_exports/memory-entries");
const aiLogExportDir = join(currentDir, "../../../_exports/ai-logs");
const repoExportsRoot = join(currentDir, "../../../_exports");
const sampleCampaignDir = join(currentDir, "../../../campaigns/sample-campaign");
const gmSystemPromptPath = join(currentDir, "../../../prompts/gm-system-prompt.md");
const directorPromptPath = join(currentDir, "../../../prompts/director-prompt.md");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const staleClientThresholdMs = 15000;

const clientSessions = new Map<string, ClientSession>();
const recentMutationResponses = new Map<string, CachedMutationResponse>();

// Initialize SQLite and load persisted state
initDb();

const defaultParty: Character[] = [
  {
    id: "character-kael",
    name: "Kael",
    classLabel: "Rogue 3",
    hp: { current: 22, max: 30 },
    armorClass: 15,
    conditions: ["Alert", "Uninjured stride"],
    resources: [
      { id: "resource-hit-dice", label: "Hit Dice", current: 3, max: 3 },
      { id: "resource-cunning-plan", label: "Trick Tokens", current: 2, max: 3 }
    ],
    inventory: [
      { id: "item-lockpicks", name: "Lockpick Set", quantity: 1, detail: "well-oiled" },
      { id: "item-dagger", name: "Curved Dagger", quantity: 2 },
      { id: "item-vial", name: "Shadow Vial", quantity: 1, detail: "single-use escape smoke" }
    ],
    notes: ["Watching every door and every lie."],
    claimedByClientId: null,
    claimedByLabel: null
  },
  {
    id: "character-sera",
    name: "Sera",
    classLabel: "Cleric 3",
    hp: { current: 27, max: 27 },
    armorClass: 18,
    conditions: ["Blessed ward"],
    resources: [
      { id: "resource-spell-slots-1", label: "Spell Slots I", current: 4, max: 4 },
      { id: "resource-spell-slots-2", label: "Spell Slots II", current: 2, max: 2 },
      { id: "resource-channel-divinity", label: "Channel Divinity", current: 1, max: 1 }
    ],
    inventory: [
      { id: "item-mace", name: "Sanctified Mace", quantity: 1 },
      { id: "item-bandages", name: "Field Bandages", quantity: 3 },
      { id: "item-reliquary", name: "Ash Reliquary", quantity: 1, detail: "sealed" }
    ],
    notes: ["Low patience for cultists and false saints."],
    claimedByClientId: null,
    claimedByLabel: null
  },
  {
    id: "character-ivar",
    name: "Ivar",
    classLabel: "Wizard 3",
    hp: { current: 14, max: 18 },
    armorClass: 12,
    conditions: ["Fatigued"],
    resources: [
      { id: "resource-spell-slots-1", label: "Spell Slots I", current: 2, max: 4 },
      { id: "resource-spell-slots-2", label: "Spell Slots II", current: 1, max: 2 },
      { id: "resource-focus-charge", label: "Focus Charges", current: 1, max: 3 }
    ],
    inventory: [
      { id: "item-spellbook", name: "Spellbook", quantity: 1, detail: "salt-stained" },
      { id: "item-lens", name: "Aether Lens", quantity: 1 },
      { id: "item-chalk", name: "Ward Chalk", quantity: 4 }
    ],
    notes: ["Tracking a pattern in the black sand pulses."],
    claimedByClientId: null,
    claimedByLabel: null
  }
];

const loadedParty = loadTable<Character>("party");
const party: Character[] = loadedParty.length ? loadedParty : defaultParty;

const defaultRoll: RollRecord = {
  id: randomUUID(),
  actorId: "character-sera",
  actorName: "Sera",
  dice: "1d20",
  modifier: 4,
  rolled: 15,
  total: 19,
  advantage: null,
  note: "Insight",
  timestamp: new Date().toISOString()
};

const loadedRolls = loadRollLog<RollRecord>();
const rollLog: RollRecord[] = loadedRolls.length ? loadedRolls : [defaultRoll];

const loadedEvents = loadEventLog<TableEventRecord>();
const eventLog: TableEventRecord[] = loadedEvents;

const loadedApprovals = loadApprovalQueue<StateEventProposal>();
const approvalQueue: StateEventProposal[] = loadedApprovals;

const loadedMediaJobs = loadMediaJobs<MediaJob>();
const mediaJobs: MediaJob[] = loadedMediaJobs;

const loadedAssets = loadTable<AssetRecord>("asset_records");
const assetRecords: AssetRecord[] = loadedAssets;

const loadedMemoryEntries = loadMemoryEntries<MemoryEntry>();
const memoryEntries: MemoryEntry[] = loadedMemoryEntries;

type AudioCue = {
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

const loadedAudioCues = loadAudioCues<AudioCue>();
const audioCueQueue: AudioCue[] = loadedAudioCues;

const aiLogs: AiLogEntry[] = [];
const errorEvents: ErrorEvent[] = [];

function recordErrorEvent(entry: Omit<ErrorEvent, "id" | "createdAt">) {
  const event: ErrorEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry
  };
  errorEvents.unshift(event);
  errorEvents.splice(24);
  return event;
}

function recordAiLog(entry: Omit<AiLogEntry, "id" | "createdAt">) {
  const logEntry: AiLogEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry
  };
  aiLogs.unshift(logEntry);
  aiLogs.splice(24);
  mkdirSync(aiLogExportDir, { recursive: true });
  writeFileSync(
    join(aiLogExportDir, "recent-ai-log.jsonl"),
    aiLogs
      .slice()
      .reverse()
      .map((item) => JSON.stringify(item))
      .join("\n"),
    "utf8"
  );
  return logEntry;
}

function parseQuotedValue(line: string) {
  const quotedMatch = line.match(/:\s*"([^"]*)"/);

  if (quotedMatch) {
    return quotedMatch[1];
  }

  return line.split(":").slice(1).join(":").trim();
}

function parseCampaignBibleYaml(raw: string): CampaignBible {
  const lines = raw.split(/\r?\n/);
  const tone: string[] = [];
  const safetyLines: string[] = [];
  const safetyVeils: string[] = [];
  const facts: CampaignFact[] = [];
  let currentSection: "tone" | "lines" | "veils" | "facts" | null = null;
  let pendingFact: Partial<CampaignFact> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed === "tone:") {
      currentSection = "tone";
      continue;
    }

    if (trimmed === "lines:") {
      currentSection = "lines";
      continue;
    }

    if (trimmed === "veils:") {
      currentSection = "veils";
      continue;
    }

    if (trimmed === "facts:") {
      currentSection = "facts";
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (currentSection === "tone") {
        tone.push(trimmed.replace(/^- /, "").replace(/^"|"$/g, ""));
        continue;
      }

      if (currentSection === "lines") {
        safetyLines.push(trimmed.replace(/^- /, "").replace(/^"|"$/g, ""));
        continue;
      }

      if (currentSection === "veils") {
        safetyVeils.push(trimmed.replace(/^- /, "").replace(/^"|"$/g, ""));
        continue;
      }

      if (currentSection === "facts") {
        if (pendingFact?.id && pendingFact.text && pendingFact.source) {
          facts.push(pendingFact as CampaignFact);
        }

        pendingFact = {
          id: parseQuotedValue(trimmed.replace(/^- /, ""))
        };
      }

      continue;
    }

    if (currentSection === "facts" && pendingFact) {
      if (trimmed.startsWith("text:")) {
        pendingFact.text = parseQuotedValue(trimmed);
      } else if (trimmed.startsWith("source:")) {
        pendingFact.source = parseQuotedValue(trimmed);
      }
    }
  }

  if (pendingFact?.id && pendingFact.text && pendingFact.source) {
    facts.push(pendingFact as CampaignFact);
  }

  const getRootValue = (key: string) => {
    const matched = lines.find((line) => line.startsWith(`${key}:`));
    return matched ? parseQuotedValue(matched) : "";
  };

  const ratingLine = lines.find((line) => line.trim().startsWith("rating:"));

  return {
    id: getRootValue("id"),
    title: getRootValue("title"),
    subtitle: getRootValue("subtitle"),
    visibility: (getRootValue("visibility") as CampaignBible["visibility"]) || "public_demo",
    tone,
    safety: {
      rating: ratingLine ? parseQuotedValue(ratingLine.trim()) : "unknown",
      lines: safetyLines,
      veils: safetyVeils
    },
    facts
  };
}

function loadSampleCampaignContext() {
  const campaignBible = parseCampaignBibleYaml(
    readFileSync(join(sampleCampaignDir, "campaign-bible.yml"), "utf8")
  );
  const locationFile = JSON.parse(
    readFileSync(join(sampleCampaignDir, "locations.json"), "utf8")
  ) as { locations: CampaignLocation[] };
  const npcFile = JSON.parse(readFileSync(join(sampleCampaignDir, "npcs.json"), "utf8")) as {
    npcs: CampaignNpc[];
  };

  return {
    campaignBible,
    locations: locationFile.locations,
    npcs: npcFile.npcs
  };
}

const sampleCampaignContext = loadSampleCampaignContext();

function buildActiveSceneContext(currentScene: string): ActiveSceneContext {
  const sceneLower = currentScene.toLowerCase();
  const location =
    sampleCampaignContext.locations.find((entry) =>
      sceneLower.includes(entry.name.toLowerCase())
    ) ?? null;
  const locationTerms = location
    ? location.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length > 2)
    : [];
  const npcs = sampleCampaignContext.npcs.filter((entry) => {
    const roleLower = entry.role.toLowerCase();
    return locationTerms.some((term) => roleLower.includes(term));
  });
  const facts = sampleCampaignContext.campaignBible.facts.filter((fact) => {
    const factLower = fact.text.toLowerCase();

    if (location && factLower.includes(location.name.toLowerCase())) {
      return true;
    }

    return location?.features.some((feature) => factLower.includes(feature.toLowerCase())) ?? false;
  });

  return {
    title: currentScene,
    location,
    npcs,
    facts,
    tone: sampleCampaignContext.campaignBible.tone,
    safety: sampleCampaignContext.campaignBible.safety
  };
}

app.use(cors());
app.use(express.json());
app.use("/player", express.static(playerCompanionDistDir));

function extractRoleFromRequest(request: express.Request): ClientSession["role"] {
  const headerRole = request.headers["x-bde-role"];
  const queryRole = request.query.role;
  let raw: string;

  if (typeof headerRole === "string") {
    raw = headerRole;
  } else if (typeof queryRole === "string") {
    raw = queryRole;
  } else if (Array.isArray(queryRole) && typeof queryRole[0] === "string") {
    raw = queryRole[0];
  } else {
    raw = "spectator";
  }

  const normalized = raw.toLowerCase().trim();

  if (["gm", "player", "spectator", "ai", "admin"].includes(normalized)) {
    return normalized as ClientSession["role"];
  }

  return "spectator";
}

function requireRole(...allowed: ClientSession["role"][]) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const role = extractRoleFromRequest(request);

    if (!allowed.includes(role)) {
      response.status(403).json({
        error: `This action requires one of these roles: ${allowed.join(", ")}. Your role is ${role}.`
      });
      return;
    }

    next();
  };
}

function getMediaPressure() {
  const runningJobs = mediaJobs.filter((job) => job.status === "running");
  const queuedJobs = mediaJobs.filter((job) => job.status === "queued");
  const failedJobs = mediaJobs.filter((job) => job.status === "failed");
  const heavyTypes = new Set<MediaJob["type"]>(["video", "upscale", "interpolation"]);
  const runningHeavyCount = runningJobs.filter((job) => heavyTypes.has(job.type)).length;
  const queuedHeavyCount = queuedJobs.filter((job) => heavyTypes.has(job.type)).length;
  const reasons: string[] = [];
  const blocked = new Set<MediaJob["type"]>();
  let level: "low" | "elevated" | "high" = "low";

  if (runningHeavyCount > 0) {
    reasons.push("A heavy media job is already running.");
    level = "elevated";
    blocked.add("video");
    blocked.add("upscale");
    blocked.add("interpolation");
  }

  if (runningJobs.length >= 2) {
    reasons.push("Two or more media jobs are already running.");
    level = "high";
    blocked.add("image");
    blocked.add("visual_canon");
    blocked.add("video");
    blocked.add("upscale");
    blocked.add("interpolation");
  }

  if (queuedJobs.length >= 5) {
    reasons.push("The media queue already has five or more waiting jobs.");
    level = level === "high" ? "high" : "elevated";
    blocked.add("video");
    blocked.add("upscale");
    blocked.add("interpolation");
  }

  if (queuedHeavyCount >= 2) {
    reasons.push("There are already multiple expensive jobs waiting in the queue.");
    level = level === "high" ? "high" : "elevated";
    blocked.add("video");
    blocked.add("upscale");
    blocked.add("interpolation");
  }

  if (failedJobs.length >= 3) {
    reasons.push("Several media jobs have failed recently; the pipeline may be unstable.");
    if (level === "low") {
      level = "elevated";
    }
  }

  const summary =
    level === "high"
      ? "Media pressure is high. Keep expensive jobs paused until running work clears."
      : level === "elevated"
        ? "Media pressure is elevated. Be careful about starting more expensive jobs."
        : "Media pressure looks safe for another job.";

  return {
    level,
    summary,
    reasons,
    blockedJobTypes: Array.from(blocked)
  };
}

function getCleanupPolicy(): CleanupPolicy {
  return {
    failedJobArchiveAfterHours: 24,
    draftJobArchiveAfterHours: 6,
    rejectedJobArchiveAfterHours: 12,
    protectedGeneratedAssetCount: 6,
    notes: [
      "Generated media files live outside Git and should be reviewed before any deletion workflow exists.",
      "Failed, draft, and rejected jobs are safe archive candidates once they age past the policy window.",
      "The first cleanup slice is report-only: it never deletes files or erases final asset metadata."
    ]
  };
}

function getAgeHours(isoValue?: string | null) {
  if (!isoValue) {
    return 0;
  }

  return Math.max(0, (Date.now() - new Date(isoValue).getTime()) / 36e5);
}

function buildCleanupReport(): CleanupReport {
  const policy = getCleanupPolicy();
  const archiveCandidates: CleanupCandidate[] = [];
  const reviewCandidates: CleanupCandidate[] = [];
  const generatedAssetsNewestFirst = [...assetRecords]
    .filter((asset) => asset.status === "generated")
    .sort((left, right) => {
      const leftTime = String(left.metadata.generatedAt ?? "");
      const rightTime = String(right.metadata.generatedAt ?? "");
      return rightTime.localeCompare(leftTime);
    });
  const protectedAssetIds = new Set(
    generatedAssetsNewestFirst.slice(0, policy.protectedGeneratedAssetCount).map((asset) => asset.id)
  );

  mediaJobs.forEach((job) => {
    const ageBasis = job.completedAt ?? job.startedAt ?? job.createdAt;
    const ageHours = getAgeHours(ageBasis);

    if (job.status === "failed" && ageHours >= policy.failedJobArchiveAfterHours) {
      archiveCandidates.push({
        kind: "media_job",
        id: job.id,
        status: job.status,
        reason: `Failed jobs older than ${policy.failedJobArchiveAfterHours} hours should be archived out of the active queue.`,
        recommendedAction: "archive_metadata",
        workflowId: job.workflowId ?? null,
        localPath: job.outputPath ?? null,
        timestamp: ageBasis
      });
      return;
    }

    if (job.status === "draft" && ageHours >= policy.draftJobArchiveAfterHours) {
      archiveCandidates.push({
        kind: "media_job",
        id: job.id,
        status: job.status,
        reason: `Draft jobs older than ${policy.draftJobArchiveAfterHours} hours are stale and should be archived.`,
        recommendedAction: "archive_metadata",
        workflowId: job.workflowId ?? null,
        localPath: job.outputPath ?? null,
        timestamp: ageBasis
      });
      return;
    }

    if (job.status === "rejected" && ageHours >= policy.rejectedJobArchiveAfterHours) {
      archiveCandidates.push({
        kind: "media_job",
        id: job.id,
        status: job.status,
        reason: `Rejected jobs older than ${policy.rejectedJobArchiveAfterHours} hours should be archived to reduce queue noise.`,
        recommendedAction: "archive_metadata",
        workflowId: job.workflowId ?? null,
        localPath: job.outputPath ?? null,
        timestamp: ageBasis
      });
      return;
    }

    if (job.status === "generated" && !job.outputPath) {
      reviewCandidates.push({
        kind: "media_job",
        id: job.id,
        status: job.status,
        reason: "Generated jobs should carry a resolved local output path before they are treated as stable final assets.",
        recommendedAction: "review_output",
        workflowId: job.workflowId ?? null,
        localPath: null,
        timestamp: ageBasis
      });
    }
  });

  assetRecords.forEach((asset) => {
    const generatedAt = typeof asset.metadata.generatedAt === "string" ? asset.metadata.generatedAt : null;

    if (asset.status === "failed") {
      reviewCandidates.push({
        kind: "asset_record",
        id: asset.id,
        status: asset.status,
        reason: "Failed asset metadata needs review before future cleanup rules can trust it.",
        recommendedAction: "review_output",
        workflowId: asset.workflowId ?? null,
        localPath: asset.localPath ?? null,
        timestamp: generatedAt
      });
      return;
    }

    if (asset.status === "generated" && !asset.localPath) {
      reviewCandidates.push({
        kind: "asset_record",
        id: asset.id,
        status: asset.status,
        reason: "Generated asset metadata is missing its local path and should be reviewed before reuse.",
        recommendedAction: "review_output",
        workflowId: asset.workflowId ?? null,
        localPath: null,
        timestamp: generatedAt
      });
      return;
    }

    if (asset.status === "generated" && protectedAssetIds.has(asset.id)) {
      reviewCandidates.push({
        kind: "asset_record",
        id: asset.id,
        status: asset.status,
        reason: "Recent generated assets are protected from cleanup and should be treated as current canon candidates.",
        recommendedAction: "keep_final",
        workflowId: asset.workflowId ?? null,
        localPath: asset.localPath ?? null,
        timestamp: generatedAt
      });
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    policy,
    outputRoots: {
      mediaOutputRoot,
      repoExportsRoot
    },
    summary: {
      trackedMediaJobs: mediaJobs.length,
      trackedAssets: assetRecords.length,
      archiveCandidateCount: archiveCandidates.length,
      reviewCandidateCount: reviewCandidates.filter((candidate) => candidate.recommendedAction === "review_output").length,
      protectedFinalAssetCount: reviewCandidates.filter((candidate) => candidate.recommendedAction === "keep_final").length
    },
    archiveCandidates,
    reviewCandidates
  };
}

function getRuntimeStatus(): RuntimeStatus {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const clients = Array.from(clientSessions.values())
    .map((session) => {
      const claimedCharacter =
        party.find((entry) => entry.claimedByClientId === session.clientId) ?? null;
      const ageMs = nowMs - new Date(session.lastSeenAt).getTime();
      const clientStatus: "active" | "stale" = ageMs > staleClientThresholdMs ? "stale" : "active";

      return {
        id: session.id,
        role: session.role,
        clientId: session.clientId,
        status: clientStatus,
        connectedAt: session.connectedAt,
        lastSeenAt: session.lastSeenAt,
        playerLabel: claimedCharacter?.claimedByLabel ?? null,
        claimedCharacterName: claimedCharacter?.name ?? null
      };
    })
    .sort((left, right) => left.role.localeCompare(right.role) || left.connectedAt.localeCompare(right.connectedAt));
  const staleCount = clients.filter((client) => client.status === "stale").length;
  const mediaPressure = getMediaPressure();
  const warnings = [...mediaPressure.reasons];

  return {
    id: "runtime-main",
    status: staleCount > 0 || mediaPressure.level !== "low" ? "degraded" : "ok",
    mode: "fast",
    updatedAt: now,
    services: [
      {
        name: "game-server",
        status: "ok",
        latencyMs: 2,
        message: "Accepting HTTP requests"
      },
      {
        name: "websocket",
        status: staleCount > 0 ? "degraded" : "ok",
        latencyMs: 5,
        message:
          staleCount > 0
            ? `${clientSessions.size} session(s), ${staleCount} stale`
            : `${clientSessions.size} live session(s)`
      },
      {
        name: "dice-service",
        status: "ok",
        latencyMs: 1,
        message: `${rollLog.length} roll(s) in memory`
      },
      {
        name: "media-queue",
        status: mediaPressure.level === "high" ? "degraded" : mediaJobs.some((job) => job.status === "running") ? "degraded" : "ok",
        message: mediaJobs.length
          ? `${mediaJobs.filter((job) => job.status === "queued").length} queued / ${mediaJobs.filter((job) => job.status === "running").length} running / ${mediaJobs.length} tracked`
          : "No media jobs queued yet"
      },
      {
        name: "resource-pressure",
        status: mediaPressure.level === "high" ? "degraded" : mediaPressure.level === "elevated" ? "degraded" : "ok",
        message: mediaPressure.summary
      },
      {
        name: "asset-metadata",
        status: assetRecords.some((asset) => asset.status === "failed") ? "degraded" : "ok",
        message: assetRecords.length
          ? `${assetRecords.filter((asset) => asset.status === "generated").length} generated / ${assetRecords.length} tracked`
          : "No media metadata recorded yet"
      },
      {
        name: "comfy-router",
        status: comfyRouterEndpoint ? "ok" : "unknown",
        message: comfyRouterEndpoint
          ? `Router configured at ${comfyRouterEndpoint}; submits to ComfyUI when workflow files are present`
          : "No comfy-router endpoint configured yet; media queue remains internal only"
      },
      {
        name: "local-model-adapter",
        status: localModelEndpoint ? "degraded" : "unknown",
        message: localModelEndpoint
          ? `Placeholder adapter ready for ${localModelEndpoint}`
          : "No local model endpoint configured yet; placeholder mode only"
      },
      {
        name: "director-mode-adapter",
        status: directorModeModel ? "degraded" : "unknown",
        message: directorModeModel
          ? `Placeholder director ready for ${directorModeModel}`
          : "No director model configured yet; placeholder mode only"
      },
      {
        name: "audio-service",
        status: audioServiceEndpoint ? "ok" : "unknown",
        message: audioServiceEndpoint
          ? `Audio service configured at ${audioServiceEndpoint}`
          : "No audio service endpoint configured yet"
      }
    ],
    clients,
    mediaPressure,
    warnings
  };
}

function getLanJoinHost() {
  const interfaces = networkInterfaces();
  let linkLocalFallback: string | null = null;

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        if (
          entry.address.startsWith("192.168.") ||
          entry.address.startsWith("10.") ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(entry.address)
        ) {
          return entry.address;
        }

        if (entry.address.startsWith("169.254.")) {
          linkLocalFallback = entry.address;
        }
      }
    }
  }

  return linkLocalFallback ?? "localhost";
}

function getSessionSnapshot(): SessionSnapshot {
  const joinHost = host === "0.0.0.0" ? getLanJoinHost() : host;
  const campaignBible = sampleCampaignContext.campaignBible;
  const activeSceneContext = buildActiveSceneContext(
    "Lantern Gate, just before the watchtower ascent"
  );

  return {
    campaignId: campaignBible.id,
    campaignTitle: campaignBible.title,
    currentScene: activeSceneContext.title,
    tablePin: "BD20",
    joinUrl: `http://${joinHost}:${gameServerPort}/player/?pin=BD20`,
    campaignBible,
    activeSceneContext,
    party,
    rollLog,
    eventLog,
    approvalQueue,
    mediaJobs,
    assetRecords,
    memoryEntries,
    audioCueQueue
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveCharacter(characterId: string) {
  return party.find((entry) => entry.id === characterId) ?? null;
}

function recordTableEvent(event: Omit<TableEventRecord, "id" | "timestamp">) {
  const record: TableEventRecord = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event
  };

  eventLog.unshift(record);
  eventLog.splice(20);

  return record;
}

function publishSessionState() {
  const sessionSnapshot = getSessionSnapshot();
  broadcast("session_snapshot", sessionSnapshot);
  broadcast("runtime_status", getRuntimeStatus());
  return sessionSnapshot;
}

function applyStateEvent(event: StateEventRequest, actorLabel = "GM Dashboard") {
  const character = resolveCharacter(event.characterId);

  if (!character) {
    return {
      ok: false as const,
      statusCode: 404,
      body: {
        error: "Character not found"
      }
    };
  }

  if (event.type === "hp_delta") {
    if (typeof event.amount !== "number" || Number.isNaN(event.amount)) {
      return {
        ok: false as const,
        statusCode: 400,
        body: {
          error: "Numeric amount is required"
        }
      };
    }

    const previous = character.hp.current;
    character.hp.current = clamp(character.hp.current + event.amount, 0, character.hp.max);
    recordTableEvent({
      category: "state",
      type: "hp_changed",
      actor: {
        id: "gm-dashboard",
        kind: "gm",
        label: actorLabel
      },
      visibility: "player_visible",
      summary: `${character.name} HP ${previous} -> ${character.hp.current}`,
      payload: {
        characterId: character.id,
        characterName: character.name,
        previous,
        current: character.hp.current,
        delta: event.amount
      }
    });
    return {
      ok: true as const,
      statusCode: 200,
      body: {
        ok: true,
        sessionSnapshot: publishSessionState()
      }
    };
  }

  if (event.type === "condition_add") {
    const condition = typeof event.condition === "string" ? event.condition.trim() : "";

    if (!condition) {
      return {
        ok: false as const,
        statusCode: 400,
        body: {
          error: "Condition is required"
        }
      };
    }

    if (!character.conditions.includes(condition)) {
      character.conditions.push(condition);
      recordTableEvent({
        category: "state",
        type: "condition_added",
        actor: {
          id: "gm-dashboard",
          kind: "gm",
          label: actorLabel
        },
        visibility: "player_visible",
        summary: `${character.name} gained condition: ${condition}`,
        payload: {
          characterId: character.id,
          characterName: character.name,
          condition
        }
      });
    }

    return {
      ok: true as const,
      statusCode: 200,
      body: {
        ok: true,
        sessionSnapshot: publishSessionState()
      }
    };
  }

  if (event.type === "condition_remove") {
    const condition = typeof event.condition === "string" ? event.condition.trim() : "";

    if (!condition) {
      return {
        ok: false as const,
        statusCode: 400,
        body: {
          error: "Condition is required"
        }
      };
    }

    const hadCondition = character.conditions.includes(condition);
    character.conditions = character.conditions.filter((entry) => entry !== condition);
    if (hadCondition) {
      recordTableEvent({
        category: "state",
        type: "condition_removed",
        actor: {
          id: "gm-dashboard",
          kind: "gm",
          label: actorLabel
        },
        visibility: "player_visible",
        summary: `${character.name} cleared condition: ${condition}`,
        payload: {
          characterId: character.id,
          characterName: character.name,
          condition
        }
      });
    }
    return {
      ok: true as const,
      statusCode: 200,
      body: {
        ok: true,
        sessionSnapshot: publishSessionState()
      }
    };
  }

  if (event.type === "resource_set") {
    if (typeof event.resourceId !== "string" || typeof event.value !== "number" || Number.isNaN(event.value)) {
      return {
        ok: false as const,
        statusCode: 400,
        body: {
          error: "resourceId and numeric value are required"
        }
      };
    }

    const resource = character.resources.find((entry) => entry.id === event.resourceId);

    if (!resource) {
      return {
        ok: false as const,
        statusCode: 404,
        body: {
          error: "Resource not found"
        }
      };
    }

    const previous = resource.current;
    resource.current = clamp(event.value, 0, resource.max);
    recordTableEvent({
      category: "state",
      type: "resource_changed",
      actor: {
        id: "gm-dashboard",
        kind: "gm",
        label: actorLabel
      },
      visibility: "player_visible",
      summary: `${character.name} ${resource.label} ${previous}/${resource.max} -> ${resource.current}/${resource.max}`,
      payload: {
        characterId: character.id,
        characterName: character.name,
        resourceId: resource.id,
        resourceLabel: resource.label,
        previous,
        current: resource.current,
        max: resource.max
      }
    });
    return {
      ok: true as const,
      statusCode: 200,
      body: {
        ok: true,
        sessionSnapshot: publishSessionState()
      }
    };
  }

  return {
    ok: false as const,
    statusCode: 400,
    body: {
      error: "Unsupported state event type"
    }
  };
}

function summarizeStateEvent(event: StateEventRequest) {
  const character = resolveCharacter(event.characterId);
  const characterName = character?.name ?? "Unknown character";

  if (event.type === "hp_delta") {
    const direction = event.amount >= 0 ? "+" : "";
    return `${characterName} HP ${direction}${event.amount}`;
  }

  if (event.type === "condition_add") {
    return `${characterName} add condition: ${event.condition}`;
  }

  if (event.type === "condition_remove") {
    return `${characterName} remove condition: ${event.condition}`;
  }

  return `${characterName} set resource`;
}

function formatIsoForMarkdown(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function sanitizeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSessionSummaryMarkdown() {
  const snapshot = getSessionSnapshot();
  const runtime = getRuntimeStatus();
  const generatedAt = new Date().toISOString();
  const fileStamp = generatedAt.slice(0, 10);
  const lines: string[] = [];

  lines.push(`# Session Summary - ${snapshot.campaignTitle}`);
  lines.push("");
  lines.push(`- Generated: ${formatIsoForMarkdown(generatedAt)}`);
  lines.push(`- Current Scene: ${snapshot.currentScene}`);
  lines.push(`- Table PIN: ${snapshot.tablePin}`);
  lines.push(`- Join URL: ${snapshot.joinUrl}`);
  lines.push(`- Runtime Status: ${runtime.status} (${runtime.mode})`);
  lines.push("");
  lines.push("## Party State");
  lines.push("");

  for (const character of snapshot.party) {
    lines.push(`### ${character.name} - ${character.classLabel}`);
    lines.push(`- HP: ${character.hp.current}/${character.hp.max}`);
    lines.push(`- AC: ${character.armorClass}`);
    lines.push(
      `- Conditions: ${character.conditions.length ? character.conditions.join(", ") : "None"}`
    );
    lines.push(
      `- Claimed By: ${character.claimedByLabel ? character.claimedByLabel : "Unclaimed"}`
    );
    lines.push(
      `- Resources: ${
        character.resources.length
          ? character.resources.map((resource) => `${resource.label} ${resource.current}/${resource.max}`).join(", ")
          : "None"
      }`
    );
    lines.push(
      `- Inventory: ${
        character.inventory.length
          ? character.inventory
              .map((item) => `${item.name} x${item.quantity}${item.detail ? ` (${item.detail})` : ""}`)
              .join(", ")
          : "None"
      }`
    );
    if (character.notes.length) {
      lines.push(`- Notes: ${character.notes.join(" | ")}`);
    }
    lines.push("");
  }

  lines.push("## Recent Rolls");
  lines.push("");
  if (snapshot.rollLog.length) {
    for (const roll of snapshot.rollLog) {
      lines.push(
        `- ${formatIsoForMarkdown(roll.timestamp)} - ${roll.actorName} rolled ${roll.total} (${roll.rolled} + ${roll.modifier}) for ${roll.note}`
      );
    }
  } else {
    lines.push("- No rolls recorded.");
  }
  lines.push("");

  lines.push("## Recent Table Events");
  lines.push("");
  if (snapshot.eventLog.length) {
    for (const entry of snapshot.eventLog) {
      lines.push(
        `- ${formatIsoForMarkdown(entry.timestamp)} - [${entry.category}] ${entry.summary} (${entry.actor.label}; ${entry.visibility})`
      );
    }
  } else {
    lines.push("- No table events recorded.");
  }
  lines.push("");

  lines.push("## Pending Approval Queue");
  lines.push("");
  if (snapshot.approvalQueue.length) {
    for (const proposal of snapshot.approvalQueue) {
      lines.push(
        `- ${formatIsoForMarkdown(proposal.createdAt)} - ${proposal.summary} (queued by ${proposal.submittedBy.label})`
      );
    }
  } else {
    lines.push("- No queued state changes.");
  }
  lines.push("");

  lines.push("## Presence Snapshot");
  lines.push("");
  if (runtime.clients.length) {
    for (const client of runtime.clients) {
      lines.push(
        `- ${client.role} - ${client.playerLabel ?? client.clientId} - ${client.status} - last seen ${formatIsoForMarkdown(client.lastSeenAt)}`
      );
    }
  } else {
    lines.push("- No connected clients.");
  }
  lines.push("");
  lines.push("---");
  lines.push(
    `Export file hint: ${sanitizeFilePart(snapshot.campaignTitle)}-session-summary-${fileStamp}.md`
  );

  return lines.join("\n");
}

function buildMemoryEntry() {
  const snapshot = getSessionSnapshot();
  const createdAt = new Date().toISOString();
  const recentVisibleEvents = snapshot.eventLog.filter((entry) => entry.visibility !== "gm_only").slice(0, 5);
  const woundedCharacters = snapshot.party.filter((character) => character.hp.current < character.hp.max);
  const activeConditions = snapshot.party.flatMap((character) =>
    character.conditions.map((condition) => `${character.name}: ${condition}`)
  );
  const pendingSummaries = snapshot.approvalQueue.map((proposal) => proposal.summary);
  const entities = Array.from(
    new Set([
      snapshot.currentScene,
      ...snapshot.party.map((character) => character.name),
      ...recentVisibleEvents.map((entry) => entry.actor.label)
    ])
  ).slice(0, 12);
  const summaryParts = [
    `${snapshot.currentScene} remains the active scene.`,
    snapshot.activeSceneContext.location
      ? `${snapshot.activeSceneContext.location.name}: ${snapshot.activeSceneContext.location.summary}.`
      : "No scene location summary has been resolved yet.",
    woundedCharacters.length
      ? `${woundedCharacters
          .map((character) => `${character.name} is at ${character.hp.current}/${character.hp.max} HP`)
          .join("; ")}.`
      : "The party is currently uninjured.",
    activeConditions.length
      ? `Notable conditions: ${activeConditions.slice(0, 4).join("; ")}.`
      : "No notable lingering conditions are active.",
    recentVisibleEvents.length
      ? `Recent table beats: ${recentVisibleEvents
          .map((entry) => entry.summary)
          .join(" | ")}.`
      : "No player-visible table events have been recorded yet.",
    pendingSummaries.length
      ? `Pending GM review: ${pendingSummaries.slice(0, 3).join(" | ")}.`
      : "No risky state changes are waiting for GM review.",
    snapshot.activeSceneContext.facts.length
      ? `Relevant world facts: ${snapshot.activeSceneContext.facts
          .map((fact) => fact.text)
          .slice(0, 2)
          .join(" | ")}.`
      : "No campaign-bible facts were matched to this scene."
  ];

  const entry: MemoryEntry = {
    id: randomUUID(),
    campaignId: snapshot.campaignId,
    sceneId: sanitizeFilePart(snapshot.currentScene),
    sessionId: `${snapshot.campaignId}-${createdAt.slice(0, 10)}`,
    kind: "scene_summary",
    visibility: "gm_only",
    status: "proposed",
    summary: summaryParts.join(" "),
    entities,
    stateEventIds: recentVisibleEvents.map((entry) => entry.id),
    assetIds: [],
    source: {
      kind: "session",
      label: `${snapshot.campaignTitle} - ${snapshot.currentScene}`
    },
    createdAt
  };
  const filename = `${sanitizeFilePart(snapshot.campaignTitle)}-${sanitizeFilePart(snapshot.currentScene)}-${createdAt
    .slice(0, 19)
    .replace(/[:T]/g, "-")}.json`;
  mkdirSync(memoryEntryExportDir, { recursive: true });
  const exportPath = join(memoryEntryExportDir, filename);
  writeFileSync(exportPath, JSON.stringify(entry, null, 2), "utf8");
  return { entry, exportPath };
}

function buildScenePacket(): ScenePacket {
  const snapshot = getSessionSnapshot();
  const woundedCharacters = snapshot.party.filter((character) => character.hp.current < character.hp.max);
  const queuedApprovals = snapshot.approvalQueue.length;
  const { activeSceneContext } = snapshot;
  const locationSummary =
    activeSceneContext.location?.summary ?? "A tense local scene remains unresolved.";
  const npcBeat = activeSceneContext.npcs[0];

  return {
    id: `scene-${Date.now().toString(36)}`,
    campaignId: snapshot.campaignId,
    sceneTitle: activeSceneContext.location?.name ?? "Lantern Gate Approach",
    visibility: "gm_only",
    summary: `${locationSummary} ${activeSceneContext.facts[0]?.text ?? ""}`.trim(),
    beats: [
      {
        kind: "description",
        text: `Wind pushes black sand across ${activeSceneContext.location?.name ?? "the old gate"} while lanternlight shivers against wet stone.`
      },
      {
        kind: "threat",
        text: `The table is carrying ${woundedCharacters.length} wounded character(s), so the next hazard should feel sharp without stalling the ascent.`
      },
      {
        kind: "clue",
        text:
          activeSceneContext.facts[0]?.text ??
          "The sand pulses are tracking a pattern that points toward the watchtower mechanism rather than a random curse."
      },
      {
        kind: "choice",
        text: `Offer a split between a careful investigation of the ${
          activeSceneContext.location?.features[0] ?? "gate machinery"
        } and an immediate push toward the tower stairs.`
      },
      {
        kind: "consequence",
        text: queuedApprovals
          ? `There are ${queuedApprovals} queued state changes waiting for GM approval, so the next narration should avoid assuming those outcomes are final.`
          : npcBeat?.motive ??
            "Any risky revelation here should still pass through GM approval before it becomes permanent state."
      }
    ],
    proposedStateEvents: [
      {
        id: `proposal-${Date.now().toString(36)}`,
        campaignId: snapshot.campaignId,
        type: "condition_added",
        actor: {
          id: "ai-scene-packet",
          kind: "ai_assistant",
          label: "Scene Packet Draft"
        },
        visibility: "gm_only",
        timestamp: new Date().toISOString(),
        payload: {
          characterId: "character-ivar",
          condition: "Sand-touched"
        }
      }
    ],
    mediaRequests: [
      {
        id: `media-${Date.now().toString(36)}`,
        campaignId: "sample-campaign",
        kind: "image",
        visibility: "player_visible",
        status: "requested",
        prompt:
          "Dark fantasy gate at night, wet stone, black sand drifting in lanternlight, looming watchtower above, tense local reveal shot",
        workflowId: "scene-reveal",
        metadata: {
          shotType: "location_reveal"
        }
      }
    ],
    audioCues: [
      {
        id: `audio-${Date.now().toString(36)}`,
        kind: "ambience",
        status: "suggested",
        visibility: "player_visible",
        trigger: "scene_change",
        tags: ["rain", "ruins", "low_dread", "watchtower"],
        loop: true,
        volume: 0.6,
        fadeInSeconds: 3,
        fadeOutSeconds: 4,
        notes: "Hold this under exploration until the next reveal or combat escalation."
      }
    ]
  };
}

function buildMediaJobFromScenePacketRequest(
  request: Record<string, unknown>,
  packet: ScenePacket
): MediaJob | null {
  const type =
    request.kind === "image" ||
    request.kind === "video" ||
    request.kind === "audio" ||
    request.kind === "upscale" ||
    request.kind === "interpolation" ||
    request.kind === "visual_canon"
      ? request.kind
      : null;
  const visibility =
    request.visibility === "gm_only" ||
    request.visibility === "player_visible" ||
    request.visibility === "public_demo"
      ? request.visibility
      : "gm_only";
  const prompt = typeof request.prompt === "string" ? request.prompt : "";
  const negativePrompt =
    typeof request.negativePrompt === "string" ? request.negativePrompt : undefined;
  const workflowId = typeof request.workflowId === "string" ? request.workflowId : undefined;
  const linkedAssetId =
    typeof request.linkedAssetId === "string" ? request.linkedAssetId : undefined;
  const metadata =
    typeof request.metadata === "object" && request.metadata !== null
      ? (request.metadata as Record<string, unknown>)
      : {};

  if (!type || !prompt) {
    return null;
  }

  return {
    id: randomUUID(),
    campaignId: packet.campaignId,
    sceneId: packet.id,
    type,
    status: "queued",
    priority: "normal",
    visibility,
    prompt,
    negativePrompt,
    workflowId,
    linkedAssetId,
    runWhen: type === "video" ? "session_break" : "background",
    createdAt: new Date().toISOString(),
    settings: {
      ...metadata,
      sourceRequestId: typeof request.id === "string" ? request.id : null,
      sceneTitle: packet.sceneTitle
    }
  };
}

function buildCharacterVisualCanonJob(character: Character): MediaJob {
  const distinctiveFeatures = [
    character.classLabel,
    character.inventory[0]?.name ? `carries ${character.inventory[0].name}` : null,
    character.conditions[0] ? `currently marked by ${character.conditions[0]}` : null,
    character.notes[0] ?? null
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");

  return {
    id: randomUUID(),
    campaignId: sampleCampaignContext.campaignBible.id,
    sceneId: undefined,
    type: "visual_canon",
    status: "queued",
    priority: "low",
    visibility: "gm_only",
    prompt: `Character visual canon pack for ${character.name}, ${character.classLabel}, ${distinctiveFeatures}, grounded dark fantasy, consistent costume language, repeatable silhouette, no text, no watermark.`,
    negativePrompt:
      "text, watermark, celebrity likeness, copyrighted character design, inconsistent anatomy, duplicate limbs, modern clothing, mismatched faces.",
    workflowId: "character-visual-canon",
    runWhen: "manual",
    createdAt: new Date().toISOString(),
    settings: {
      subjectCharacterId: character.id,
      subjectName: character.name,
      classLabel: character.classLabel,
      variantSet: ["portrait", "front", "three_quarter", "profile", "back", "expression_sheet"],
      outputIntent: "accepted_reference_pack",
      canonStatus: "unreviewed"
    }
  };
}

function buildAssetLocalPath(job: MediaJob) {
  const extension =
    job.type === "image" || job.type === "visual_canon"
      ? "png"
      : job.type === "video"
        ? "mp4"
        : job.type === "audio"
          ? "mp3"
          : "bin";

  return join(mediaOutputRoot, job.campaignId, `${job.id}.${extension}`);
}

function createAssetRecordFromMediaJob(job: MediaJob): AssetRecord {
  const now = new Date().toISOString();

  return {
    id: `asset-${job.id}`,
    campaignId: job.campaignId,
    sceneId: job.sceneId,
    kind:
      job.type === "image" || job.type === "video" || job.type === "audio"
        ? job.type
        : job.type === "visual_canon"
          ? "image"
          : "handout",
    visibility: job.visibility,
    status: "generated",
    prompt: job.prompt,
    workflowId: job.workflowId,
    localPath: buildAssetLocalPath(job),
    metadata: {
      mediaJobId: job.id,
      generatedAt: now,
      runWhen: job.runWhen,
      priority: job.priority,
      negativePrompt: job.negativePrompt ?? null,
      linkedAssetId: job.linkedAssetId ?? null,
      settings: job.settings
    }
  };
}

function finalizeMediaJobAsGenerated(job: MediaJob, actorLabel = "GM Dashboard") {
  if (!job.startedAt) {
    job.startedAt = new Date().toISOString();
  }
  job.status = "generated";
  job.completedAt = new Date().toISOString();
  job.outputPath = buildAssetLocalPath(job);
  job.error = undefined;

  const existing = assetRecords.find((entry) => entry.metadata.mediaJobId === job.id);
  const assetRecord = existing ?? createAssetRecordFromMediaJob(job);

  if (!existing) {
    assetRecords.unshift(assetRecord);
    assetRecords.splice(16);
  } else {
    existing.status = "generated";
    existing.localPath = job.outputPath;
    existing.prompt = job.prompt;
    existing.workflowId = job.workflowId;
    existing.metadata = {
      ...existing.metadata,
      generatedAt: job.completedAt ?? new Date().toISOString(),
      runWhen: job.runWhen,
      priority: job.priority,
      negativePrompt: job.negativePrompt ?? null,
      linkedAssetId: job.linkedAssetId ?? null,
      settings: job.settings
    };
  }

  recordTableEvent({
    category: "media",
    type: "media_metadata_recorded",
    actor: {
      id: "gm-dashboard",
      kind: "gm",
      label: actorLabel
    },
    visibility: job.visibility,
    summary: `${job.type} media metadata recorded.`,
    payload: {
      mediaJobId: job.id,
      assetId: assetRecord.id,
      localPath: assetRecord.localPath ?? null
    }
  });

  recordAiLog({
    kind: "tool_call",
    adapter: "scene_packet",
    correlationId: job.sceneId ?? job.id,
    summary: `Recorded generated media metadata for ${job.type} job`,
    details: {
      mediaJobId: job.id,
      assetId: assetRecord.id,
      localPath: assetRecord.localPath ?? null
    }
  });

  publishSessionState();
  return assetRecord;
}

function finalizeMediaJobAsFailed(job: MediaJob, error: string, actorLabel = "GM Dashboard") {
  job.status = "failed";
  job.completedAt = new Date().toISOString();
  job.error = error;

  recordTableEvent({
    category: "media",
    type: "media_job_failed",
    actor: {
      id: "gm-dashboard",
      kind: "gm",
      label: actorLabel
    },
    visibility: job.visibility,
    summary: `${job.type} media job failed.`,
    payload: {
      mediaJobId: job.id,
      workflowId: job.workflowId ?? null,
      error
    }
  });

  recordAiLog({
    kind: "tool_call",
    adapter: "scene_packet",
    correlationId: job.sceneId ?? job.id,
    summary: `Marked ${job.type} media job as failed`,
    details: {
      mediaJobId: job.id,
      error
    }
  });

  publishSessionState();
}

function buildLocalModelAdapterDraft(scenePacket: ScenePacket): LocalModelAdapterDraft {
  const snapshot = getSessionSnapshot();
  const promptPreview = readFileSync(gmSystemPromptPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 8)
    .join(" ");
  const sceneLocation = snapshot.activeSceneContext.location?.name ?? snapshot.currentScene;
  const npcNames = snapshot.activeSceneContext.npcs.map((entry) => entry.name);
  const contextSummary = [
    `Scene: ${sceneLocation}`,
    `Tone: ${snapshot.activeSceneContext.tone.join(", ")}`,
    npcNames.length ? `Relevant NPCs: ${npcNames.join(", ")}` : "Relevant NPCs: none resolved",
    snapshot.activeSceneContext.facts.length
      ? `Matched facts: ${snapshot.activeSceneContext.facts.map((fact) => fact.text).slice(0, 2).join(" | ")}`
      : "Matched facts: none"
  ].join(" || ");
  const firstBeat = scenePacket.beats[0]?.text ?? "No scene beat available.";
  const choiceBeat =
    scenePacket.beats.find((beat) => beat.kind === "choice")?.text ??
    "Offer a meaningful player choice before resolving the scene.";

  const queuedPacketEvents = scenePacket.proposedStateEvents.length;
  return {
    adapter: {
      mode: "placeholder",
      provider: "local_llm",
      endpointConfigured: Boolean(localModelEndpoint),
      endpoint: localModelEndpoint || null
    },
    request: {
      scenePacketId: scenePacket.id,
      sceneTitle: scenePacket.sceneTitle,
      promptPreview,
      contextSummary,
      proposedStateEventCount: scenePacket.proposedStateEvents.length,
      mediaRequestCount: scenePacket.mediaRequests.length,
      audioCueCount: scenePacket.audioCues.length
    },
    response: {
      narration: `${firstBeat} ${snapshot.activeSceneContext.location?.summary ?? ""}`.trim(),
      gmNotes: [
        choiceBeat,
        scenePacket.audioCues.length
          ? "Keep the suggested ambience low and continuous; do not let audio block the next response."
          : "No audio cue is required for this beat.",
        scenePacket.mediaRequests.length
          ? "The visual request should stay asynchronous so the table can keep moving."
          : "No visual request is currently attached."
      ],
      suggestedNextBeat:
        scenePacket.beats.find((beat) => beat.kind === "consequence")?.text ??
        "Escalate with a consequence only after the players commit to an approach.",
      riskyStateChangeWarning: queuedPacketEvents
        ? `${queuedPacketEvents} proposed state change(s) are attached to this packet. Keep them in the GM approval flow before treating them as canon. Current approval queue: ${snapshot.approvalQueue.length}.`
        : null
    }
  };
}

function buildDirectorModeAdapterDraft(scenePacket: ScenePacket): DirectorModeAdapterDraft {
  const snapshot = getSessionSnapshot();
  const promptPreview = readFileSync(directorPromptPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 8)
    .join(" ");
  const matchedFactTexts = snapshot.activeSceneContext.facts.map((fact) => fact.text).slice(0, 2);
  const unresolvedApprovals = snapshot.approvalQueue.length;

  return {
    adapter: {
      mode: "placeholder",
      provider: "chatgpt_director",
      enabled: Boolean(directorModeModel),
      model: directorModeModel || null
    },
    request: {
      scenePacketId: scenePacket.id,
      sceneTitle: scenePacket.sceneTitle,
      promptPreview,
      contextSummary: [
        `Campaign: ${snapshot.campaignTitle}`,
        `Scene: ${snapshot.currentScene}`,
        `Tone: ${snapshot.activeSceneContext.tone.join(", ")}`,
        matchedFactTexts.length ? `Matched facts: ${matchedFactTexts.join(" | ")}` : "Matched facts: none"
      ].join(" || "),
      memoryEntryCount: snapshot.memoryEntries.length,
      pendingApprovalCount: unresolvedApprovals
    },
    response: {
      directorGuidance:
        "Keep the next beat focused on the watch-station tension, reinforce the coastal survival tone, and avoid resolving the deeper signal mystery in a single turn.",
      revealPlan: [
        "Let the table confirm whether the tower mechanism or the bell rope is the immediate point of interest.",
        "Hold the wider cause of the signal disturbance until after a player-led investigation beat.",
        "Use a small consequence before any major reveal if the party pushes the ascent recklessly."
      ],
      canonizationNotes: [
        snapshot.memoryEntries.length
          ? "Use the latest memory entries as the first canonization source before inventing fresh summary text."
          : "No saved memory entries exist yet; canonization will rely on current table state only.",
        unresolvedApprovals
          ? "Do not canonize pending approval outcomes as settled history."
          : "No pending approval outcomes are currently blocking canonization."
      ],
      escalationWarning: unresolvedApprovals
        ? `${unresolvedApprovals} approval item(s) are still unresolved, so director-mode guidance should avoid assuming those outcomes are permanent.`
        : null
    }
  };
}

function validateScenePacket(packet: ScenePacket): ScenePacketValidation {
  const errors: string[] = [];

  if (!packet.id || !/^[a-zA-Z0-9_-]+$/.test(packet.id)) {
    errors.push("Scene packet id is required and must match the schema pattern.");
  }

  if (!packet.campaignId) {
    errors.push("Scene packet campaignId is required.");
  }

  if (!packet.sceneTitle) {
    errors.push("Scene packet sceneTitle is required.");
  }

  if (!["gm_only", "player_visible", "public_demo"].includes(packet.visibility)) {
    errors.push("Scene packet visibility is invalid.");
  }

  if (!Array.isArray(packet.beats) || packet.beats.length === 0) {
    errors.push("Scene packet must include at least one beat.");
  } else {
    packet.beats.forEach((beat, index) => {
      if (!["description", "choice", "threat", "clue", "consequence"].includes(beat.kind)) {
        errors.push(`Beat ${index + 1} has an invalid kind.`);
      }

      if (!beat.text) {
        errors.push(`Beat ${index + 1} is missing text.`);
      }
    });
  }

  packet.proposedStateEvents.forEach((event, index) => {
    if (!event.id) {
      errors.push(`Proposed state event ${index + 1} is missing an id.`);
    }

    if (!["hp_changed", "resource_changed", "condition_added", "condition_removed"].includes(event.type)) {
      errors.push(`Proposed state event ${index + 1} has an invalid type.`);
    }

    if (!event.actor?.id || !event.actor?.kind || !event.actor?.label) {
      errors.push(`Proposed state event ${index + 1} is missing actor metadata.`);
    }

    if (!["gm_only", "player_visible", "public_demo"].includes(event.visibility)) {
      errors.push(`Proposed state event ${index + 1} has invalid visibility.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors
  };
}

function convertScenePacketEventToStateEvent(
  event: ScenePacket["proposedStateEvents"][number]
): StateEventRequest | null {
  if (event.type === "condition_added") {
    const characterId =
      typeof event.payload.characterId === "string" ? event.payload.characterId : "";
    const condition = typeof event.payload.condition === "string" ? event.payload.condition : "";

    if (!characterId || !condition) {
      return null;
    }

    return {
      type: "condition_add",
      characterId,
      condition
    };
  }

  if (event.type === "condition_removed") {
    const characterId =
      typeof event.payload.characterId === "string" ? event.payload.characterId : "";
    const condition = typeof event.payload.condition === "string" ? event.payload.condition : "";

    if (!characterId || !condition) {
      return null;
    }

    return {
      type: "condition_remove",
      characterId,
      condition
    };
  }

  if (event.type === "hp_changed") {
    const characterId =
      typeof event.payload.characterId === "string" ? event.payload.characterId : "";
    const delta = typeof event.payload.delta === "number" ? event.payload.delta : NaN;

    if (!characterId || Number.isNaN(delta)) {
      return null;
    }

    return {
      type: "hp_delta",
      characterId,
      amount: delta
    };
  }

  if (event.type === "resource_changed") {
    const characterId =
      typeof event.payload.characterId === "string" ? event.payload.characterId : "";
    const resourceId =
      typeof event.payload.resourceId === "string" ? event.payload.resourceId : "";
    const value = typeof event.payload.value === "number" ? event.payload.value : NaN;

    if (!characterId || !resourceId || Number.isNaN(value)) {
      return null;
    }

    return {
      type: "resource_set",
      characterId,
      resourceId,
      value
    };
  }

  return null;
}

function buildMutationCacheKey(kind: string, requestId: string) {
  return `${kind}:${requestId}`;
}

function getCachedMutationResponse(kind: string, requestId: string) {
  const cacheKey = buildMutationCacheKey(kind, requestId);
  const cached = recentMutationResponses.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    recentMutationResponses.delete(cacheKey);
    return null;
  }

  return cached;
}

function cacheMutationResponse(kind: string, requestId: string, statusCode: number, body: unknown) {
  recentMutationResponses.set(buildMutationCacheKey(kind, requestId), {
    statusCode,
    body,
    expiresAt: Date.now() + 5 * 60 * 1000
  });
}

function broadcast(type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload });

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "game-server",
    port: gameServerPort
  });
});

app.get("/player", (_request, response) => {
  response.sendFile(join(playerCompanionDistDir, "index.html"));
});

app.get("/player/*rest", (request, response, next) => {
  const requestPath = request.path.replace(/^\/player\/?/, "");

  if (requestPath.includes(".")) {
    next();
    return;
  }

  response.sendFile(join(playerCompanionDistDir, "index.html"));
});

app.get("/api/runtime-status", (_request, response) => {
  response.json(getRuntimeStatus());
});

app.get("/api/session-snapshot", (_request, response) => {
  response.json(getSessionSnapshot());
});

app.get("/api/rolls", (_request, response) => {
  response.json(rollLog);
});

app.get("/api/session-summary.md", (_request, response) => {
  const snapshot = getSessionSnapshot();
  const filename = `${sanitizeFilePart(snapshot.campaignTitle)}-session-summary-${new Date()
    .toISOString()
    .slice(0, 10)}.md`;
  const markdown = buildSessionSummaryMarkdown();
  mkdirSync(sessionSummaryExportDir, { recursive: true });
  const exportPath = join(sessionSummaryExportDir, filename);
  writeFileSync(exportPath, markdown, "utf8");

  response.setHeader("Content-Type", "text/markdown; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("X-Export-Path", exportPath);
  response.send(markdown);
});

app.get("/api/scene-packet", requireRole("gm", "admin"), (_request, response) => {
  const packet = buildScenePacket();
  recordAiLog({
    kind: "input_packet",
    adapter: "scene_packet",
    correlationId: packet.id,
    summary: `Generated scene packet input for ${packet.sceneTitle}`,
    details: {
      sceneTitle: packet.sceneTitle,
      proposedStateEventCount: packet.proposedStateEvents.length,
      mediaRequestCount: packet.mediaRequests.length,
      audioCueCount: packet.audioCues.length
    }
  });
  response.json({
    packet,
    validation: validateScenePacket(packet)
  });
});

app.post("/api/local-model/draft", requireRole("gm", "admin"), (request, response) => {
  const body = request.body as { packet?: ScenePacket } | undefined;
  const packet = body?.packet ?? buildScenePacket();
  const validation = validateScenePacket(packet);
  recordAiLog({
    kind: "input_packet",
    adapter: "local_model",
    correlationId: packet.id,
    summary: `Prepared local-model input for ${packet.sceneTitle}`,
    details: {
      sceneTitle: packet.sceneTitle,
      proposedStateEventCount: packet.proposedStateEvents.length,
      mediaRequestCount: packet.mediaRequests.length,
      audioCueCount: packet.audioCues.length
    }
  });

  if (!validation.ok) {
    recordAiLog({
      kind: "validation_failure",
      adapter: "local_model",
      correlationId: packet.id,
      summary: `Local-model draft blocked by scene-packet validation`,
      details: {
        errors: validation.errors
      }
    });
    response.status(400).json({
      error: "Scene packet failed validation",
      validation
    });
    return;
  }

  const draft = buildLocalModelAdapterDraft(packet);
  recordAiLog({
    kind: "output_packet",
    adapter: "local_model",
    correlationId: packet.id,
    summary: `Created local-model placeholder output for ${packet.sceneTitle}`,
    details: {
      suggestedNextBeat: draft.response.suggestedNextBeat,
      gmNotesCount: draft.response.gmNotes.length,
      warningPresent: Boolean(draft.response.riskyStateChangeWarning)
    }
  });
  response.json({
    ok: true,
    validation,
    draft
  });
});

app.post("/api/director-mode/draft", requireRole("gm", "admin"), (request, response) => {
  const body = request.body as { packet?: ScenePacket } | undefined;
  const packet = body?.packet ?? buildScenePacket();
  const validation = validateScenePacket(packet);
  recordAiLog({
    kind: "input_packet",
    adapter: "director_mode",
    correlationId: packet.id,
    summary: `Prepared director-mode input for ${packet.sceneTitle}`,
    details: {
      sceneTitle: packet.sceneTitle,
      pendingApprovalCount: approvalQueue.length,
      memoryEntryCount: memoryEntries.length
    }
  });

  if (!validation.ok) {
    recordAiLog({
      kind: "validation_failure",
      adapter: "director_mode",
      correlationId: packet.id,
      summary: `Director-mode draft blocked by scene-packet validation`,
      details: {
        errors: validation.errors
      }
    });
    response.status(400).json({
      error: "Scene packet failed validation",
      validation
    });
    return;
  }

  const draft = buildDirectorModeAdapterDraft(packet);
  recordAiLog({
    kind: "output_packet",
    adapter: "director_mode",
    correlationId: packet.id,
    summary: `Created director-mode placeholder output for ${packet.sceneTitle}`,
    details: {
      revealPlanCount: draft.response.revealPlan.length,
      canonizationNoteCount: draft.response.canonizationNotes.length,
      warningPresent: Boolean(draft.response.escalationWarning)
    }
  });
  response.json({
    ok: true,
    validation,
    draft
  });
});

app.post("/api/memory-entries", requireRole("gm", "admin"), (_request, response) => {
  const { entry, exportPath } = buildMemoryEntry();
  memoryEntries.unshift(entry);
  memoryEntries.splice(8);
  recordTableEvent({
    category: "memory",
    type: "memory_entry_created",
    actor: {
      id: "memory-service",
      kind: "system",
      label: "Memory Service"
    },
    visibility: "gm_only",
    summary: `Created memory entry for ${entry.source.label}`,
    payload: {
      memoryEntryId: entry.id,
      kind: entry.kind,
      exportPath
    }
  });

  response.status(201).json({
    ok: true,
    entry,
    exportPath,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/scene-packet/queue-proposals", requireRole("gm", "admin"), (request, response) => {
  const body = request.body as Partial<ScenePacket>;

  if (!Array.isArray(body.proposedStateEvents)) {
    response.status(400).json({
      error: "proposedStateEvents array is required"
    });
    return;
  }

  const packet = body as ScenePacket;
  const validation = validateScenePacket(packet);

  if (!validation.ok) {
    recordAiLog({
      kind: "validation_failure",
      adapter: "scene_packet",
      correlationId: packet.id || "scene-packet-queue",
      summary: `Scene-packet proposal queue blocked by validation failure`,
      details: {
        errors: validation.errors
      }
    });
    response.status(400).json({
      error: "Scene packet failed validation",
      validation
    });
    return;
  }

  const queued: StateEventProposal[] = [];

  for (const rawEvent of packet.proposedStateEvents) {
    const stateEvent = convertScenePacketEventToStateEvent(rawEvent);

    if (!stateEvent) {
      continue;
    }

    recordAiLog({
      kind: "tool_call",
      adapter: "scene_packet",
      correlationId: packet.id,
      summary: `Queued scene-packet proposed state event: ${rawEvent.type}`,
      details: {
        proposedType: rawEvent.type,
        actorLabel: rawEvent.actor.label
      }
    });

    const proposal: StateEventProposal = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      summary: summarizeStateEvent(stateEvent),
      submittedBy: {
        id: rawEvent.actor.id,
        kind: rawEvent.actor.kind,
        label: rawEvent.actor.label
      },
      event: stateEvent
    };

    approvalQueue.unshift(proposal);
    queued.push(proposal);
  }

  approvalQueue.splice(12);

  response.json({
    ok: true,
    queuedCount: queued.length,
    validation,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/scene-packet/queue-media", requireRole("gm", "admin"), (request, response) => {
  const body = request.body as Partial<ScenePacket>;

  if (!Array.isArray(body.mediaRequests)) {
    response.status(400).json({
      error: "mediaRequests array is required"
    });
    return;
  }

  const packet = body as ScenePacket;
  const validation = validateScenePacket(packet);

  if (!validation.ok) {
    recordAiLog({
      kind: "validation_failure",
      adapter: "scene_packet",
      correlationId: packet.id || "scene-packet-media",
      summary: "Scene-packet media queue blocked by validation failure",
      details: {
        errors: validation.errors
      }
    });
    response.status(400).json({
      error: "Scene packet failed validation",
      validation
    });
    return;
  }

  const queued = packet.mediaRequests
    .map((entry) => buildMediaJobFromScenePacketRequest(entry, packet))
    .filter((entry): entry is MediaJob => Boolean(entry));

  queued.forEach((job) => {
    mediaJobs.unshift(job);
    recordAiLog({
      kind: "tool_call",
      adapter: "scene_packet",
      correlationId: packet.id,
      summary: `Queued ${job.type} media job for ${packet.sceneTitle}`,
      details: {
        mediaJobId: job.id,
        workflowId: job.workflowId ?? null,
        runWhen: job.runWhen,
        visibility: job.visibility
      }
    });
  });
  mediaJobs.splice(12);

  response.json({
    ok: true,
    queuedCount: queued.length,
    validation,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/scene-packet/queue-audio", requireRole("gm", "admin"), (request, response) => {
  const body = request.body as Partial<ScenePacket>;

  if (!Array.isArray(body.audioCues)) {
    response.status(400).json({
      error: "audioCues array is required"
    });
    return;
  }

  const packet = body as ScenePacket;
  const validation = validateScenePacket(packet);

  if (!validation.ok) {
    recordAiLog({
      kind: "validation_failure",
      adapter: "scene_packet",
      correlationId: packet.id || "scene-packet-audio",
      summary: "Scene-packet audio queue blocked by validation failure",
      details: {
        errors: validation.errors
      }
    });
    response.status(400).json({
      error: "Scene packet failed validation",
      validation
    });
    return;
  }

  const queued = packet.audioCues
    .filter((cue) => {
      const status = typeof cue.status === "string" ? cue.status : "";
      return status === "suggested" || status === "approved";
    })
    .map((cue) => ({
      id: typeof cue.id === "string" ? cue.id : `audio-cue-${Date.now().toString(36)}`,
      kind: String(cue.kind ?? "ambience"),
      status: "queued" as const,
      visibility: String(cue.visibility ?? "gm_only") as "gm_only" | "player_visible" | "public_demo",
      trigger: String(cue.trigger ?? "manual"),
      tags: Array.isArray(cue.tags) ? cue.tags.map(String) : [],
      loop: Boolean(cue.loop),
      volume: typeof cue.volume === "number" ? cue.volume : 0.7,
      fadeInSeconds: typeof cue.fadeInSeconds === "number" ? cue.fadeInSeconds : 3,
      fadeOutSeconds: typeof cue.fadeOutSeconds === "number" ? cue.fadeOutSeconds : 3,
      notes: typeof cue.notes === "string" ? cue.notes : undefined,
      createdAt: new Date().toISOString()
    }));

  queued.forEach((cue) => {
    audioCueQueue.unshift(cue);
    recordAiLog({
      kind: "tool_call",
      adapter: "scene_packet",
      correlationId: packet.id,
      summary: `Queued ${cue.kind} audio cue for ${packet.sceneTitle}`,
      details: {
        audioCueId: cue.id,
        trigger: cue.trigger,
        tags: cue.tags
      }
    });
  });
  audioCueQueue.splice(24);

  response.json({
    ok: true,
    queuedCount: queued.length,
    cues: queued,
    validation,
    sessionSnapshot: publishSessionState()
  });
});

app.get("/api/audio-cues", requireRole("gm", "admin", "player"), (_request, response) => {
  response.json({
    cues: audioCueQueue
  });
});

app.post("/api/audio-cues/:cueId/play", requireRole("gm", "admin"), async (request, response) => {
  const cueId = String(request.params.cueId);
  const cue = audioCueQueue.find((c) => c.id === cueId);

  if (!cue) {
    response.status(404).json({ error: "Audio cue not found" });
    return;
  }

  if (!audioServiceEndpoint) {
    response.status(503).json({ error: "Audio service not configured" });
    return;
  }

  // Find a matching track by tags (simple first-match strategy)
  try {
    const libraryRes = await fetch(`${audioServiceEndpoint}/api/library`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!libraryRes.ok) {
      throw new Error("Failed to fetch audio library");
    }

    const library = (await libraryRes.json()) as { tracks: Array<{ id: string; tags: string[]; kind: string }> };
    const matchingTrack = library.tracks.find((track) => {
      const trackTags = new Set(track.tags.map((t) => t.toLowerCase()));
      return cue.tags.some((tag) => trackTags.has(tag.toLowerCase()));
    });

    if (!matchingTrack) {
      response.status(404).json({
        error: "No matching audio track found for cue tags",
        cue,
        availableTracks: library.tracks.length
      });
      return;
    }

    const playRes = await fetch(`${audioServiceEndpoint}/api/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: matchingTrack.id,
        loop: cue.loop,
        volume: cue.volume
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!playRes.ok) {
      throw new Error(`Audio service play failed: ${playRes.status}`);
    }

    cue.status = "playing";

    response.json({
      ok: true,
      cue,
      matchedTrack: matchingTrack
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordErrorEvent({
      severity: "error",
      service: "audio-service",
      summary: `Failed to play audio cue ${cueId}`,
      message,
      recoveryHint: "Check that the audio service is running and that tracks with matching tags exist in the library.",
      visibility: "gm_only",
      correlationId: cueId
    });
    response.status(502).json({ error: message, cue });
  }
});

app.get("/api/ai-logs", requireRole("gm", "admin"), (_request, response) => {
  response.json({
    logs: aiLogs
  });
});

app.get("/api/error-events", requireRole("gm", "admin"), (_request, response) => {
  response.json({
    events: errorEvents
  });
});

app.get("/api/media-jobs", requireRole("gm", "admin"), (_request, response) => {
  response.json({
    jobs: mediaJobs
  });
});

app.get("/api/assets", (_request, response) => {
  response.json({
    assets: assetRecords
  });
});

app.get("/api/media-cleanup-report", requireRole("gm", "admin"), (_request, response) => {
  response.json({
    report: buildCleanupReport()
  });
});

app.post("/api/characters/:characterId/visual-canon-job", requireRole("gm", "admin"), (request, response) => {
  const character = resolveCharacter(String(request.params.characterId));

  if (!character) {
    response.status(404).json({
      error: "Character not found"
    });
    return;
  }

  const job = buildCharacterVisualCanonJob(character);
  mediaJobs.unshift(job);
  mediaJobs.splice(12);

  recordAiLog({
    kind: "tool_call",
    adapter: "scene_packet",
    correlationId: character.id,
    summary: `Queued visual-canon job for ${character.name}`,
    details: {
      mediaJobId: job.id,
      workflowId: job.workflowId ?? null,
      variantSet: job.settings.variantSet
    }
  });

  response.json({
    ok: true,
    job,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/media-jobs/:jobId/start", requireRole("gm", "admin"), async (request, response) => {
  const { jobId } = request.params;
  const job = mediaJobs.find((entry) => entry.id === jobId);

  if (!job) {
    response.status(404).json({
      error: "Media job not found"
    });
    return;
  }

  const mediaPressure = getMediaPressure();

  if (mediaPressure.blockedJobTypes.includes(job.type)) {
    response.status(409).json({
      error: `Starting ${job.type} jobs is blocked by current resource pressure.`,
      pressure: mediaPressure,
      runtimeStatus: getRuntimeStatus()
    });
    return;
  }

  // If comfy-router is configured, attempt real submission
  if (comfyRouterEndpoint) {
    try {
      const prepareRes = await fetch(`${comfyRouterEndpoint}/api/jobs/prepare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: job.id,
          workflowId: job.workflowId,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          type: job.type
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (!prepareRes.ok) {
        const text = await prepareRes.text();
        throw new Error(`Prepare failed: ${prepareRes.status} ${text}`);
      }

      const prepareJson = await prepareRes.json() as { job?: { id: string } };
      const preparedJobId = prepareJson.job?.id;

      if (!preparedJobId) {
        throw new Error("Prepare response missing job id");
      }

      const submitRes = await fetch(`${comfyRouterEndpoint}/api/jobs/${preparedJobId}/submit`, {
        method: "POST",
        signal: AbortSignal.timeout(15000)
      });

      if (!submitRes.ok) {
        const text = await submitRes.text();
        throw new Error(`Submit failed: ${submitRes.status} ${text}`);
      }

      const submitJson = await submitRes.json() as { job?: { comfyPromptId?: string } };

      job.comfyRouterJobId = preparedJobId;
      job.comfyPromptId = submitJson.job?.comfyPromptId;
      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.completedAt = undefined;
      job.error = undefined;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = `ComfyUI routing failed: ${message}`;
      recordErrorEvent({
        severity: "error",
        service: "comfy-router",
        summary: `Media job ${job.id} failed to submit to ComfyUI`,
        message,
        recoveryHint: "Check that ComfyUI is running and that BDE_COMFY_ROUTER_ENDPOINT is correct. If ComfyUI is offline, media jobs can still be driven manually.",
        visibility: "gm_only",
        correlationId: job.id
      });
      response.status(200).json({
        ok: true,
        job,
        runtimeStatus: getRuntimeStatus(),
        sessionSnapshot: publishSessionState()
      });
      return;
    }
  } else {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.completedAt = undefined;
    job.error = undefined;
  }

  recordTableEvent({
    category: "media",
    type: "media_job_started",
    actor: {
      id: "gm-dashboard",
      kind: "gm",
      label: "GM Dashboard"
    },
    visibility: job.visibility,
    summary: `${job.type} media job started.`,
    payload: {
      mediaJobId: job.id,
      workflowId: job.workflowId ?? null,
      sceneId: job.sceneId ?? null,
      comfyPromptId: job.comfyPromptId ?? null
    }
  });

  recordAiLog({
    kind: "tool_call",
    adapter: "scene_packet",
    correlationId: job.sceneId ?? job.id,
    summary: `Started ${job.type} media job`,
    details: {
      mediaJobId: job.id,
      workflowId: job.workflowId ?? null,
      comfyPromptId: job.comfyPromptId ?? null
    }
  });

  response.json({
    ok: true,
    job,
    runtimeStatus: getRuntimeStatus(),
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/media-jobs/:jobId/fail", requireRole("gm", "admin"), (request, response) => {
  const { jobId } = request.params;
  const job = mediaJobs.find((entry) => entry.id === jobId);

  if (!job) {
    response.status(404).json({
      error: "Media job not found"
    });
    return;
  }

  const requestedError =
    typeof request.body?.error === "string" && request.body.error.trim()
      ? request.body.error.trim()
      : "Marked failed from GM dashboard.";

  finalizeMediaJobAsFailed(job, requestedError);

  response.json({
    ok: true,
    job,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/media-jobs/:jobId/mark-generated", requireRole("gm", "admin"), (request, response) => {
  const { jobId } = request.params;
  const job = mediaJobs.find((entry) => entry.id === jobId);

  if (!job) {
    response.status(404).json({
      error: "Media job not found"
    });
    return;
  }

  const assetRecord = finalizeMediaJobAsGenerated(job);

  response.json({
    ok: true,
    asset: assetRecord,
    sessionSnapshot: publishSessionState()
  });
});

app.get("/api/state-event-queue", requireRole("gm", "admin"), (_request, response) => {
  response.json(approvalQueue);
});

app.post("/api/state-events/propose", requireRole("gm", "player", "admin"), (request, response) => {
  const body = request.body as Partial<StateEventRequest> & {
    submittedBy?: { id?: string; kind?: string; label?: string };
  };
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";

  if (requestId) {
    const cached = getCachedMutationResponse("state-event-proposal", requestId);

    if (cached) {
      response.status(cached.statusCode).json(cached.body);
      return;
    }
  }

  if (typeof body.type !== "string" || typeof body.characterId !== "string") {
    response.status(400).json({
      error: "type and characterId are required"
    });
    return;
  }

  const event = body as StateEventRequest;
  const submittedBy = {
    id: typeof body.submittedBy?.id === "string" ? body.submittedBy.id : "gm-dashboard",
    kind: body.submittedBy?.kind === "player" ? "player" : "gm",
    label:
      typeof body.submittedBy?.label === "string" && body.submittedBy.label.trim()
        ? body.submittedBy.label.trim()
        : "GM Dashboard"
  } as StateEventProposal["submittedBy"];

  const proposal: StateEventProposal = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    summary: summarizeStateEvent(event),
    submittedBy,
    event
  };

  approvalQueue.unshift(proposal);
  approvalQueue.splice(12);
  const result = {
    ok: true,
    proposal,
    sessionSnapshot: publishSessionState()
  };

  if (requestId) {
    cacheMutationResponse("state-event-proposal", requestId, 201, result);
  }

  response.status(201).json(result);
});

app.post("/api/state-events/:proposalId/approve", requireRole("gm", "admin"), (request, response) => {
  const proposalIndex = approvalQueue.findIndex((entry) => entry.id === String(request.params.proposalId));

  if (proposalIndex === -1) {
    response.status(404).json({
      error: "Proposal not found"
    });
    return;
  }

  const [proposal] = approvalQueue.splice(proposalIndex, 1);
  const applied = applyStateEvent(proposal.event, `GM Approved: ${proposal.submittedBy.label}`);

  if (!applied.ok) {
    approvalQueue.unshift(proposal);
    response.status(applied.statusCode).json(applied.body);
    return;
  }

  recordTableEvent({
    category: "state",
    type: "proposal_approved",
    actor: {
      id: "gm-dashboard",
      kind: "gm",
      label: "GM Dashboard"
    },
    visibility: "gm_only",
    summary: `Approved queued change: ${proposal.summary}`,
    payload: {
      proposalId: proposal.id,
      proposalType: proposal.event.type
    }
  });

  response.json({
    ok: true,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/state-events/:proposalId/reject", requireRole("gm", "admin"), (request, response) => {
  const proposalIndex = approvalQueue.findIndex((entry) => entry.id === String(request.params.proposalId));

  if (proposalIndex === -1) {
    response.status(404).json({
      error: "Proposal not found"
    });
    return;
  }

  const [proposal] = approvalQueue.splice(proposalIndex, 1);
  recordTableEvent({
    category: "state",
    type: "proposal_rejected",
    actor: {
      id: "gm-dashboard",
      kind: "gm",
      label: "GM Dashboard"
    },
    visibility: "gm_only",
    summary: `Rejected queued change: ${proposal.summary}`,
    payload: {
      proposalId: proposal.id,
      proposalType: proposal.event.type
    }
  });

  response.json({
    ok: true,
    sessionSnapshot: publishSessionState()
  });
});

app.post("/api/state-events", requireRole("gm", "admin"), (request, response) => {
  const body = request.body as Partial<StateEventRequest>;
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";

  if (requestId) {
    const cached = getCachedMutationResponse("state-event", requestId);

    if (cached) {
      response.status(cached.statusCode).json(cached.body);
      return;
    }
  }

  if (typeof body.type !== "string" || typeof body.characterId !== "string") {
    response.status(400).json({
      error: "type and characterId are required"
    });
    return;
  }

  const applied = applyStateEvent(body as StateEventRequest);

  if (requestId && applied.ok) {
    cacheMutationResponse("state-event", requestId, applied.statusCode, applied.body);
  }

  response.status(applied.statusCode).json(applied.body);
});

app.post("/api/claim-character", requireRole("player", "gm", "admin"), (request, response) => {
  const clientId = typeof request.body.clientId === "string" ? request.body.clientId.trim() : "";
  const characterId = typeof request.body.characterId === "string" ? request.body.characterId.trim() : "";
  const requestId = typeof request.body.requestId === "string" ? request.body.requestId.trim() : "";
  const playerLabelRaw =
    typeof request.body.playerLabel === "string" ? request.body.playerLabel.trim() : "";
  const playerLabel = playerLabelRaw || "Player";

  if (requestId) {
    const cached = getCachedMutationResponse("claim-character", requestId);

    if (cached) {
      response.status(cached.statusCode).json(cached.body);
      return;
    }
  }

  if (!clientId || !characterId) {
    response.status(400).json({
      error: "clientId and characterId are required"
    });
    return;
  }

  const character = party.find((entry) => entry.id === characterId);

  if (!character) {
    response.status(404).json({
      error: "Character not found"
    });
    return;
  }

  if (character.claimedByClientId && character.claimedByClientId !== clientId) {
    response.status(409).json({
      error: "Character already claimed"
    });
    return;
  }

  for (const entry of party) {
    if (entry.claimedByClientId === clientId && entry.id !== characterId) {
      entry.claimedByClientId = null;
      entry.claimedByLabel = null;
    }
  }

  character.claimedByClientId = clientId;
  character.claimedByLabel = playerLabel;
  recordTableEvent({
    category: "claim",
    type: "character_claimed",
    actor: {
      id: clientId,
      kind: "player",
      label: playerLabel
    },
    visibility: "player_visible",
    summary: `${playerLabel} claimed ${character.name}`,
    payload: {
      clientId,
      characterId: character.id,
      characterName: character.name,
      playerLabel
    }
  });

  const sessionSnapshot = publishSessionState();
  const result = {
    ok: true,
    sessionSnapshot
  };
  if (requestId) {
    cacheMutationResponse("claim-character", requestId, 200, result);
  }
  response.json(result);
});

app.post("/api/release-character", requireRole("player", "gm", "admin"), (request, response) => {
  const clientId = typeof request.body.clientId === "string" ? request.body.clientId.trim() : "";
  const requestId = typeof request.body.requestId === "string" ? request.body.requestId.trim() : "";

  if (requestId) {
    const cached = getCachedMutationResponse("release-character", requestId);

    if (cached) {
      response.status(cached.statusCode).json(cached.body);
      return;
    }
  }

  if (!clientId) {
    response.status(400).json({
      error: "clientId is required"
    });
    return;
  }

  for (const character of party) {
    if (character.claimedByClientId === clientId) {
      const previousLabel = character.claimedByLabel ?? "Player";
      character.claimedByClientId = null;
      character.claimedByLabel = null;
      recordTableEvent({
        category: "claim",
        type: "character_released",
        actor: {
          id: clientId,
          kind: "player",
          label: previousLabel
        },
        visibility: "player_visible",
        summary: `${previousLabel} released ${character.name}`,
        payload: {
          clientId,
          characterId: character.id,
          characterName: character.name,
          playerLabel: previousLabel
        }
      });
    }
  }

  const sessionSnapshot = publishSessionState();
  const result = {
    ok: true,
    sessionSnapshot
  };
  if (requestId) {
    cacheMutationResponse("release-character", requestId, 200, result);
  }
  response.json(result);
});

function parseDiceNotation(raw: string): { count: number; sides: number; modifier: number; advantage: boolean | null; error?: string } {
  const trimmed = raw.trim().toLowerCase();
  
  let advantage: boolean | null = null;
  let notation = trimmed;

  if (/\s+adv$/i.test(trimmed)) {
    advantage = true;
    notation = trimmed.slice(0, trimmed.lastIndexOf(" ")).trim();
  } else if (/\s+dis$/i.test(trimmed)) {
    advantage = false;
    notation = trimmed.slice(0, trimmed.lastIndexOf(" ")).trim();
  }

  const match = notation.match(/^(\d+)?d(\d+)([+-]\d+)?$/);
  if (!match) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: `Invalid dice notation: ${raw}` };
  }

  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (count < 1 || count > 100) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: "Dice count must be between 1 and 100" };
  }

  if (sides < 2 || sides > 1000) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: "Dice sides must be between 2 and 1000" };
  }

  return { count, sides, modifier, advantage };
}

function rollDice(parsed: { count: number; sides: number; modifier: number; advantage: boolean | null }) {
  const rolls: number[] = [];

  if (parsed.advantage !== null) {
    // Roll twice, take higher (adv) or lower (dis)
    for (let i = 0; i < parsed.count; i++) {
      const a = Math.floor(Math.random() * parsed.sides) + 1;
      const b = Math.floor(Math.random() * parsed.sides) + 1;
      rolls.push(parsed.advantage ? Math.max(a, b) : Math.min(a, b));
    }
  } else {
    for (let i = 0; i < parsed.count; i++) {
      rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
    }
  }

  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier;
  return { rolls, total };
}

app.post("/api/rolls", requireRole("player", "gm", "admin"), (request, response) => {
  const actorId = typeof request.body.actorId === "string" ? request.body.actorId : "";
  const actorName = typeof request.body.actorName === "string" ? request.body.actorName : "";
  const requestId = typeof request.body.requestId === "string" ? request.body.requestId.trim() : "";
  const note = typeof request.body.note === "string" && request.body.note.trim() ? request.body.note : "Check";
  const diceRaw = typeof request.body.dice === "string" && request.body.dice.trim() ? request.body.dice.trim() : "d20";
  const modifierOverride =
    typeof request.body.modifier === "number" ? request.body.modifier : Number(request.body.modifier ?? 0);

  if (requestId) {
    const cached = getCachedMutationResponse("roll", requestId);
    if (cached) {
      response.status(cached.statusCode).json(cached.body);
      return;
    }
  }

  if (!actorId || !actorName) {
    response.status(400).json({
      error: "actorId and actorName are required"
    });
    return;
  }

  const parsed = parseDiceNotation(diceRaw);

  if (parsed.error) {
    response.status(400).json({ error: parsed.error });
    return;
  }

  // If dice notation provided, use it; otherwise default to d20 with body modifier
  const modifier = parsed.modifier + (request.body.modifier !== undefined ? modifierOverride : 0);
  const effectiveParse = { ...parsed, modifier };

  const { rolls, total } = rollDice(effectiveParse);
  const rolled = rolls.length === 1 ? rolls[0] : rolls;
  const diceLabel = parsed.advantage !== null
    ? `${parsed.count}d${parsed.sides}${modifier !== 0 ? (modifier > 0 ? "+" : "") + modifier : ""} ${parsed.advantage ? "adv" : "dis"}`
    : `${parsed.count}d${parsed.sides}${modifier !== 0 ? (modifier > 0 ? "+" : "") + modifier : ""}`;

  const record: RollRecord = {
    id: randomUUID(),
    actorId,
    actorName,
    dice: diceLabel,
    modifier,
    rolled,
    total,
    advantage: parsed.advantage,
    note,
    timestamp: new Date().toISOString()
  };

  rollLog.unshift(record);
  rollLog.splice(12);
  recordTableEvent({
    category: "roll",
    type: "roll_recorded",
    actor: {
      id: actorId,
      kind: "player",
      label: actorName
    },
    visibility: "player_visible",
    summary: `${actorName} rolled ${record.total} on ${note}`,
    payload: {
      rollId: record.id,
      actorId,
      actorName,
      dice: record.dice,
      modifier: record.modifier,
      rolled: record.rolled,
      total: record.total,
      note
    }
  });

  broadcast("roll_recorded", record);
  broadcast("session_snapshot", getSessionSnapshot());
  broadcast("runtime_status", getRuntimeStatus());

  if (requestId) {
    cacheMutationResponse("roll", requestId, 201, record);
  }

  response.status(201).json(record);
});

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "localhost"}`);
  const roleValue = url.searchParams.get("role");
  const clientIdValue = url.searchParams.get("clientId");
  const role: ClientSession["role"] =
    roleValue === "gm" || roleValue === "player" || roleValue === "spectator" || roleValue === "ai" || roleValue === "admin"
      ? roleValue
      : "spectator";
  const clientId = clientIdValue && clientIdValue.trim() ? clientIdValue : randomUUID();

  const session: ClientSession = {
    id: randomUUID(),
    role,
    clientId,
    connectedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };

  clientSessions.set(session.id, session);

  socket.send(
    JSON.stringify({
      type: "connected",
      payload: {
        runtimeStatus: getRuntimeStatus(),
        sessionSnapshot: getSessionSnapshot()
      }
    })
  );

  broadcast("runtime_status", getRuntimeStatus());

  socket.on("message", (raw) => {
    const current = clientSessions.get(session.id);

    if (current) {
      current.lastSeenAt = new Date().toISOString();
    }

    try {
      const message = JSON.parse(String(raw)) as { type?: string };

      if (message.type === "heartbeat") {
        broadcast("runtime_status", getRuntimeStatus());
      }
    } catch {
      // Ignore unstructured payloads for now; timestamp refresh is enough.
    }
  });

  socket.on("close", () => {
    clientSessions.delete(session.id);
    broadcast("runtime_status", getRuntimeStatus());
  });
});

setInterval(() => {
  broadcast("runtime_status", getRuntimeStatus());
}, 10000);

setInterval(() => {
  const now = Date.now();

  for (const [cacheKey, cached] of recentMutationResponses.entries()) {
    if (cached.expiresAt < now) {
      recentMutationResponses.delete(cacheKey);
    }
  }
}, 60000);

// Poll comfy-router for running media jobs and auto-finalize them
setInterval(async () => {
  if (!comfyRouterEndpoint) {
    return;
  }

  for (const job of mediaJobs) {
    if (job.status !== "running" || !job.comfyRouterJobId) {
      continue;
    }

    try {
      const res = await fetch(`${comfyRouterEndpoint}/api/jobs/${job.comfyRouterJobId}/status`, {
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        continue;
      }

      const json = await res.json() as {
        status: string;
        outputs?: Record<string, unknown>;
        error?: string;
      };

      if (json.status === "completed") {
        finalizeMediaJobAsGenerated(job, "ComfyUI Router");
      } else if (json.status === "failed") {
        finalizeMediaJobAsFailed(job, json.error || "ComfyUI job failed", "ComfyUI Router");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      recordErrorEvent({
        severity: "warning",
        service: "comfy-router",
        summary: `Polling failed for job ${job.id}`,
        message,
        recoveryHint: "ComfyUI may be restarting or the router may be temporarily unreachable. Polling will retry automatically.",
        visibility: "gm_only",
        correlationId: job.id
      });
    }
  }
}, 5000);

function persistState() {
  try {
    saveTable("party", party);
    saveRollLog(rollLog);
    saveEventLog(eventLog);
    saveApprovalQueue(approvalQueue);
    saveMediaJobs(mediaJobs);
    saveTable("asset_records", assetRecords);
    saveMemoryEntries(memoryEntries);
    saveAudioCues(audioCueQueue);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[game-server] Failed to persist state:", message);
  }
}

setInterval(persistState, 30000);

process.on("SIGINT", () => {
  console.log("[game-server] SIGINT received, persisting state...");
  persistState();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[game-server] SIGTERM received, persisting state...");
  persistState();
  process.exit(0);
});

server.listen(gameServerPort, host, () => {
  const gmUrl = "http://127.0.0.1:5173";
  const playerUrl = `http://${getLanJoinHost()}:${gameServerPort}/player/`;

  console.log(`Black Dice Engine game server listening on http://${host}:${gameServerPort}`);
  console.log(`GM dashboard expected at ${gmUrl}`);
  console.log(`Player companion expected at ${playerUrl}`);
});
