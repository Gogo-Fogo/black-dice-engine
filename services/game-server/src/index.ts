import { installForgeRoutes } from "./forge-routes.js";
import { loadCampaignProgress, installProgressRoutes, applyProgressCommand } from "./campaign-progress.js";
import { buildAiSceneContext } from "./ai-context.js";
import {characterOutputPath} from './character-output.js';
import { createCharacterPortraits, installCharacterPortraitRoutes } from "./character-portraits.js";
import { createAssetDelivery, assetVisible } from "./asset-delivery.js";
import { createDiagnostics } from "./diagnostics.js";
import { createResourceMonitor, resourcePressure } from "./resource-monitor.js";
import { createBackups, BackupError } from "./backups.js";
import { createSceneImages } from "./scene-images.js";
import { createSpeech, SpeechError } from "./speech.js";
import { createCapabilityHealth, probeService } from "./capability-health.js";
import { createNarration } from "./narration.js";
import { installCharacterCreationRoute, installCharacterClaimRoutes } from "./character-routes.js";
import { createStateEvents } from "./state-events.js";
import { installStateEventRoutes } from "./state-event-routes.js";
import { installTableReadRoutes } from "./table-read-routes.js";
import { sanitizeFilePart } from "./session-summary.js";
import { createServerWork, createServerShutdown } from "./server-lifecycle.js";
import { installTtrpgActionRoutes } from "./ttrpg-action-routes.js";
import { createMediaRouterClient, createMediaJobPoller, MediaRouterError } from "./media-router-client.js";
import { createAudioCuePlayback, AudioTrackNotFound } from "./audio-cue-playback.js";
import { parseActionProposal } from "./ai-proposals.js";
import { isRollRecord, isProgressCommand, sceneBeatKinds } from "../../../packages/contracts/dist/index.js";
import type {
  Character, RollRecord, CurrentAction, ServiceState, RuntimeStatus,
  TableEventRecord, MemoryEntry, CampaignFact, CampaignBible, CampaignLocation,
  CampaignNpc, ActiveSceneContext, LocalModelAdapterDraft, DirectorModeAdapterDraft,
  MediaJob, AssetRecord, CleanupPolicy, CleanupCandidate,
  CleanupReport, StateEventProposal, ScenePacket, ScenePacketValidation, SessionSnapshot,
  StateEventRequest, AudioCue
} from "../../../packages/contracts/dist/index.js";
import { dirname, join } from "node:path";
import { readRuntimeConfig } from "./config.js";
import { SessionAuthority, SessionError, requestCredential, type LocalCredential } from "./session-authority.js";
import { identityFor, installSessionAccess, sessionErrorHandler } from "./session-http.js";
import { projectSnapshot, projectRuntime, projectRoll } from "./projections.js";
import { CommandStore } from "./command-store.js";
import { CommandBoundary } from "./command-boundary.js";
import { PartyService, installPartyRoutes } from "./party-service.js";
import { projectParty, type PartyState } from "./party-game.js";

import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import { openGameStore } from "./db.js";
import {
  generateNarration,
  proposeSceneAction,
  generateDirectorGuidance,
  getAiAdapterStatus, probeAiReadiness,
  type SceneContext,
  type RollResultContext
} from "./ai-adapter.js";

type ClientSession = {
  id: string;
  role: "gm" | "player" | "spectator" | "ai" | "admin";
  clientId: string;
  connectedAt: string;
  lastSeenAt: string;
};


const {
  profile, publicOrigin, host, gameServerPort, databasePath, backupsDir, automaticBackups, comfyRouterEndpoint, comfyApiBase, mediaOutputRoot, localModelEndpoint,
  directorModeModel, audioServiceEndpoint, ttsServiceEndpoint, comfyOutputBDEDir,
  playerCompanionDistDir, hostDashboardDistDir, sessionSummaryExportDir, memoryEntryExportDir,
  aiLogExportDir, repoExportsRoot, sampleCampaignDir, gmSystemPromptPath, directorPromptPath
} = readRuntimeConfig();

const work = createServerWork({ onError: () => console.error("[game-server] Scheduled work failed.") });
const resourceMonitor = createResourceMonitor({ now: work.now });
const serviceRequest = work.request;
const mediaRouterClient = createMediaRouterClient(serviceRequest, {
  reference: job => {
    const characterId = job.settings.subjectCharacterId, referenceId = job.settings.referenceId;
    if (typeof characterId !== 'string' || typeof referenceId !== 'string') return undefined;
    const reference = portraits.read(characterId, referenceId);
    if (!reference) throw new MediaRouterError('failed', 'The saved character reference is unavailable.');
    return { referenceImage: reference.image, seed: reference.seed, referenceId };
  },
  scope: () => `${authority.room().id}:${getSessionSnapshot().mode}`,
  current: job => mediaJobIsCurrent(job), enabled: () => profile !== "party" && work.active
});
const sceneImages = createSceneImages({ request: serviceRequest, endpoint: comfyApiBase, current: getSessionSnapshot, active: () => work.active });
const speech = createSpeech({ request: serviceRequest, endpoint: ttsServiceEndpoint, current: getSessionSnapshot, active: () => work.active, now: work.now });
const aiCapability = getAiAdapterStatus();
const capabilityHealth = createCapabilityHealth([
  { name: "ai-adapter", enabled: profile !== "party" && aiCapability.provider !== "disabled", configured: aiCapability.endpointConfigured,
    probe: signal => probeAiReadiness(serviceRequest, signal), busy: () => narration.busy },
  ...([['comfy-router', comfyRouterEndpoint], ['audio-service', audioServiceEndpoint], ['tts', ttsServiceEndpoint]] as const).map(([name, endpoint]) => ({
    name, enabled: profile !== "party", configured: Boolean(endpoint), probe: (signal: AbortSignal) => probeService(serviceRequest, endpoint, name, signal)
  }))
], { now: work.now });
const narration = createNarration({
  current: () => getSessionSnapshot(), active: () => work.active,
  generate: (input: { scene: SceneContext; roll: RollResultContext }, signal) =>
    generateNarration(input.scene, input.roll, { temperature: 0.85, maxTokens: 350, timeoutMs: 10000, signal, request: serviceRequest })
});
const gameStore = openGameStore(databasePath);
const { database: db, loadTable, saveTable, loadRollLog, saveRollLog, loadEventLog, saveEventLog,
  loadMediaJobs, saveMediaJobs, loadMemoryEntries, saveMemoryEntries, loadApprovalQueue, saveApprovalQueue,
  loadAudioCues, saveAudioCues, getMeta, setMeta } = gameStore;
