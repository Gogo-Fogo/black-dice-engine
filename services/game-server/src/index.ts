import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
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
  warnings: string[];
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
  dice: "d20";
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

type ClientSession = {
  id: string;
  role: "gm" | "player" | "spectator" | "ai" | "admin";
  connectedAt: string;
  lastSeenAt: string;
};

const host = process.env.BDE_HOST ?? "127.0.0.1";
const gameServerPort = Number(process.env.BDE_GAME_SERVER_PORT ?? 4310);
const playerCompanionPort = Number(process.env.BDE_PLAYER_COMPANION_PORT ?? 5174);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clientSessions = new Map<string, ClientSession>();
const party: Character[] = [
  {
    id: "character-kael",
    name: "Kael",
    classLabel: "Rogue 3",
    hp: { current: 22, max: 30 },
    armorClass: 15,
    notes: ["Watching every door and every lie."]
  },
  {
    id: "character-sera",
    name: "Sera",
    classLabel: "Cleric 3",
    hp: { current: 27, max: 27 },
    armorClass: 18,
    notes: ["Low patience for cultists and false saints."]
  },
  {
    id: "character-ivar",
    name: "Ivar",
    classLabel: "Wizard 3",
    hp: { current: 14, max: 18 },
    armorClass: 12,
    notes: ["Tracking a pattern in the black sand pulses."]
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

app.use(cors());
app.use(express.json());

function getRuntimeStatus(): RuntimeStatus {
  const now = new Date().toISOString();

  return {
    id: "runtime-main",
    status: "ok",
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
        status: "ok",
        latencyMs: 5,
        message: `${clientSessions.size} live session(s)`
      },
      {
        name: "dice-service",
        status: "ok",
        latencyMs: 1,
        message: `${rollLog.length} roll(s) in memory`
      }
    ],
    warnings: []
  };
}

function getSessionSnapshot(): SessionSnapshot {
  const joinHost = host === "127.0.0.1" ? "localhost" : host;

  return {
    campaignId: "sample-campaign",
    campaignTitle: "The Shattered Oath",
    currentScene: "Lantern Gate, just before the watchtower ascent",
    tablePin: "BD20",
    joinUrl: `http://${joinHost}:${playerCompanionPort}`,
    party,
    rollLog
  };
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

app.get("/api/runtime-status", (_request, response) => {
  response.json(getRuntimeStatus());
});

app.get("/api/session-snapshot", (_request, response) => {
  response.json(getSessionSnapshot());
});

app.get("/api/rolls", (_request, response) => {
  response.json(rollLog);
});

app.post("/api/rolls", (request, response) => {
  const actorId = typeof request.body.actorId === "string" ? request.body.actorId : "";
  const actorName = typeof request.body.actorName === "string" ? request.body.actorName : "";
  const modifierValue =
    typeof request.body.modifier === "number" ? request.body.modifier : Number(request.body.modifier ?? 0);
  const note = typeof request.body.note === "string" && request.body.note.trim() ? request.body.note : "Check";

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

  broadcast("roll_recorded", record);
  broadcast("runtime_status", getRuntimeStatus());

  response.status(201).json(record);
});

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/ws", `http://${request.headers.host ?? "localhost"}`);
  const roleValue = url.searchParams.get("role");
  const role: ClientSession["role"] =
    roleValue === "gm" || roleValue === "player" || roleValue === "spectator" || roleValue === "ai" || roleValue === "admin"
      ? roleValue
      : "spectator";

  const session: ClientSession = {
    id: randomUUID(),
    role,
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

  socket.on("message", () => {
    const current = clientSessions.get(session.id);

    if (current) {
      current.lastSeenAt = new Date().toISOString();
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

server.listen(gameServerPort, host, () => {
  const gmUrl = "http://127.0.0.1:5173";
  const playerUrl = `http://127.0.0.1:${playerCompanionPort}`;

  console.log(`Black Dice Engine game server listening on http://${host}:${gameServerPort}`);
  console.log(`GM dashboard expected at ${gmUrl}`);
  console.log(`Player companion expected at ${playerUrl}`);
});
