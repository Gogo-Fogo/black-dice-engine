import type { RouterJob as TrackedJob } from "../../../packages/contracts/dist/index.js";
import { fillWorkflow, uploadReference } from './reference-workflow.js';
import { readServiceConfig } from "../../../packages/runtime-config/dist/index.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

type WorkflowDefinition = {
  id: string;
  type: "image" | "video" | "audio" | "upscale" | "interpolation" | "visual_canon";
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

const { host, port, comfyApiBase, comfyOutputRoot, workflowRegistryPath, promptTemplatePath } = readServiceConfig("comfy");

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

const trackedJobs: TrackedJob[] = [];
const submissions=new WeakMap<TrackedJob,ReturnType<typeof submitJobToComfy>>();

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, (key,value) => key === 'referenceImage' ? undefined : value));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    size += chunks[chunks.length-1].length;
    if (size > 800000) throw new Error('Request too large');
  }

  if (!chunks.length) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function prepareJob(payload: Record<string, unknown>) {
  if(payload.id!==undefined&&(typeof payload.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(payload.id)))return {ok:false as const,statusCode:400,body:{error:'Invalid job ID.'}};
  if(trackedJobs.some(job=>job.id===payload.id))return {ok:false as const,statusCode:409,body:{error:'Job ID already prepared.'}};
  const workflowId = typeof payload.workflowId === "string" ? payload.workflowId : "";
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  const negativePrompt =
    typeof payload.negativePrompt === "string" ? payload.negativePrompt.trim() : undefined;
  const referenceImage =
    typeof payload.referenceImage === "string" ? payload.referenceImage : undefined;
  if (payload.referenceImage !== undefined && (typeof payload.referenceImage !== 'string' || payload.referenceImage.length > 750000 || !payload.referenceImage.startsWith('data:image/png;base64,'))) return {ok:false as const,statusCode:400,body:{error:'Invalid character reference.'}};
  if (payload.seed !== undefined && (!Number.isSafeInteger(payload.seed) || Number(payload.seed)<0 || Number(payload.seed)>4294967295)) return {ok:false as const,statusCode:400,body:{error:'Invalid seed.'}};
  if (payload.referenceId !== undefined && (typeof payload.referenceId !== 'string' || !/^[a-f0-9]{64}$/.test(payload.referenceId))) return {ok:false as const,statusCode:400,body:{error:'Invalid reference version.'}};
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

  if (workflow.workflowPath === "PLACEHOLDER.txt") {
    warnings.push("Workflow path is still a placeholder; ComfyUI submission will be blocked until a real workflow JSON is provided.");
  }

  if (workflow.visibility !== promptTemplate.defaultVisibility) {
    warnings.push(
      `Workflow visibility (${workflow.visibility}) differs from template default visibility (${promptTemplate.defaultVisibility}).`
    );
  }

  const job: TrackedJob = {
    id: typeof payload.id === "string" && payload.id ? payload.id : `media-job-${Date.now().toString(36)}`,
    workflowId: workflow.id,
    promptTemplateId: promptTemplate.id,
    type: workflow.type,
    status: "prepared",
    prompt,
    negativePrompt: negativePrompt || promptTemplate.negativeTemplate,
    referenceImage,
    seed: typeof payload.seed === 'number' ? payload.seed : undefined,
    referenceId: typeof payload.referenceId === 'string' ? payload.referenceId : undefined,
    outputRoot: comfyOutputRoot || null,
    readyForComfySubmission: Boolean(comfyApiBase && comfyOutputRoot && workflow.workflowPath !== "PLACEHOLDER.txt"),
    warnings,
    createdAt: new Date().toISOString()
  };

  trackedJobs.unshift(job);
  trackedJobs.splice(24);

  return {
    ok: true as const,
    statusCode: 200,
    body: {
      ok: true,
      job
    }
  };
}

