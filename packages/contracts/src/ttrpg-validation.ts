import { isCampaignProgress } from "./campaign-progress.js";
import { capabilityStates } from "./ttrpg.js";
import { isCharacter, isObject, isRequestId, isRollRecord, sceneBeatKinds } from "./index.js";
import type {
  ActiveSceneContext, AiLogEntry, AudioCue, AudioTrack, AssetRecord, CampaignBible,
  CleanupReport, DirectorModeAdapterDraft, ErrorEvent, LocalModelAdapterDraft, MediaJob,
  MemoryEntry, PlaybackState, RuntimeStatus, ScenePacket, SessionSnapshot, StateEventRequest,
  TableEventRecord
} from "./ttrpg.js";

type Check = (value: unknown) => boolean;
const text: Check = value => typeof value === "string";
const finite: Check = value => typeof value === "number" && Number.isFinite(value);
const nonnegative: Check = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const bool: Check = value => typeof value === "boolean";
const one = (...values: unknown[]): Check => value => values.includes(value);
const optional = (check: Check): Check => value => value === undefined || check(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const fields = (checks: Record<string, Check>): Check => value =>
  isObject(value) && Object.entries(checks).every(([key, check]) => check(value[key]));
const visibility = one("gm_only", "player_visible", "public_demo");
const actor = fields({ id: text, kind: one("gm", "player", "system", "ai_assistant"), label: text });
const fact = fields({ id: text, text, source: text });
const safety = fields({ rating: text, lines: list(text), veils: list(text) });
const location = fields({ id: text, name: text, visibility, summary: text, features: list(text) });
const npc = fields({ id: text, name: text, role: text, visibility, motive: text, detail: text });

// These guards validate consumed fields, not authorization or visibility. Extra fields are
// allowed for additive protocol evolution; private-field allowlists belong to projections.
export function isCampaignBible(value: unknown): value is CampaignBible {
  return fields({ id: text, title: text, subtitle: text, visibility, tone: list(text), safety, facts: list(fact) })(value);
}
export function isActiveSceneContext(value: unknown): value is ActiveSceneContext {
  return fields({ title: text, location: nullable(location), npcs: list(npc), facts: list(fact), tone: list(text), safety })(value);
}
export function isTableEventRecord(value: unknown): value is TableEventRecord {
  return fields({ id: text, category: one("roll", "state", "claim", "memory", "media"),
    type: one("roll_recorded", "hp_changed", "resource_changed", "condition_added", "condition_removed", "character_created",
      "character_claimed", "character_released", "proposal_approved", "proposal_rejected", "memory_entry_created",
      "media_job_started", "media_job_failed", "media_metadata_recorded", "initiative_set"),
    actor, visibility, timestamp: text, summary: text, payload: isObject })(value);
}
export function isMemoryEntry(value: unknown): value is MemoryEntry {
  return fields({ id: text, campaignId: text, sceneId: optional(text), sessionId: optional(text),
    kind: one("campaign_fact", "scene_summary", "session_summary", "npc_fact", "location_fact", "faction_change",
      "character_development", "open_thread", "resolved_thread", "rules_note"),
    visibility, status: one("proposed", "confirmed", "rejected", "superseded"), summary: text,
    entities: list(text), stateEventIds: list(text), assetIds: list(text), createdAt: text,
    source: fields({ kind: one("session", "scene", "campaign_bible", "import", "manual", "ai_summary"), label: text,
      sourcePath: optional(text), license: optional(text), pageOrLocation: optional(text) }) })(value);
}
const mediaType = one("image", "video", "audio", "upscale", "interpolation", "visual_canon");
export function isMediaJob(value: unknown): value is MediaJob {
  return fields({ id: text, campaignId: text, sceneId: optional(text), type: mediaType,
    status: one("draft", "queued", "running", "generated", "failed", "rejected", "archived"),
    priority: one("low", "normal", "high", "session_break"), visibility, runWhen: one("now", "background", "session_break", "manual"),
    prompt: optional(text), negativePrompt: optional(text), workflowId: optional(text), linkedAssetId: optional(text),
    outputPath: optional(text), createdAt: text, startedAt: optional(text), completedAt: optional(text),
    error: optional(text), settings: isObject, comfyRouterJobId: optional(text), comfyPromptId: optional(text) })(value);
}
export function isAssetRecord(value: unknown): value is AssetRecord {
  return fields({ id: text, campaignId: text, sceneId: optional(text), kind: one("image", "video", "audio", "map", "handout"),
    visibility, status: one("requested", "approved", "queued", "generated", "rejected", "failed"),
    prompt: optional(text), workflowId: optional(text), localPath: optional(text), metadata: isObject })(value);
}
export function isAudioCue(value: unknown): value is AudioCue {
  return fields({ id: text, kind: text, status: one("queued", "playing", "played", "skipped"), visibility,
    trigger: text, tags: list(text), loop: bool, volume: finite, fadeInSeconds: finite, fadeOutSeconds: finite,
    notes: optional(text), sceneId: optional(text), createdAt: text })(value);
}
export function isAudioTrack(value: unknown): value is AudioTrack {
  return fields({ id: text, filename: text, relativePath: text, localPath: text, urlPath: text,
    kind: one("music", "ambience", "stinger", "unknown"), tags: list(text), durationSeconds: optional(finite), notes: optional(text) })(value);
}
export function isPlaybackState(value: unknown): value is PlaybackState {
  return fields({ status: one("idle", "playing", "paused"), currentTrackId: nullable(text), volume: finite,
    muted: bool, loop: bool, startedAt: nullable(text), pausedAt: nullable(text) })(value);
}
export function isStateEventRequest(value: unknown): value is StateEventRequest {
  if (!fields({ characterId: text, requestId: optional(isRequestId) })(value) || !isObject(value)) return false;
  switch (value.type) {
    case "hp_delta": return finite(value.amount);
    case "condition_add": case "condition_remove": return text(value.condition);
    case "resource_set": return text(value.resourceId) && finite(value.value);
    case "initiative_set": return nullable(finite)(value.value);
    default: return false;
  }
}
export function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  return fields({ id: text, status: one("ok", "degraded", "offline", "maintenance"),
    mode: one("fast", "scene", "cinematic", "prep", "offline"), updatedAt: text,
    services: list(fields({ capability: optional(fields({ enabled: bool, configured: bool, state: one(...capabilityStates), checkedAt: nullable(text) })), name: text, status: one("ok", "degraded", "offline", "unknown"), latencyMs: optional(finite), message: optional(text) })),
    clients: list(fields({ id: text, role: one("gm", "player", "spectator", "ai", "admin"), clientId: text,
      status: one("active", "stale"), connectedAt: text, lastSeenAt: text, playerLabel: nullable(text), claimedCharacterName: nullable(text) })),
    mediaPressure: fields({ level: one("low", "elevated", "high"), summary: text, reasons: list(text), blockedJobTypes: list(mediaType) }),
    warnings: list(text), resources: optional(fields({ sampledAt: text, rssBytes: count, heapUsedBytes: count,
      hostFreeMemoryBytes: count, hostTotalMemoryBytes: count, eventLoopDelayP95Ms: nullable(nonnegative), gpu: one("unmeasured") })) })(value);
}
export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  return fields({ schemaVersion: one(1), sessionId: text, mode: one("ttrpg"), roundId: one(null), stage: one("table"), revision: count,
    campaignProgress: optional(isCampaignProgress), campaignId: text, campaignTitle: text, currentScene: text, tablePin: text, joinUrl: text,
    campaignBible: isCampaignBible, activeSceneContext: isActiveSceneContext, party: list(isCharacter), rollLog: list(isRollRecord),
    eventLog: list(isTableEventRecord), approvalQueue: list(fields({ id: text, createdAt: text, summary: text, submittedBy: actor, event: isStateEventRequest })),
    mediaJobs: list(isMediaJob), assetRecords: list(isAssetRecord), memoryEntries: list(isMemoryEntry), audioCueQueue: list(isAudioCue),
    currentAction: nullable(fields({ id: optional(text), rolls: optional(list(isRollRecord)), type: text, description: text, ability: text, dc: nullable(finite) })) })(value);
}
export function isAiLogEntry(value: unknown): value is AiLogEntry {
  return fields({ id: text, kind: one("input_packet", "output_packet", "tool_call", "validation_failure"),
    adapter: one("scene_packet", "local_model", "director_mode"), createdAt: text, summary: text, correlationId: text, details: isObject })(value);
}
export function isErrorEvent(value: unknown): value is ErrorEvent {
  return fields({ id: text, severity: one("warning", "error", "critical"), service: text, summary: text, message: text,
    recoveryHint: text, visibility, createdAt: text, resolvedAt: optional(text), correlationId: optional(text) })(value);
}
const cleanupCandidate = fields({ kind: one("media_job", "asset_record"), id: text, status: text, reason: text,
  recommendedAction: one("archive_metadata", "review_output", "keep_final"),
  workflowId: optional(nullable(text)), localPath: optional(nullable(text)), timestamp: optional(nullable(text)) });
