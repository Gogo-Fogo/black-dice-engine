import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type WorkflowDefinition = {
  id: string;
  type: "image" | "video" | "audio" | "upscale" | "interpolation";
  label: string;
  description: string;
  runWhen: "background" | "session_break" | "manual";
  visibility: "gm_only" | "player_visible" | "public_demo";
  promptTemplateId: string;
  workflowPath: string;
  outputCategory: string;
  tags: string[];
};

type PromptTemplateDefinition = {
  id: string;
  category: "scene" | "portrait" | "location" | "item";
  label: string;
  purpose: string;
  positiveTemplate: string;
  negativeTemplate: string;
  requiredFields: string[];
  defaultVisibility: "gm_only" | "player_visible" | "public_demo";
  safetyNotes: string[];
};

type PreparedJob = {
  id: string;
  workflowId: string;
  promptTemplateId: string;
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
const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowRegistryPath = join(currentDir, "../../../comfy-workflows/registry.json");
const promptTemplatePath = join(currentDir, "../../../prompts/image-prompt-templates.json");

type WorkflowRegistryFile = {
  version: number;
  workflows: WorkflowDefinition[];
};

type PromptTemplateFile = {
  version: number;
  templates: PromptTemplateDefinition[];
};

function loadWorkflowRegistry() {
  const raw = readFileSync(workflowRegistryPath, "utf8");
  const parsed = JSON.parse(raw) as WorkflowRegistryFile;

  if (!Array.isArray(parsed.workflows)) {
    throw new Error("Workflow registry is missing a workflows array.");
  }

  return parsed;
}

function loadPromptTemplates() {
  const raw = readFileSync(promptTemplatePath, "utf8");
  const parsed = JSON.parse(raw) as PromptTemplateFile;

  if (!Array.isArray(parsed.templates)) {
    throw new Error("Prompt template file is missing a templates array.");
  }

  return parsed;
}

const workflowRegistryFile = loadWorkflowRegistry();
const workflowRegistry = workflowRegistryFile.workflows;
const promptTemplateFile = loadPromptTemplates();
const promptTemplates = promptTemplateFile.templates;

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
  const promptTemplate = workflow
    ? promptTemplates.find((entry) => entry.id === workflow.promptTemplateId)
    : null;

  if (!workflow) {
    return {
      ok: false as const,
      statusCode: 404,
      body: {
        error: "Workflow not found"
      }
    };
  }

  if (!promptTemplate) {
    return {
      ok: false as const,
      statusCode: 500,
      body: {
        error: "Prompt template not found for workflow"
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

  if (workflow.visibility !== promptTemplate.defaultVisibility) {
    warnings.push(
      `Workflow visibility (${workflow.visibility}) differs from template default visibility (${promptTemplate.defaultVisibility}).`
    );
  }

  const job: PreparedJob = {
    id: typeof payload.id === "string" && payload.id ? payload.id : `media-job-${Date.now().toString(36)}`,
    workflowId: workflow.id,
    promptTemplateId: promptTemplate.id,
    type: workflow.type,
    status: "prepared",
    prompt,
    negativePrompt: negativePrompt || promptTemplate.negativeTemplate,
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
      mode: comfyApiBase ? "configured" : "placeholder",
      workflowRegistryVersion: workflowRegistryFile.version,
      workflowCount: workflowRegistry.length,
      promptTemplateVersion: promptTemplateFile.version,
      promptTemplateCount: promptTemplates.length
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/workflows") {
    sendJson(response, 200, {
      version: workflowRegistryFile.version,
      registryPath: workflowRegistryPath,
      workflows: workflowRegistry
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/prompt-templates") {
    sendJson(response, 200, {
      version: promptTemplateFile.version,
      templatePath: promptTemplatePath,
      templates: promptTemplates
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