async function submitJobToComfy(job: TrackedJob): Promise<{ ok: boolean; error?: string; comfyPromptId?: string }> {
  if (!comfyApiBase) {
    return { ok: false, error: "ComfyUI API base is not configured (BDE_COMFY_API_BASE)." };
  }

  const workflow = workflowRegistry.find((entry) => entry.id === job.workflowId);
  if (!workflow) {
    return { ok: false, error: "Workflow not found in registry." };
  }

  if (workflow.workflowPath === "PLACEHOLDER.txt") {
    return { ok: false, error: "Workflow is still a placeholder; provide a real ComfyUI workflow JSON file." };
  }

  let workflowJson: Record<string, unknown>;
  try {
    const workflowFullPath = join(dirname(workflowRegistryPath), workflow.workflowPath);
    const raw = readFileSync(workflowFullPath, "utf8");
    workflowJson = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Failed to load workflow JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Replace prompt placeholders inside the serialized workflow JSON
  const seed = job.seed ?? Math.floor(Math.random() * 99999999);
  let referenceImageName = "";
  const needsReference = JSON.stringify(workflowJson).includes('{{referenceImageName}}');
  if (needsReference || job.referenceImage) {
    if (!needsReference) return {ok:false,error:'Selected workflow cannot consume the character reference.'};
    try {
      referenceImageName = await uploadReference(fetch,comfyApiBase,job);
    } catch { return {ok:false,error:'Character reference upload failed. No generation was submitted.'}; }
  }
  workflowJson = fillWorkflow(workflowJson,{prompt:job.prompt,negativePrompt:job.negativePrompt || '',seed,referenceName:referenceImageName}) as Record<string,unknown>;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${comfyApiBase}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflowJson, client_id: job.id }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `ComfyUI returned ${res.status}: ${text}` };
    }

    const data = (await res.json()) as { prompt_id: string };
    return { ok: true, comfyPromptId: data.prompt_id };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: `ComfyUI request failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function pollComfyStatus(job: TrackedJob): Promise<{ status: TrackedJob["status"]; outputs?: Record<string, unknown>; error?: string }> {
  if (!comfyApiBase || !job.comfyPromptId) {
    return { status: job.status };
  }

  try {
    const res = await fetch(`${comfyApiBase}/history/${job.comfyPromptId}`, {
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      return { status: job.status, error: `ComfyUI history returned ${res.status}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const entry = data[job.comfyPromptId] as Record<string, unknown> | undefined;

    if (!entry) {
      // Job is still in-flight
      return { status: job.status === "prepared" ? "prepared" : "running" };
    }

    const outputs = entry.outputs as Record<string, unknown> | undefined;
    const statusInfo = entry.status as Record<string, unknown> | undefined;
    const completed = statusInfo?.completed as boolean | undefined;
    const executionError = statusInfo?.execution_error as Record<string, unknown> | undefined;

    if (executionError) {
      return {
        status: "failed",
        error: String(executionError.exception_message || "ComfyUI execution error")
      };
    }

    if (outputs && Object.keys(outputs).length > 0) {
      return { status: "completed", outputs };
    }

    if (completed === false) {
      return { status: "running" };
    }

    return { status: "completed", outputs: outputs ?? {} };
  } catch (err) {
    return { status: job.status, error: `Polling failed: ${err instanceof Error ? err.message : String(err)}` };
  }
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
      jobs: trackedJobs
    });
    return;
  }

  if (request.method === "GET" && /^\/api\/jobs\/[^/]+\/status$/.test(url.pathname)) {
    const jobId = url.pathname.split("/")[3];
    const job = trackedJobs.find((entry) => entry.id === jobId);

    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return;
    }

    const pollResult = await pollComfyStatus(job);

    // Update local tracked state if ComfyUI progressed
    if (pollResult.status === "completed" && job.status !== "completed") {
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.outputs = pollResult.outputs;
    } else if (pollResult.status === "failed" && job.status !== "failed") {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = pollResult.error;
    } else if (pollResult.status === "running" && job.status === "submitted") {
      job.status = "running";
    }

    sendJson(response, 200, {
      ok: true,
      job,
      comfyStatus: pollResult.status,
      error: pollResult.error ?? null
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

  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/submit$/.test(url.pathname)) {
    const jobId = url.pathname.split("/")[3];
    const job = trackedJobs.find((entry) => entry.id === jobId);

    if (!job) {
      sendJson(response, 404, { error: "Job not found" });
      return;
    }

    if (job.status !== "prepared") {
      sendJson(response, 409, { error: "Job is not in prepared state", job });
      return;
    }

    let submission=submissions.get(job);
    if(!submission){submission=submitJobToComfy(job);submissions.set(job,submission);}
    const submitResult = await submission;

    if (!submitResult.ok) {
      job.status = "failed";
      job.error = submitResult.error;
      job.completedAt = new Date().toISOString();
      sendJson(response, 502, { error: submitResult.error, job });
      return;
    }

    job.status = "submitted";
    job.comfyPromptId = submitResult.comfyPromptId;
    job.submittedAt = new Date().toISOString();
    sendJson(response, 200, { ok: true, job });
    return;
  }

  sendJson(response, 404, {
    error: "Not found"
  });
});

server.listen(port, host, () => {
  const address = server.address();
  console.log(`[comfy-router] listening on http://${host}:${typeof address === "object" && address ? address.port : port}`);
});
