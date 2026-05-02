import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.BDE_HOST ?? "0.0.0.0";
const port = Number(process.env.BDE_RUNTIME_SERVICE_PORT ?? 4322);
const gameServerEndpoint = process.env.BDE_GAME_SERVER_ENDPOINT?.trim() || "http://127.0.0.1:4310";
const comfyRouterEndpoint = process.env.BDE_COMFY_ROUTER_ENDPOINT?.trim() || "";
const audioServiceEndpoint = process.env.BDE_AUDIO_SERVICE_ENDPOINT?.trim() || "";
const dbPath = process.env.BDE_DB_PATH || join(dirname(fileURLToPath(import.meta.url)), "../../../_data/black-dice-engine.db");
const backupsDir = process.env.BDE_BACKUPS_DIR?.trim() || join(dirname(fileURLToPath(import.meta.url)), "../../../_backups");

type ServiceHealth = {
  name: string;
  configured: boolean;
  status: "ok" | "degraded" | "offline" | "unknown";
  latencyMs?: number;
  message?: string;
  error?: string;
};

type RuntimeStatus = {
  id: string;
  status: "ok" | "degraded" | "offline" | "maintenance";
  updatedAt: string;
  services: ServiceHealth[];
  mediaPressure?: {
    level: "low" | "elevated" | "high";
    summary: string;
    reasons: string[];
  };
  warnings: string[];
};

type BackupRecord = {
  id: string;
  createdAt: string;
  sourceDbPath: string;
  backupPath: string;
  sizeBytes: number;
  note?: string;
};

const backupHistory: BackupRecord[] = [];

async function checkServiceHealth(
  name: string,
  endpoint: string,
  timeoutMs = 5000
): Promise<ServiceHealth> {
  if (!endpoint) {
    return {
      name,
      configured: false,
      status: "unknown",
      message: `No ${name} endpoint configured`
    };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        name,
        configured: true,
        status: "degraded",
        latencyMs,
        message: `${name} health returned ${res.status}`
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      name,
      configured: true,
      status: "ok",
      latencyMs,
      message: typeof data.message === "string" ? data.message : `${name} is healthy`
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      name,
      configured: true,
      status: "offline",
      latencyMs,
      message: `${name} is unreachable`,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function checkMediaPressure(): Promise<RuntimeStatus["mediaPressure"] & { warnings: string[] }> {
  if (!gameServerEndpoint) {
    return {
      level: "low",
      summary: "Game server not configured; cannot assess media pressure.",
      reasons: [],
      warnings: []
    };
  }

  try {
    const res = await fetch(`${gameServerEndpoint}/api/runtime-status`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      return {
        level: "low",
        summary: "Could not fetch runtime status from game server.",
        reasons: [],
        warnings: ["Game server runtime status unavailable"]
      };
    }

    const data = (await res.json()) as {
      mediaPressure?: RuntimeStatus["mediaPressure"];
      warnings?: string[];
    };

    return {
      level: data.mediaPressure?.level ?? "low",
      summary: data.mediaPressure?.summary ?? "Media pressure unknown.",
      reasons: data.mediaPressure?.reasons ?? [],
      warnings: data.warnings ?? []
    };
  } catch {
    return {
      level: "low",
      summary: "Game server unreachable; media pressure unknown.",
      reasons: [],
      warnings: ["Game server unreachable"]
    };
  }
}

async function buildRuntimeStatus(): Promise<RuntimeStatus> {
  const [gameHealth, comfyHealth, audioHealth] = await Promise.all([
    checkServiceHealth("game-server", gameServerEndpoint),
    checkServiceHealth("comfy-router", comfyRouterEndpoint),
    checkServiceHealth("audio-service", audioServiceEndpoint)
  ]);

  const mediaPressure = await checkMediaPressure();

  const services = [gameHealth, comfyHealth, audioHealth];
  const offlineCount = services.filter((s) => s.status === "offline").length;
  const degradedCount = services.filter((s) => s.status === "degraded").length;

  let overallStatus: RuntimeStatus["status"] = "ok";
  if (offlineCount > 0) overallStatus = "degraded";
  if (offlineCount >= 2) overallStatus = "offline";
  if (degradedCount >= 2 && offlineCount === 0) overallStatus = "degraded";

  const warnings = [...mediaPressure.warnings];
  if (offlineCount > 0) {
    warnings.push(`${offlineCount} service(s) are offline.`);
  }
  if (degradedCount > 0) {
    warnings.push(`${degradedCount} service(s) are degraded.`);
  }

  return {
    id: "runtime-main",
    status: overallStatus,
    updatedAt: new Date().toISOString(),
    services,
    mediaPressure: {
      level: mediaPressure.level,
      summary: mediaPressure.summary,
      reasons: mediaPressure.reasons
    },
    warnings
  };
}

function createBackup(note?: string): BackupRecord {
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `bde-backup-${timestamp}.db`;
  const backupPath = join(backupsDir, filename);

  if (!existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}`);
  }

  copyFileSync(dbPath, backupPath);

  const stats = statSync(backupPath);

  const record: BackupRecord = {
    id: `backup-${timestamp}`,
    createdAt: new Date().toISOString(),
    sourceDbPath: dbPath,
    backupPath,
    sizeBytes: stats.size,
    note
  };

  backupHistory.unshift(record);
  backupHistory.splice(10);

  return record;
}

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "runtime-service",
    port,
    gameServerEndpoint,
    comfyRouterEndpoint: comfyRouterEndpoint || null,
    audioServiceEndpoint: audioServiceEndpoint || null,
    dbPath,
    backupsDir
  });
});

app.get("/api/runtime-status", async (_request, response) => {
  const status = await buildRuntimeStatus();
  response.json(status);
});

app.post("/api/backup", (request, response) => {
  const note = typeof request.body?.note === "string" ? request.body.note : undefined;

  try {
    const record = createBackup(note);
    response.json({
      ok: true,
      backup: record
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    response.status(500).json({
      error: "Backup failed",
      message
    });
  }
});

app.get("/api/backups", (_request, response) => {
  response.json({
    backups: backupHistory,
    dbPath,
    backupsDir
  });
});

// Auto-backup on startup (session-start behavior)
setTimeout(() => {
  try {
    const record = createBackup("Automatic session-start backup");
    console.log(`[runtime-service] Auto-backup created: ${record.backupPath} (${record.sizeBytes} bytes)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[runtime-service] Auto-backup failed:", message);
  }
}, 5000);

server.listen(port, host, () => {
  console.log(`[runtime-service] listening on http://${host}:${port}`);
  console.log(`[runtime-service] polling game-server at ${gameServerEndpoint}`);
  console.log(`[runtime-service] backups directory: ${backupsDir}`);
});