export function isCleanupReport(value: unknown): value is CleanupReport {
  return fields({ generatedAt: text,
    policy: fields({ failedJobArchiveAfterHours: finite, draftJobArchiveAfterHours: finite, rejectedJobArchiveAfterHours: finite,
      protectedGeneratedAssetCount: count, notes: list(text) }),
    outputRoots: fields({ mediaOutputRoot: text, repoExportsRoot: text }),
    summary: fields({ trackedMediaJobs: count, trackedAssets: count, archiveCandidateCount: count, reviewCandidateCount: count, protectedFinalAssetCount: count }),
    archiveCandidates: list(cleanupCandidate), reviewCandidates: list(cleanupCandidate) })(value);
}
export function isScenePacket(value: unknown): value is ScenePacket {
  return fields({ id: text, campaignId: text, sceneTitle: text, visibility, summary: text,
    beats: list(fields({ kind: one(...sceneBeatKinds), text })),
    proposedStateEvents: list(fields({ id: text, campaignId: text, type: one("hp_changed", "resource_changed", "condition_added", "condition_removed"),
      actor, visibility, timestamp: text, payload: isObject })), mediaRequests: list(isObject), audioCues: list(isObject) })(value);
}
export function isLocalModelAdapterDraft(value: unknown): value is LocalModelAdapterDraft {
  return fields({ adapter: fields({ mode: one("placeholder", "live"), provider: one("local_llm", "ollama", "openai"), endpointConfigured: bool, endpoint: nullable(text) }),
    request: fields({ scenePacketId: text, sceneTitle: text, promptPreview: text, contextSummary: text,
      proposedStateEventCount: count, mediaRequestCount: count, audioCueCount: count }),
    response: fields({ narration: text, gmNotes: list(text), suggestedNextBeat: text, riskyStateChangeWarning: nullable(text) }) })(value);
}
export function isDirectorModeAdapterDraft(value: unknown): value is DirectorModeAdapterDraft {
  return fields({ adapter: fields({ mode: one("placeholder", "live"), provider: one("chatgpt_director", "ollama", "openai"), enabled: bool, model: nullable(text) }),
    request: fields({ scenePacketId: text, sceneTitle: text, promptPreview: text, contextSummary: text, memoryEntryCount: count, pendingApprovalCount: count }),
    response: fields({ directorGuidance: text, revealPlan: list(text), canonizationNotes: list(text), escalationWarning: nullable(text) }) })(value);
}