const portraits = createCharacterPortraits(db);

const authority = new SessionAuthority(db, work.now);
const commandStore = new CommandStore(db, work.now);
const commands = new CommandBoundary(commandStore, {
  capture: captureTableState,
  restore: state => restoreTableState(state as ReturnType<typeof captureTableState>),
  persist: persistStateOrThrow
});
function saveHostCredential(credential: LocalCredential) {
  const credentialPath = `${databasePath}.host.key`;
  mkdirSync(dirname(credentialPath), { recursive: true });
  writeFileSync(credentialPath, credential.token, { encoding: "utf8", mode: 0o600 });
}
const initialHost = authority.bootstrap(process.env.BDE_RECOVER_HOST === "1");
if (initialHost) saveHostCredential(initialHost);
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 8192,
  handleProtocols: protocols => protocols.has("bde.session") ? "bde.session" : false,
  verifyClient: ({ req }, done) => {
    try {
      authority.authenticate(requestCredential(req.headers));
      done(true);
    } catch { done(false, 401, "Session credential required"); }
  }
});
const socketTokens = new WeakMap<WebSocket, string>();
const staleClientThresholdMs = 15000;

const clientSessions = new Map<string, ClientSession>();


// The explicitly opened store is initialized before persisted state is loaded.

const defaultParty: Character[] = [
  {
    id: "character-jepstein",
    name: "J'Epstein",
    classLabel: "Eldritch Knight 5",
    hp: { current: 38, max: 38 },
    armorClass: 16,
    initiative: null,
    conditions: [],
    resources: [
      { id: "resource-spell-slots-1", label: "Spell Slots I", current: 3, max: 3 },
      { id: "resource-hit-dice", label: "Hit Dice", current: 5, max: 5 }
    ],
    inventory: [
      { id: "item-mace", name: "One-Handed Mace", quantity: 1 },
      { id: "item-shield", name: "Shield", quantity: 1 },
      { id: "item-dagger", name: "Backup Dagger", quantity: 1 },
      { id: "item-bow", name: "Ranged Bow", quantity: 1 },
      { id: "item-gloves", name: "Cloth Wraps (copper-proof)", quantity: 1 },
      { id: "item-parrot", name: "Hostile Parrot on Perch-Stick", quantity: 1 }
    ],
    notes: [
      "Tabaxi battlemage, jacked, arcane creatine enthusiast",
      "Allergic to copper — refuses to touch it",
      "Deeply afraid of water and drowning",
      "Parrot is hostile, intelligent, and always screaming"
    ],
    image: "/images/Character_Jepstein.png",
    stats: { str: 18, dex: 14, con: 16, int: 14, wis: 10, cha: 8, skills: ["athletics", "arcana", "intimidation", "perception"] },
    claimedByClientId: null,
    claimedByLabel: null
  },
  {
    id: "character-shlomo",
    name: "Shlomo Ahkim",
    classLabel: "Evasive Tank 5",
    hp: { current: 32, max: 32 },
    armorClass: 18,
    initiative: null,
    conditions: [],
    resources: [
      { id: "resource-currency", label: "Currency Charges", current: 4, max: 4 },
      { id: "resource-perfect-evasion", label: "Perfect Evasion", current: 1, max: 1 }
    ],
    inventory: [
      { id: "item-sword", name: "Small Greatsword", quantity: 1 },
      { id: "item-coin", name: "Coin Pouch", quantity: 1, detail: "makes him stronger" },
      { id: "item-hat", name: "Small Hat", quantity: 1 }
    ],
    notes: [
      "Hobgoblin, always smiling, happy-go-lucky",
      "Uses currency to grow stronger and evade attacks",
      "Hair is detachable — his greatest secret",
      "Gollum-like voice, speaks of 'gentiles' with fear",
      "Wears white robes, leather boots with steel plates"
    ],
    image: "/images/Character_ShlomoAhkim.png",
    stats: { str: 14, dex: 16, con: 14, int: 10, wis: 12, cha: 18, skills: ["persuasion", "deception", "insight", "sleight_of_hand"] },
    claimedByClientId: null,
    claimedByLabel: null
  },
  {
    id: "character-mista",
    name: "Mista Shack",
    classLabel: "Weapon Master 5",
    hp: { current: 35, max: 35 },
    armorClass: 15,
    initiative: null,
    conditions: [],
    resources: [
      { id: "resource-hit-dice", label: "Hit Dice", current: 5, max: 5 },
      { id: "resource-weapon-call", label: "Weapon Summons", current: 3, max: 3 }
    ],
    inventory: [
      { id: "item-pouch", name: "Quick Access Pouch", quantity: 1, detail: "heals and throwables" },
      { id: "item-coat", name: "Short Sleeve Trench Coat", quantity: 1 }
    ],
    notes: [
      "Absolute unit of a human mercenary",
      "Summons random medieval weapons at will",
      "Eyes can see through deception — living lie detector",
      "Works to provide for wife and dog back home",
      "Down to business, no horsing around"
    ],
    image: "/images/Character_Mista.png",
    stats: { str: 16, dex: 18, con: 14, int: 12, wis: 16, cha: 10, skills: ["perception", "investigation", "insight", "athletics"] },
    claimedByClientId: null,
    claimedByLabel: null
  }
];

const sampleCampaignContext = loadSampleCampaignContext();
const loadedParty = loadTable<Character>("party");
// The demo heroes belong to the sample campaign; another campaign starts with an empty table.
const party: Character[] = loadedParty.length ? loadedParty
  : sampleCampaignContext.campaignBible.id === "sample-campaign" ? defaultParty : [];
if (initialHost && process.env.BDE_RECOVER_HOST !== "1") {
  // A fresh/expired room has no valid old memberships. Preserve sheets, release seats.
  for (const character of party) {
    character.claimedByClientId = null;
    character.claimedByLabel = null;
  }
}

