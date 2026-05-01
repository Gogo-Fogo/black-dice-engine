import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

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
  dice: "d20";
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
    | "character_released";
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

type SessionSnapshot = {
  campaignId: string;
  campaignTitle: string;
  currentScene: string;
  tablePin: string;
  joinUrl: string;
  party: Character[];
  rollLog: RollRecord[];
  eventLog: TableEventRecord[];
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
const currentDir = dirname(fileURLToPath(import.meta.url));
const playerCompanionDistDir = join(currentDir, "../../../apps/player-companion/dist");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const staleClientThresholdMs = 15000;

const clientSessions = new Map<string, ClientSession>();
const recentMutationResponses = new Map<string, CachedMutationResponse>();
const party: Character[] = [
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

const rollLog: RollRecord[] = [
  {
    id: randomUUID(),
    actorId: "character-sera",
    actorName: "Sera",
    dice: "d20",
    modifier: 4,
    rolled: 15,
    total: 19,
    note: "Insight",
    timestamp: new Date().toISOString()
  }
];
const eventLog: TableEventRecord[] = [];

app.use(cors());
app.use(express.json());
app.use("/player", express.static(playerCompanionDistDir));

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

  return {
    id: "runtime-main",
    status: staleCount > 0 ? "degraded" : "ok",
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
      }
    ],
    clients,
    warnings: []
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

  return {
    campaignId: "sample-campaign",
    campaignTitle: "The Shattered Oath",
    currentScene: "Lantern Gate, just before the watchtower ascent",
    tablePin: "BD20",
    joinUrl: `http://${joinHost}:${gameServerPort}/player/?pin=BD20`,
    party,
    rollLog,
    eventLog
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

app.post("/api/state-events", (request, response) => {
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

  const character = resolveCharacter(body.characterId);

  if (!character) {
    response.status(404).json({
      error: "Character not found"
    });
    return;
  }

  if (body.type === "hp_delta") {
    if (typeof body.amount !== "number" || Number.isNaN(body.amount)) {
      response.status(400).json({
        error: "Numeric amount is required"
      });
      return;
    }

    const previous = character.hp.current;
    character.hp.current = clamp(character.hp.current + body.amount, 0, character.hp.max);
    recordTableEvent({
      category: "state",
      type: "hp_changed",
      actor: {
        id: "gm-dashboard",
        kind: "gm",
        label: "GM Dashboard"
      },
      visibility: "player_visible",
      summary: `${character.name} HP ${previous} -> ${character.hp.current}`,
      payload: {
        characterId: character.id,
        characterName: character.name,
        previous,
        current: character.hp.current,
        delta: body.amount
      }
    });
    const result = {
      ok: true,
      sessionSnapshot: publishSessionState()
    };
    if (requestId) {
      cacheMutationResponse("state-event", requestId, 200, result);
    }
    response.json(result);
    return;
  }

  if (body.type === "condition_add") {
    const condition = typeof body.condition === "string" ? body.condition.trim() : "";

    if (!condition) {
      response.status(400).json({
        error: "Condition is required"
      });
      return;
    }

    if (!character.conditions.includes(condition)) {
      character.conditions.push(condition);
      recordTableEvent({
        category: "state",
        type: "condition_added",
        actor: {
          id: "gm-dashboard",
          kind: "gm",
          label: "GM Dashboard"
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

    const result = {
      ok: true,
      sessionSnapshot: publishSessionState()
    };
    if (requestId) {
      cacheMutationResponse("state-event", requestId, 200, result);
    }
    response.json(result);
    return;
  }

  if (body.type === "condition_remove") {
    const condition = typeof body.condition === "string" ? body.condition.trim() : "";

    if (!condition) {
      response.status(400).json({
        error: "Condition is required"
      });
      return;
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
          label: "GM Dashboard"
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
    const result = {
      ok: true,
      sessionSnapshot: publishSessionState()
    };
    if (requestId) {
      cacheMutationResponse("state-event", requestId, 200, result);
    }
    response.json(result);
    return;
  }

  if (body.type === "resource_set") {
    if (typeof body.resourceId !== "string" || typeof body.value !== "number" || Number.isNaN(body.value)) {
      response.status(400).json({
        error: "resourceId and numeric value are required"
      });
      return;
    }

    const resource = character.resources.find((entry) => entry.id === body.resourceId);

    if (!resource) {
      response.status(404).json({
        error: "Resource not found"
      });
      return;
    }

    const previous = resource.current;
    resource.current = clamp(body.value, 0, resource.max);
    recordTableEvent({
      category: "state",
      type: "resource_changed",
      actor: {
        id: "gm-dashboard",
        kind: "gm",
        label: "GM Dashboard"
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
    const result = {
      ok: true,
      sessionSnapshot: publishSessionState()
    };
    if (requestId) {
      cacheMutationResponse("state-event", requestId, 200, result);
    }
    response.json(result);
    return;
  }

  response.status(400).json({
    error: "Unsupported state event type"
  });
});

app.post("/api/claim-character", (request, response) => {
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

app.post("/api/release-character", (request, response) => {
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

app.post("/api/rolls", (request, response) => {
  const actorId = typeof request.body.actorId === "string" ? request.body.actorId : "";
  const actorName = typeof request.body.actorName === "string" ? request.body.actorName : "";
  const requestId = typeof request.body.requestId === "string" ? request.body.requestId.trim() : "";
  const modifierValue =
    typeof request.body.modifier === "number" ? request.body.modifier : Number(request.body.modifier ?? 0);
  const note = typeof request.body.note === "string" && request.body.note.trim() ? request.body.note : "Check";

  if (requestId) {
    const cached = getCachedMutationResponse("roll", requestId);

    if (cached) {
      response.status(cached.statusCode).json(cached.body);
      return;
    }
  }

  if (!actorId || !actorName || Number.isNaN(modifierValue)) {
    response.status(400).json({
      error: "actorId, actorName, and numeric modifier are required"
    });
    return;
  }

  const rolled = Math.floor(Math.random() * 20) + 1;
  const record: RollRecord = {
    id: randomUUID(),
    actorId,
    actorName,
    dice: "d20",
    modifier: modifierValue,
    rolled,
    total: rolled + modifierValue,
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

server.listen(gameServerPort, host, () => {
  const gmUrl = "http://127.0.0.1:5173";
  const playerUrl = `http://${getLanJoinHost()}:${gameServerPort}/player/`;

  console.log(`Black Dice Engine game server listening on http://${host}:${gameServerPort}`);
  console.log(`GM dashboard expected at ${gmUrl}`);
  console.log(`Player companion expected at ${playerUrl}`);
});
