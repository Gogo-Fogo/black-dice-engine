import { isObject } from "./index.js";

export const routerJobStatuses = ["prepared", "submitted", "running", "completed", "failed"] as const;
export type RouterJobStatus = typeof routerJobStatuses[number];
export type RouterJob = {
  id: string;
  workflowId: string;
  promptTemplateId: string;
  type: "image" | "video" | "audio" | "upscale" | "interpolation" | "visual_canon";
  status: RouterJobStatus;
  prompt: string;
  negativePrompt: string;
  referenceImage?: string;
  seed?: number;
  referenceId?: string;
  outputRoot: string | null;
  readyForComfySubmission: boolean;
  warnings: string[];
  createdAt: string;
  comfyPromptId?: string;
  outputs?: Record<string, unknown>;
  error?: string;
  submittedAt?: string;
  completedAt?: string;
};
export type RouterJobResponse = { ok: true; job: RouterJob };
export type RouterStatusResponse = RouterJobResponse & { comfyStatus: RouterJobStatus; error: string | null };

const text = (value: unknown): value is string => typeof value === "string";
const identifier = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 256;
const status = (value: unknown): value is RouterJobStatus => routerJobStatuses.includes(value as RouterJobStatus);
export function isRouterJob(value: unknown): value is RouterJob {
  return isObject(value) && identifier(value.id) && identifier(value.workflowId) && identifier(value.promptTemplateId) &&
    ["image", "video", "audio", "upscale", "interpolation", "visual_canon"].includes(value.type as string) && status(value.status) &&
    text(value.prompt) && text(value.negativePrompt) && (value.outputRoot === null || text(value.outputRoot)) &&
    (value.seed === undefined || Number.isSafeInteger(value.seed) && Number(value.seed) >= 0 && Number(value.seed) <= 4294967295) &&
    (value.referenceId === undefined || text(value.referenceId) && /^[a-f0-9]{64}$/.test(value.referenceId)) &&
    typeof value.readyForComfySubmission === "boolean" && Array.isArray(value.warnings) && value.warnings.every(text) && text(value.createdAt) &&
    ["referenceImage", "error", "submittedAt", "completedAt"].every(key => value[key] === undefined || text(value[key])) &&
    (value.comfyPromptId === undefined || identifier(value.comfyPromptId)) && (value.outputs === undefined || isObject(value.outputs));
}
export function isRouterJobResponse(value: unknown): value is RouterJobResponse {
  return isObject(value) && value.ok === true && isRouterJob(value.job);
}
export function isRouterStatusResponse(value: unknown): value is RouterStatusResponse {
  if (!isObject(value) || !status(value.comfyStatus) || !(value.error === null || text(value.error))) return false;
  const reportedStatus = value.comfyStatus;
  return isRouterJobResponse(value) && value.job.status === reportedStatus;
}