const defaultRoll: RollRecord = {
  id: randomUUID(),
  actorId: "character-jepstein",
  actorName: "J'Epstein",
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


const loadedAudioCues = loadAudioCues<AudioCue>();
const audioCueQueue: AudioCue[] = loadedAudioCues;

const { aiLogs, errorEvents, recordAiLog, recordErrorEvent } = createDiagnostics({
  now: work.now,
  exportAi(jsonl) {
    mkdirSync(aiLogExportDir, { recursive: true });
    writeFileSync(join(aiLogExportDir, "recent-ai-log.jsonl"), jsonl, "utf8");
  },
  onExportFailure: () => console.error("[game-server] Diagnostic export unavailable; core play remains available.")
});

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
  const bibleText = readFileSync(join(sampleCampaignDir, "campaign-bible.yml"), "utf8");
  const campaignBible = parseCampaignBibleYaml(bibleText);
  // Optional root key; kept beside the bible so the bible contract stays unchanged.
  const openingScene = bibleText.match(/^openingScene:\s*"([^"\r\n]{1,200})"\s*$/m)?.[1] ?? "";
  const locationFile = JSON.parse(
    readFileSync(join(sampleCampaignDir, "locations.json"), "utf8")
  ) as { locations: CampaignLocation[] };
  const npcFile = JSON.parse(readFileSync(join(sampleCampaignDir, "npcs.json"), "utf8")) as {
    npcs: CampaignNpc[];
  };

  return {
    campaignBible,
    openingScene,
    locations: locationFile.locations,
    npcs: npcFile.npcs
  };
}

const savedCampaignProgress = getMeta(`campaign-progress:${sampleCampaignContext.campaignBible.id}`);
let campaignProgress = loadCampaignProgress(savedCampaignProgress, sampleCampaignContext.campaignBible.id);
// A campaign may ship prep (objectives, GM-only secrets, the opening scene) applied once to a new ledger.
if (savedCampaignProgress === null) {
  const seedPath = join(sampleCampaignDir, "progress-seed.json");
  const seed: unknown = existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, "utf8")) : [];
  if (!Array.isArray(seed) || !seed.every(command => isProgressCommand(command) && command.operation === "record")) throw new Error("progress-seed.json must be an array of progress record commands.");
  for (const command of seed) applyProgressCommand(campaignProgress, command, new Date().toISOString());
}

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

app.use((_request, response, next) => {
  if (!work.active) { response.status(503).json({ error: "Server is stopping." }); return; }
  next();
});
app.use(cors());
app.use('/api/characters/:id/portrait', express.json({limit:'750kb'}));
app.use('/api/character-forge/sessions/:id/choose', express.json({limit:'750kb'}));
app.use(express.json());
app.use("/player", express.static(playerCompanionDistDir));
app.use("/host", express.static(hostDashboardDistDir));
app.use("/display", express.static(hostDashboardDistDir));
app.get("/host/*rest", (request, response, next) => {
  if (request.path.includes(".")) { next(); return; }
  response.sendFile(join(hostDashboardDistDir, "index.html"));
});
installSessionAccess(app, authority, {
  snapshot: () => getSessionSnapshot(),
  character: id => resolveCharacter(id),
  release: actorId => {
    for (const character of party) {
      if (actorId === undefined || character.claimedByClientId === actorId) {
        character.claimedByClientId = null;
        character.claimedByLabel = null;
      }
    }
    persistState();
  },
  hostCredential: saveHostCredential,
  disconnectRevoked: () => broadcast("session_snapshot", getSessionSnapshot())
});
// Enforce the lightweight profile on the server, including direct requests from
// legacy tabs. Endpoint configuration and persisted jobs cannot override it.
app.use("/api", (request, response, next) => {
  const optional = /^\/(?:ai(?:\/|$)|ai-logs(?:\/|$)|local-model(?:\/|$)|director-mode(?:\/|$)|speak(?:\/|$)|audio-cues(?:\/|$)|media-jobs(?:\/|$)|images(?:\/|$)|scene-packet\/queue-(?:media|audio)(?:\/|$)|characters\/[^/]+\/(?:visual-canon-job|scene-job)(?:\/|$))/;
  if (profile === "party" && optional.test(request.path)) {
    response.status(503).json({ error: "Optional AI, media and audio services are disabled in the Party profile.", code: "CAPABILITY_DISABLED" });
    return;
  }
  next();
});
app.use("/api", commands.middleware);
app.get("/api/session/join-info", (request, response) => {
  if (!["gm", "spectator"].includes(identityFor(request).role)) throw new SessionError(403, "Host or public display access required.");
  const room = authority.room();
  response.json({ code: room.code, url: sessionJoinUrl("party"), localOnly: !publicOrigin && (host === "127.0.0.1" || host === "localhost") });
});
const partyGame = new PartyService(commandStore, state => broadcast("party_snapshot", state), work.now);
partyGame.recover(authority.room().id);
installPartyRoutes(app, partyGame);
let partyDeadlineFailureReported = false;
work.every(() => {
  try { partyGame.tick(authority.room().id); partyDeadlineFailureReported = false; }
  catch {
    if (!partyDeadlineFailureReported) console.error("[game-server] Party deadline could not be committed; the host should check room/storage status.");
    partyDeadlineFailureReported = true;
  }
}, 1000);
// Legacy filenames no longer expose an output directory.
app.use("/images", (_request, response) => { response.status(404).json({ error: "Use an approved asset record." }); });

