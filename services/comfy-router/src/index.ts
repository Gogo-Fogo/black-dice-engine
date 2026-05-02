import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type WorkflowDefinition = {
  id: string;
  type: "image" | "video" | "audio" | "upscale" | "interpolation";
  label: string;
  description: string;
  runWhen: "background" | "session_break" | "manual";
};

type PreparedJob = {
  id: string;
  workflowId: string;
  type: WorkflowDefinition["type"];
  status: "prepared";
  prompt: string;
  negativePrompt?: string;
  outputRoot: string | null;
  readyForComfySubmission: boolean;
  warnings: string[];
  createdAt: string;
};

const host = process.env.BDE_HOST ?? "0.0.0.0";
const port = Number(process.env.BDE_COMFY_ROUTER_PORT ?? 4320);
const comfyApiBase = process.env.BDE_COMFY_API_BASE?.trim() || "";
const comfyOutputRoot = process.env.BDE_COMFY_OUTPUT_ROOT?.trim() || "";

const workflowRegistry: WorkflowDefinition[] = [
  {
    id: "scene-reveal-placeholder",
    type: "image",
    label: "Scene Reveal Placeholder",
    description: "First-pass scene still for a location reveal or moody exploration beat.",
    runWhen: "background"
  },
  {
    id: "portrait-variant-placeholder",
    type: "image",
    label: "Portrait Variant Placeholder",
    description: "Prep-time portrait variant or character visual-canon pass.",
    runWhen: "manual"
  },
  {
    id: "cinematic-boss-intro-placeholder",
    type: "video",
    label: "Boss Intro Placeholder",
    description: "Session-break cinematic clip scaffold for major reveals.",
    runWhen: "session_break"
  }
];

const preparedJobs: PreparedJob[] = [];

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function prepareJob(payload: Record<string, unknown>) {
  const workflowId = typeof payload.workflowId === "string" ? payload.workflowId : "";
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const negativePrompt =
    typeof payload.negativePrompt === "string" ? payload.negativePrompt.trim() : undefined;
  const workflow = workflowRegistry.find((entry) => entry.id === workflowId);

  if (!workflow) {
    return {
      ok: false as const,
      statusCode: 404,
      body: {
        error: "Workflow not found"
      }
    };
  }

  if (!prompt) {
    return {
      ok: false as const,
      statusCode: 400,
      body: {
        error: "Prompt is required"
      }
    };
  }

  const warnings: string[] = [];

  if (!comfyApiBase) {
    warnings.push("No BDE_COMFY_API_BASE configured yet; router remains in placeholder mode.");
  }

  if (!comfyOutputRoot) {
    warnings.push("No BDE_COMFY_OUTPUT_ROOT configured yet; output destination is not locked.");
  }

  const job: PreparedJob = {
    id: typeof payload.id === "string" && payload.id ? payload.id : `media-job-${Date.now().toString(36)}`,
    workflowId: workflow.id,
    type: workflow.type,
    status: "prepared",
    prompt,
    negativePrompt,
    outputRoot: comfyOutputRoot || null,
    readyForComfySubmission: Boolean(comfyApiBase && comfyOutputRoot),
    warnings,
    createdAt: new Date().toISOString()
  };

  preparedJobs.unshift(job);
  preparedJobs.splice(12);

  return {
    ok: true as const,
    statusCode: 200,
    body: {
      ok: true,
      job
    }
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `127.0.0.1:${port}`}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "comfy-router",
      port,
      mode: comfyApiBase ? "configured" : "placeholder"
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workflows") {
    sendJson(response, 200, {
      workflows: workflowRegistry
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/jobs") {
    sendJson(response, 200, {
      jobs: preparedJobs
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs/prepare") {
    try {
      const payload = await readJsonBody(request);

      if (!payload) {
        sendJson(response, 400, {
          error: "JSON request body is required"
        });
        return;
      }

      const result = prepareJob(payload);
      sendJson(response, result.statusCode, result.body);
    } catch {
      sendJson(response, 400, {
        error: "Invalid JSON body"
      });
    }
    return;
  }

  sendJson(response, 404, {
    error: "Not found"
  });
});

server.listen(port, host, () => {
  console.log(`[comfy-router] listening on http://${host}:${port}`);
});
