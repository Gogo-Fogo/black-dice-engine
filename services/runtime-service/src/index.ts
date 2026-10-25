import { readServiceConfig } from "../../../packages/runtime-config/dist/index.js";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";

const { host, port, gameServerEndpoint, comfyRouterEndpoint, audioServiceEndpoint } = readServiceConfig("runtime");

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
    backups: "delegated-to-authenticated-game-server"
  });
});

app.get("/api/runtime-status", async (_request, response) => {
  const status = await buildRuntimeStatus();
  response.json(status);
});

// The database owner snapshots its live SQLite connection. Never copy a WAL database main file.
app.all(["/api/backup", "/api/backups", "/api/backups/:backupId/validate"], async (request, response) => {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) { response.status(401).json({ error: "Host credential required." }); return; }
  if (!gameServerEndpoint) { response.status(503).json({ error: "Game server is not configured." }); return; }
  if (!(request.method === "GET" && request.path === "/api/backups") && request.method !== "POST") {
    response.status(405).json({ error: "Unsupported backup operation." }); return;
  }
  try {
    const upstream = await fetch(`${gameServerEndpoint}${request.path}`, {
      method: request.method, redirect: "error", headers: { authorization, "content-type": "application/json" },
      ...(request.method === "POST" ? { body: JSON.stringify(request.body ?? {}) } : {}), signal: AbortSignal.timeout(30000)
    });
    const body: unknown = await upstream.json();
    response.status(upstream.status).json(body);
  } catch { response.status(503).json({ error: "Backup service is unavailable. Check the game server before retrying." }); }
});

server.listen(port, host, () => {
  const address = server.address();
  console.log(`[runtime-service] listening on http://${host}:${typeof address === "object" && address ? address.port : port}`);
  console.log(`[runtime-service] polling game-server at ${gameServerEndpoint}`);

});