function extractRoleFromRequest(request: express.Request): ClientSession["role"] {
  return identityFor(request).role;
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

  const measured = resourcePressure(resourceMonitor.sample());
  reasons.push(...measured.reasons);
  if (measured.level === "high") {
    level = "high";
    for (const type of ["image", "visual_canon", "video", "upscale", "interpolation"] as const) blocked.add(type);
  } else if (measured.level === "elevated") {
    if (level === "low") level = "elevated";
    for (const type of ["video", "upscale", "interpolation"] as const) blocked.add(type);
  }

  const summary =
    level === "high"
      ? "Media pressure is high. Keep expensive jobs paused until running work clears."
      : level === "elevated"
        ? "Media pressure is elevated. Be careful about starting more expensive jobs."
        : "Queue, host memory and event-loop measurements are within limits. GPU capacity is unmeasured.";

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

  return Math.max(0, (work.now() - new Date(isoValue).getTime()) / 36e5);
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
  const nowMs = work.now();
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
  const resources = resourceMonitor.sample();
  const capabilityServices = capabilityHealth.status();
  const failedCapabilities = capabilityServices.filter(service => service.capability?.state === "failed");
  const warnings = [...mediaPressure.reasons, ...failedCapabilities.map(service => `${service.name} health check failed; core play remains available.`),
    ...(backupWarning ? ["Automatic backup failed. Check storage and create a manual backup."] : [])];

  return {
    id: "runtime-main",
    status: staleCount > 0 || mediaPressure.level !== "low" || failedCapabilities.length > 0 || backupWarning ? "degraded" : "ok",
    mode: "fast",
    updatedAt: now,
    services: [
      {
        name: "game-server",
        status: "ok",
        message: "Accepting HTTP requests"
      },
      {
        name: "websocket",
        status: staleCount > 0 ? "degraded" : "ok",
        message:
          staleCount > 0
            ? `${clientSessions.size} session(s), ${staleCount} stale`
            : `${clientSessions.size} live session(s)`
      },
      {
        name: "dice-service",
        status: "ok",
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
        message: `${mediaPressure.summary} RSS ${Math.round(resources.rssBytes / 1024 ** 2)} MiB; host free ${Math.round(resources.hostFreeMemoryBytes / 1024 ** 2)} MiB; event-loop p95 ${resources.eventLoopDelayP95Ms ?? "not sampled"} ms.`
      },
      {
        name: "asset-metadata",
        status: assetRecords.some((asset) => asset.status === "failed") ? "degraded" : "ok",
        message: assetRecords.length
          ? `${assetRecords.filter((asset) => asset.status === "generated").length} generated / ${assetRecords.length} tracked`
          : "No media metadata recorded yet"
      },
      ...capabilityServices
    ],
    clients,
    mediaPressure,
    resources,
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

let currentSceneTitle = sampleCampaignContext.openingScene ||"Lantern Gate, just before the watchtower ascent";
let currentAction: CurrentAction | null = null;
let currentActionSetAt: number = 0;
let pendingNarration: { text: string; timestamp: number } | null = null;
let aiNarrationEnabled = profile !== "party";

function captureTableState() {
  return { campaignProgress, party, rollLog, eventLog, approvalQueue, mediaJobs, assetRecords, memoryEntries, audioCueQueue,
    aiLogs, errorEvents, currentSceneTitle, currentAction, currentActionSetAt, pendingNarration, aiNarrationEnabled };
}
function restoreTableState(state: ReturnType<typeof captureTableState>) {
  for (const key of ["party", "rollLog", "eventLog", "approvalQueue", "mediaJobs", "assetRecords", "memoryEntries", "audioCueQueue", "aiLogs", "errorEvents"] as const) {
    const target: unknown[] = captureTableState()[key];
    target.splice(0, target.length, ...state[key]);
  }
  ({ campaignProgress, currentSceneTitle, currentAction, currentActionSetAt, pendingNarration, aiNarrationEnabled } = state);
}
// Collection tables remain the legacy read model. Restore only the command-owned
// controls here, so newer optional-service writes are not replaced by an old receipt.
const savedControls = commandStore.state(authority.room().id, "ttrpg");
if (savedControls && typeof savedControls === "object") {
  const saved = savedControls as Record<string, unknown>;
  if (typeof saved.currentSceneTitle === "string") currentSceneTitle = saved.currentSceneTitle;
  if (profile !== "party" && typeof saved.aiNarrationEnabled === "boolean") aiNarrationEnabled = saved.aiNarrationEnabled;
  if (typeof saved.currentActionSetAt === "number" && Number.isFinite(saved.currentActionSetAt)) currentActionSetAt = saved.currentActionSetAt;
  const action = saved.currentAction;
  if (action && typeof action === "object" && "type" in action && typeof action.type === "string" &&
      "description" in action && typeof action.description === "string" && "ability" in action && typeof action.ability === "string" &&
      (!("rolls" in action) || Array.isArray(action.rolls) && action.rolls.every(isRollRecord)) &&
      "dc" in action && (action.dc === null || typeof action.dc === "number" && Number.isFinite(action.dc))) currentAction = action as CurrentAction;
  const narration = saved.pendingNarration;
  if (narration && typeof narration === "object" && "text" in narration && typeof narration.text === "string" &&
      "timestamp" in narration && typeof narration.timestamp === "number" && Number.isFinite(narration.timestamp)) pendingNarration = { text: narration.text, timestamp: narration.timestamp };
}

function sessionJoinUrl(mode: "party" | "ttrpg") {
  if (publicOrigin) return `${publicOrigin}/player/?mode=${mode}&pin=${authority.room().code}`;
  const joinHost = host === "0.0.0.0" ? getLanJoinHost() : host;
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : gameServerPort;
  return `http://${joinHost}:${port}/player/?mode=${mode}&pin=${authority.room().code}`;
}

function getSessionSnapshot(): SessionSnapshot {
  const campaignBible = sampleCampaignContext.campaignBible;
  const activeSceneContext = buildActiveSceneContext(currentSceneTitle);

  return {
    schemaVersion: 1,
    sessionId: authority.room().id,
    mode: "ttrpg",
    roundId: null,
    stage: "table",
    revision: commandStore.revision(authority.room().id, "ttrpg") + (commands.pending() ? 1 : 0),
    campaignProgress,
    campaignId: campaignBible.id,
    campaignTitle: campaignBible.title,
    currentScene: activeSceneContext.title,
    tablePin: authority.room().code,
    joinUrl: sessionJoinUrl("ttrpg"),
    campaignBible,
    activeSceneContext,
    party,
    rollLog,
    eventLog,
    approvalQueue,
    mediaJobs,
    assetRecords,
    memoryEntries,
    audioCueQueue,
    currentAction
  };
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

const stateEvents = createStateEvents({ resolveCharacter, recordTableEvent, publishSessionState });
const { summarize: summarizeStateEvent } = stateEvents;

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
    sceneId: snapshot.campaignProgress?.sceneId ?? sanitizeFilePart(snapshot.currentScene),
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
  const exportPath = join(memoryEntryExportDir, filename);
  const content = JSON.stringify(entry, null, 2);
  commands.defer(() => {
    mkdirSync(memoryEntryExportDir, { recursive: true });
    writeFileSync(exportPath, content, "utf8");
  });
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
  const recentMemorySummaries = snapshot.memoryEntries
    .filter((e) => e.visibility !== "gm_only")
    .slice(0, 3)
    .map((e) => e.summary);

  return {
    id: `scene-${work.now().toString(36)}`,
    campaignId: snapshot.campaignId,
    sceneTitle: activeSceneContext.location?.name ?? "Lantern Gate Approach",
    visibility: "gm_only",
    summary: `${locationSummary} ${activeSceneContext.facts[0]?.text ?? ""}`.trim(),
    beats: [
      {
        kind: "memory",
        text: recentMemorySummaries.length
          ? `Recent confirmed events: ${recentMemorySummaries.join(" | ")}`
          : "No confirmed session memories yet; rely on current table state."
      },
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
        id: `proposal-${work.now().toString(36)}`,
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
        id: `media-${work.now().toString(36)}`,
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
        id: `audio-${work.now().toString(36)}`,
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

function buildCharacterVisualCanonJob(character: Character, scenePrompt?: string): MediaJob {
  const referenceId = character.portrait?.approvedId;
  const reference = referenceId ? portraits.read(character.id, referenceId) : undefined;
  if (!reference) throw new SessionError(409, 'Approve a character portrait before generating a consistent image.');
  const distinctiveFeatures = reference.description;

  return {
    id: randomUUID(),
    campaignId: sampleCampaignContext.campaignBible.id,
    sceneId: undefined,
    type: scenePrompt ? "image" : "visual_canon",
    status: "queued",
    priority: "low",
    visibility: "gm_only",
    prompt: `${scenePrompt ? `Campaign illustration: ${scenePrompt}. Featuring` : 'Single character portrait of'} ${character.name}, ${character.classLabel}, ${distinctiveFeatures}. Preserve the reference face, hair, outfit and distinctive features. Grounded fantasy illustration, no text, no watermark.`,
    negativePrompt:
      "text, watermark, celebrity likeness, copyrighted character design, inconsistent anatomy, duplicate limbs, modern clothing, mismatched faces.",
    workflowId: scenePrompt ? "character-scene" : "character-visual-canon",
    runWhen: "manual",
    createdAt: new Date().toISOString(),
    settings: {
      subjectCharacterId: character.id,
      subjectName: character.name,
      classLabel: character.classLabel,
      referenceId, seed:reference.seed,
      variantSet: ["portrait"],
      outputIntent: scenePrompt ? "scene_for_review" : "portrait_for_review",
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
    localPath: job.outputPath ?? buildAssetLocalPath(job),
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
  job.outputPath ??= buildAssetLocalPath(job);
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
      if (!(sceneBeatKinds as readonly string[]).includes(beat.kind)) {
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

function broadcast(type: string, payload: unknown) {
  commands.defer(() => deliverBroadcast(type, payload));
}

function deliverBroadcast(type: string, payload: unknown) {
  narration.cancelStale();
  speech.cancelStale();
  sceneImages.cancelStale();
  mediaRouterClient.cancelStale();
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        const identity = authority.authenticate(socketTokens.get(client));
        const projected = type === "session_snapshot" ? projectSnapshot(payload, identity)
          : type === "party_snapshot" ? projectParty(payload as PartyState, identity)
          : type === "runtime_status" ? projectRuntime(payload, identity)
          : type === "roll_recorded" && identity.role !== "gm" ? projectRoll(payload) : payload;
        // Unknown message kinds remain host-only until they get an explicit projection.
        if (identity.role !== "gm" && !["session_snapshot", "party_snapshot", "runtime_status", "roll_recorded"].includes(type)) continue;
        client.send(JSON.stringify({ type, payload: projected }));
      } catch {
        client.close(4001, "Session expired or revoked");
      }
    }
  }
}

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "game-server",
    port: server.address() && typeof server.address() === "object" ? (server.address() as { port: number }).port : gameServerPort,
    profile,
    optionalServices: profile === "party" ? "disabled" : "configuration-dependent"
  });
});

app.post("/api/capabilities/refresh", requireRole("gm", "admin"), async (_request, response) => {
  await capabilityHealth.refresh();
  if (!work.active) throw new SessionError(503, "Server is stopping.");
  response.json({ ok: true, services: capabilityHealth.status() });
});

app.get("/api/pending-narration", (_request, response) => {
  response.json(pendingNarration);
});

installTableReadRoutes(app, {
  snapshot: getSessionSnapshot,
  runtime: getRuntimeStatus,
  summaryDirectory: sessionSummaryExportDir,
  now: work.now
});

const readAsset = createAssetDelivery([mediaOutputRoot, comfyOutputBDEDir]);
app.get('/api/assets/:assetId/preview', requireRole('gm','admin'), async(request,response,next)=>{
  try {
    const asset=assetRecords.find(asset=>asset.id===request.params.assetId);
    if(!asset||!['generated','approved'].includes(asset.status)||asset.kind!=='image') throw new SessionError(404,'Preview unavailable.');
    const room=authority.room().id,file=await readAsset(asset);
    const viewer=authority.authenticate(requestCredential(request.headers));
    if(viewer.role!=='gm'||room!==authority.room().id||!assetRecords.includes(asset)||!['generated','approved'].includes(asset.status)) throw new SessionError(404,'Preview unavailable.');
    response.set('Content-Type',file.type).set('X-Content-Type-Options','nosniff').set('Cache-Control','no-store').send(file.bytes);
  }catch(error){next(error);}
});
app.get("/api/images", (request, response) => {
  const viewer = identityFor(request);
  response.json({ images: assetRecords.filter(asset => assetVisible(asset, viewer) && ["image", "map", "handout"].includes(asset.kind)).slice(0, 20)
    .map(asset => ({ filename: asset.id, url: `/api/assets/${encodeURIComponent(asset.id)}/content` })) });
});
app.get("/api/assets/:assetId/content", async (request, response, next) => {
  try {
    const asset = assetRecords.find(asset => asset.id === request.params.assetId);
    if (!asset || !assetVisible(asset, identityFor(request))) throw new SessionError(404, "Asset not found.");
    const file = await readAsset(asset);
    if (!assetRecords.includes(asset) || !assetVisible(asset, authority.authenticate(requestCredential(request.headers)))) throw new SessionError(404, "Asset not found.");
    response.set("Content-Type", file.type).set("X-Content-Type-Options", "nosniff").set("Content-Security-Policy", "default-src 'none'; sandbox")
      .set("Cache-Control", "no-store").send(file.bytes);
  } catch (error) { next(error); }
});
app.post("/api/assets/:assetId/approve", requireRole("gm", "admin"), async (request, response, next) => {
  try {
    const asset = assetRecords.find(asset => asset.id === request.params.assetId);
    if (!asset || !["generated", "approved"].includes(asset.status)) throw new SessionError(409, "Generated asset required.");
    const room = authority.room().id;
    await readAsset(asset);
    const reviewer = authority.authenticate(requestCredential(request.headers));
    if (reviewer.role !== "gm" || room !== authority.room().id) throw new SessionError(409, "Session changed during review.");
    if (!assetRecords.includes(asset) || !["generated", "approved"].includes(asset.status)) throw new SessionError(409, "Asset changed during review.");
    const previous = asset.status, visibility=asset.visibility; asset.status = "approved";
    if(request.body?.share===true) asset.visibility='player_visible';
    try { db.transaction(persistStateOrThrow)(); } catch { asset.status = previous; asset.visibility=visibility; throw new SessionError(503, "Approval could not be saved."); }
    response.json({ ok: true, asset, sessionSnapshot: publishSessionState() });
  } catch (error) { next(error); }
});

app.post("/api/speak", requireRole("gm", "admin"), async (request, response) => {
  const cancelled = new AbortController();
  const onClose = () => { if (!response.writableEnded) cancelled.abort(); };
  response.once("close", onClose);
  try {
    const bytes = await speech.synthesize(request.body?.text, cancelled.signal);
    response.set("Content-Type", "audio/wav").set("Cache-Control", "no-store").send(Buffer.from(bytes));
  } catch (error) {
    if (!response.destroyed) response.status(error instanceof SpeechError ? error.status : 502).json({ error: error instanceof SpeechError ? error.message : "Speech service unavailable." });
  } finally { response.removeListener("close", onClose); }
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

app.post("/api/local-model/draft", requireRole("gm", "admin"), async (request, response) => {
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

  // Attempt real AI narration
  try {
    const snapshot = getSessionSnapshot();
    const sceneContext = buildAiSceneContext(snapshot, "public_demo");

    const rollContext: RollResultContext = {
      actorName: party[0]?.name || "The party",
      actionDescription: packet.sceneTitle,
      diceLabel: "d20",
      total: 10,
      modifier: 0,
      rawRoll: 10,
      success: true,
      critical: null
    };

    const cancelled = new AbortController();
    const onClose = () => { if (!response.writableEnded) cancelled.abort(); };
    response.once("close", onClose);
    let outcome;
    try {
      outcome = await narration.run("draft", { scene: sceneContext, roll: rollContext }, draft.response.narration, cancelled.signal);
    } finally { response.removeListener("close", onClose); }
    if (outcome.status === "stale") throw new SessionError(409, "Session changed or narration was cancelled. Request a new draft.");
    const aiResult = outcome.value;
    if (outcome.status === "generated") {
      draft.response.narration = outcome.text;
      draft.adapter.mode = "live";
    }

    if (!work.active) throw new SessionError(503, "Server is stopping.");
    recordAiLog({
      kind: "output_packet",
      adapter: "local_model",
      correlationId: packet.id,
      summary: `Local-model draft created${outcome.status === "fallback" ? " (placeholder fallback)" : ""} for ${packet.sceneTitle}`,
      details: {
        suggestedNextBeat: draft.response.suggestedNextBeat,
        gmNotesCount: draft.response.gmNotes.length,
        warningPresent: Boolean(draft.response.riskyStateChangeWarning),
        provider: aiResult?.provider,
        model: aiResult?.model,
        fallback: outcome.status === "fallback"
      }
    });
  } catch (err) {
    if (err instanceof SessionError) throw err;
    if (!work.active) throw new SessionError(503, "Server is stopping.");
    recordAiLog({
      kind: "output_packet",
      adapter: "local_model",
      correlationId: packet.id,
      summary: `Local-model draft failed, using placeholder for ${packet.sceneTitle}`,
      details: { fallback: true }
    });
  }

  response.json({
    ok: true,
    validation,
    draft
  });
});

app.post("/api/director-mode/draft", requireRole("gm", "admin"), async (request, response) => {
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

  // Attempt real AI director guidance
  try {
    const snapshot = getSessionSnapshot();
    const sceneContext = buildAiSceneContext(snapshot, "gm_only");

    const aiResult = await generateDirectorGuidance(sceneContext, approvalQueue.length, memoryEntries.length, {
      temperature: 0.7,
      maxTokens: 450, request: serviceRequest
    });
    if (!work.active) throw new SessionError(503, "Server is stopping.");

    if (aiResult.text && !aiResult.error) {
      draft.response.directorGuidance = aiResult.text;
      draft.adapter.mode = "live";
    }

    recordAiLog({
      kind: "output_packet",
      adapter: "director_mode",
      correlationId: packet.id,
      summary: `Director-mode draft created${aiResult.error ? " (placeholder fallback)" : ""} for ${packet.sceneTitle}`,
      details: {
        revealPlanCount: draft.response.revealPlan.length,
        canonizationNoteCount: draft.response.canonizationNotes.length,
        warningPresent: Boolean(draft.response.escalationWarning),
        provider: aiResult.provider,
        model: aiResult.model,
        error: aiResult.error
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordAiLog({
      kind: "output_packet",
      adapter: "director_mode",
      correlationId: packet.id,
      summary: `Director-mode draft failed, using placeholder for ${packet.sceneTitle}`,
      details: { error: message }
    });
  }

  response.json({
    ok: true,
    validation,
    draft
  });
});

app.post("/api/ai/propose-action", requireRole("gm", "admin"), async (request, response) => {
  const body = request.body as { previousAction?: string } | undefined;
  const snapshot = getSessionSnapshot();

  const sceneContext = buildAiSceneContext(snapshot, "gm_only");

  const recentRolls: RollResultContext[] = rollLog.filter(r => r.action).slice(0, 12).map(r => ({
    actorName: r.actorName, actionDescription: r.action!.description, diceLabel: r.dice,
    total: r.total, modifier: r.modifier,
    rawRoll: typeof r.rolled === "number" ? r.rolled : r.rolled[0],
    success: r.action!.success, dc: r.action!.dc, critical: null
  }));

  try {
    const aiResult = await proposeSceneAction(sceneContext, body?.previousAction, recentRolls, {
      temperature: 0.8,
      maxTokens: 400, request: serviceRequest
    });

    if (!work.active) throw new SessionError(503, "Server is stopping.");
    recordAiLog({
      kind: "output_packet",
      adapter: "local_model",
      correlationId: randomUUID(),
      summary: `AI proposed action${aiResult.error ? " (failed)" : ""}`,
      details: { provider: aiResult.provider, model: aiResult.model, error: aiResult.error }
    });

    if (aiResult.error || !aiResult.text) {
      response.status(503).json({ error: aiResult.error || "AI did not return a proposal" });
      return;
    }

    let parsed;
    try { parsed = parseActionProposal(aiResult.text); }
    catch {
      recordAiLog({ kind: "validation_failure", adapter: "local_model", correlationId: randomUUID(),
        summary: "AI action proposal rejected by contract", details: { reason: "Invalid structured proposal" } });
      response.status(502).json({ error: "AI returned an invalid action proposal. Try again." });
      return;
    }

    response.json({
      ok: true,
      raw: aiResult.text,
      proposal: parsed
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    response.status(500).json({ error: message });
  }
});

function createMemoryEntry(trigger: string) {
  const { entry, exportPath } = buildMemoryEntry();
  memoryEntries.unshift(entry);
  // Retain saved memory independently of the bounded AI context window.
  recordTableEvent({
    category: "memory",
    type: "memory_entry_created",
    actor: {
      id: "memory-service",
      kind: "system",
      label: "Memory Service"
    },
    visibility: entry.visibility,
    summary: `${trigger}: ${entry.summary.slice(0, 120)}...`,
    payload: {
      memoryEntryId: entry.id,
      kind: entry.kind,
      exportPath
    }
  });
  persistState();
  return { entry, exportPath };
}

app.post("/api/memory-entries", requireRole("gm", "admin"), (_request, response) => {
  const { entry, exportPath } = createMemoryEntry("Manual");
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
      id: typeof cue.id === "string" ? cue.id : `audio-cue-${work.now().toString(36)}`,
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

const audioCuePlayback = createAudioCuePlayback(serviceRequest);

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

  try {
    const matchingTrack = await audioCuePlayback.play(cue, audioServiceEndpoint);
    if (!audioCueQueue.includes(cue)) {
      response.status(409).json({ error: "Audio cue is no longer queued" });
      return;
    }
    cue.status = "playing";

    response.json({
      ok: true,
      cue,
      matchedTrack: matchingTrack
    });
  } catch (err) {
    if (err instanceof AudioTrackNotFound) {
      response.status(404).json({ error: err.message, cue, availableTracks: err.availableTracks });
      return;
    }
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

const characterRouteHooks = { party, recordTableEvent, publishSessionState, persistState, requireRole };
installCharacterCreationRoute(app, characterRouteHooks);
installForgeRoutes(app,{db,party,commands,portraits,publish:publishSessionState,request:serviceRequest,endpoint:comfyApiBase,enabled:()=>profile!=="party",active:()=>work.active});
installCharacterPortraitRoutes(app, {party, portraits, commands, publish:publishSessionState});

app.post('/api/characters/:characterId/scene-job', requireRole('gm', 'admin'), (request, response) => {
  const character = resolveCharacter(String(request.params.characterId));
  if (!character) throw new SessionError(404, 'Character not found.');
  const job = buildCharacterVisualCanonJob(character, request.body.scenePrompt.trim());
  mediaJobs.unshift(job); mediaJobs.splice(12);
  response.json({ok:true, job, sessionSnapshot:publishSessionState()});
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


const backups = createBackups(db, { directory: backupsDir, source: databasePath, now: work.now });
let sessionStarted = false;
let startBackup: Promise<unknown> | undefined;
let backupWarning = false;
function reportBackupFailure() {
  backupWarning = true;
  console.error("[game-server] Automatic backup failed. Core play remains available; check storage and create a manual backup.");
}

app.post("/api/backup", requireRole("gm", "admin"), async (request, response) => {
  try {
    db.transaction(persistStateOrThrow)();
    const backup = await backups.create(request.body?.note);
    backupWarning = false;
    response.json({ ok: true, backup });
  } catch (error) { response.status(error instanceof BackupError ? error.status : 503).json({ error: error instanceof BackupError ? error.message : "Backup could not be completed. Check storage and retry." }); }
});
app.get("/api/backups", requireRole("gm", "admin"), async (_request, response) => {
  try { response.json(await backups.list()); }
  catch { response.status(503).json({ error: "Backup list is unavailable." }); }
});
app.post("/api/backups/:backupId/validate", requireRole("gm", "admin"), async (request, response) => {
  try { response.json(await backups.validate(typeof request.params.backupId === "string" ? request.params.backupId : "")); }
  catch (error) { response.status(error instanceof BackupError ? error.status : 503).json({ error: error instanceof BackupError ? error.message : "Backup validation failed." }); }
});

const mediaStarting = new Set<MediaJob>();
function mediaJobIsCurrent(job: MediaJob) {
  return work.active && mediaJobs.includes(job) &&
    (job.settings.routerSubmissionSessionId === undefined || job.settings.routerSubmissionSessionId === authority.room().id);
}

app.post("/api/media-jobs/:jobId/start", requireRole("gm", "admin"), async (request, response) => {
  const { jobId } = request.params;
  const job = mediaJobs.find((entry) => entry.id === jobId);

  if (!job) {
    response.status(404).json({
      error: "Media job not found"
    });
    return;
  }

  if (mediaStarting.has(job) || job.status === "running") {
    response.status(409).json({ error: "Media job is already starting or running" });
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

  // Persist admission before transport. Ambiguous acceptance must not become a second GPU job after restart.
  if (comfyRouterEndpoint) {
    if (job.settings.routerSubmissionAttemptedAt || job.comfyPromptId || job.status === "generated" || job.status === "rejected" || job.status === "archived") {
      response.status(409).json({ error: "This media job was already attempted. Reconcile it manually or queue a new job before generating again." });
      return;
    }
    if (!mediaRouterClient.canStart) { response.status(503).json({ error: "Media request queue is busy. Try again shortly." }); return; }
    const settings = job.settings;
    job.settings = { ...settings, routerSubmissionAttemptedAt: new Date(work.now()).toISOString(), routerSubmissionSessionId: authority.room().id };
    try { db.transaction(persistStateOrThrow)(); }
    catch {
      job.settings = settings;
      response.status(503).json({ error: "Could not save media admission. No submission was sent; retry after checking storage." }); return;
    }
    const startingStatus = job.status, startingRoom = authority.room().id;
    try {
      mediaStarting.add(job);
      const submitted = await mediaRouterClient.start(comfyRouterEndpoint, job);
      if (!work.active || authority.room().id !== startingRoom || !mediaJobs.includes(job) || job.status !== startingStatus) {
        response.status(409).json({ error: "Media job changed while starting" });
        return;
      }
      job.comfyRouterJobId = submitted.routerJobId;
      job.comfyPromptId = submitted.promptId;
      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.completedAt = undefined;
      job.error = undefined;
      db.transaction(persistStateOrThrow)();
    } catch (err) {
      if (!work.active || authority.room().id !== startingRoom || !mediaJobs.includes(job) || job.status !== startingStatus) {
        response.status(409).json({ error: "Media job changed while starting" });
        return;
      }
      if (err instanceof MediaRouterError && err.code === "stale") {
        response.status(409).json({ error: "Media request is no longer current." }); return;
      }
      const message = err instanceof MediaRouterError ? err.message : "Media router unavailable.";
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
    finally { mediaStarting.delete(job); }
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

installStateEventRoutes(app, {
  approvalQueue, events: stateEvents, recordTableEvent, publishSessionState, createMemoryEntry, requireRole, now: work.now
});

installCharacterClaimRoutes(app, characterRouteHooks);

installProgressRoutes(app, { state: () => campaignProgress, requireHost: requireRole("gm", "admin"), publish: publishSessionState,
  closeScene() { currentAction = null; commands.defer(() => narration.cancelStale()); }
});

installTtrpgActionRoutes(app, {
  progress: () => campaignProgress,
  controls: {
    get currentSceneTitle() { return currentSceneTitle; }, set currentSceneTitle(value) { currentSceneTitle = value; },
    get currentAction() { return currentAction; }, set currentAction(value) { currentAction = value; },
    get currentActionSetAt() { return currentActionSetAt; }, set currentActionSetAt(value) { currentActionSetAt = value; },
    get pendingNarration() { return pendingNarration; }, set pendingNarration(value) { pendingNarration = value; },
    get aiNarrationEnabled() { return aiNarrationEnabled; }, set aiNarrationEnabled(value) { aiNarrationEnabled = value; },
  },
  party, rollLog, eventLog, work, sceneImages, commands, narration,
  // Roll narration uses the adapter once a provider is chosen explicitly (e.g. hosted DeepSeek)
  // or the legacy local-model service is set; an unconfigured install never calls out.
  aiNarrationAvailable: () => profile !== "party" && aiCapability.provider !== "disabled" && aiCapability.endpointConfigured &&
    (Boolean(process.env.BDE_LLM_PROVIDER?.trim()) || Boolean(localModelEndpoint)),
  requireRole, recordTableEvent, recordAiLog, broadcast, getSessionSnapshot, getRuntimeStatus,
  publishSessionState, createMemoryEntry, persistState
});

wss.on("connection", (socket, request) => {
  const token = requestCredential(request.headers);
  let identity;
  try { identity = authority.authenticate(token); }
  catch { socket.close(4001, "Session expired or revoked"); return; }
  socketTokens.set(socket, token);
  const role = identity.role;
  const clientId = identity.actorId;

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
        runtimeStatus: projectRuntime(getRuntimeStatus(), identity),
        sessionSnapshot: projectSnapshot(getSessionSnapshot(), identity),
        party: projectParty(partyGame.state(identity.sessionId), identity)
      }
    })
  );

  broadcast("runtime_status", getRuntimeStatus());

  socket.on("message", (raw) => {
    try { authority.authenticate(token); }
    catch { socket.close(4001, "Session expired or revoked"); return; }
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

work.every(async () => {
  await capabilityHealth.refresh();
  if (work.active) broadcast("runtime_status", getRuntimeStatus());
}, 10000);


const pollMediaJob = createMediaJobPoller(mediaRouterClient, {
  current: mediaJobIsCurrent,
  completed: (job,outputs) => {
    if(job.settings.referenceId) {
      try {job.outputPath=characterOutputPath(outputs,comfyOutputBDEDir);}
      catch {finalizeMediaJobAsFailed(job,'Character output was not confirmed. Configure BDE_COMFY_OUTPUT_DIR and check the ComfyUI result.','ComfyUI Router');return;}
    }
    finalizeMediaJobAsGenerated(job, "ComfyUI Router");
  },
  failed: (job, error) => { finalizeMediaJobAsFailed(job, error, "ComfyUI Router"); }
});

// Poll comfy-router for running media jobs and auto-finalize them
if (profile !== "party") work.every(async () => {
  if (!comfyRouterEndpoint) {
    return;
  }

  for (const job of mediaJobs) {
    if (job.status !== "running" || !job.comfyRouterJobId || !mediaJobIsCurrent(job)) {
      continue;
    }

    try {
      await pollMediaJob(comfyRouterEndpoint, job);
    } catch (err) {
      if (!work.active) return;
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
  if (commands.pending()) return;
  try {
    db.transaction(persistStateOrThrow)();
  } catch {
    console.error("[game-server] Failed to persist state. Check storage and retry saving.");
  }
}

function persistStateOrThrow() {
    saveTable("party", party);
    saveRollLog(rollLog);
    saveEventLog(eventLog);
    saveApprovalQueue(approvalQueue);
    saveMediaJobs(mediaJobs);
    saveTable("asset_records", assetRecords);
    saveMemoryEntries(memoryEntries);
    saveAudioCues(audioCueQueue);
    setMeta(`campaign-progress:${campaignProgress.campaignId}`, JSON.stringify(campaignProgress));
}

work.every(persistState, 30000);

const shutdown = createServerShutdown({
  work, server, sockets: wss,
  stopAudio: () => { resourceMonitor.dispose(); capabilityHealth.dispose(); narration.dispose(); speech.dispose(); sceneImages.dispose(); mediaRouterClient.dispose(); audioCuePlayback.dispose(); },
  flush: async () => {
    await startBackup; await backups.drain();
    if (!commands.pending()) db.transaction(persistStateOrThrow)();
    if (automaticBackups && sessionStarted) {
      try { await backups.create("Automatic session-end backup"); } catch (error) { reportBackupFailure(); throw error; }
    }
  },
  closeStore: () => gameStore.close()
});
const stopServer = () => {
  void shutdown().then(() => process.exit(0), () => {
    console.error("[game-server] Shutdown could not save or close all owned resources.");
    process.exit(1);
  });
};
process.once("SIGINT", stopServer);
process.once("SIGTERM", stopServer);

app.use(commands.errorMiddleware);
app.use(sessionErrorHandler);

server.once("error", error => {
  console.error(`[game-server] Listener failed (${(error as NodeJS.ErrnoException).code ?? "UNKNOWN"}).`);
  void shutdown().finally(() => process.exit(1));
});

server.listen(gameServerPort, host, () => {
  const address = server.address();
  const listeningPort = address && typeof address === "object" ? address.port : gameServerPort;
  const gmUrl = `http://127.0.0.1:${listeningPort}/host/`;
  const playerUrl = `http://${host === "0.0.0.0" ? getLanJoinHost() : host}:${listeningPort}/player/`;

  sessionStarted = true;
  if (automaticBackups) {
    try {
      db.transaction(persistStateOrThrow)();
      startBackup = backups.create("Automatic session-start backup").catch(reportBackupFailure);
    } catch { reportBackupFailure(); }
  }
  console.log(`Black Dice Engine game server listening on http://${host}:${listeningPort}`);
  console.log(`GM dashboard expected at ${gmUrl}`);
  console.log(`Player companion expected at ${playerUrl}`);
});
