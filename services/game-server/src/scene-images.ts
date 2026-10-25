import { createHash } from "node:crypto";
import type { NarrationScope } from "./narration.js";

type Outcome = { status: "submitted"; promptId: string } | { status: "disabled" | "busy" | "stale" | "failed" };
type Job = { scope: string; prompt: string; controller: AbortController; promise: Promise<Outcome>;
  finish(result: Outcome): void; settled: boolean };
const scopeKey = (scope: NarrationScope) => JSON.stringify([scope.sessionId, scope.mode, scope.roundId, scope.stage, scope.revision]);

/** Submission admission only: acceptance does not prove an image exists or cancel remote GPU work. */
export function createSceneImages(hooks: { request: typeof fetch; endpoint: string; current(): NarrationScope;
  active(): boolean; deadlineMs?: number; seed?: () => number }) {
  const deadlineMs = hooks.deadlineMs ?? 10000;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10000) throw new Error("Invalid image submission deadline");
  const jobs = new Set<Job>(), queue: Job[] = [];
  // Retain settled attempts too: ambiguous acceptance must never cause an automatic retry.
  const attempts = new Map<string, { scope: string; promise: Promise<Outcome> }>();
  let disposed = false, running: Job | undefined;
  const valid = (job: Job) => !disposed && hooks.active() && job.scope === scopeKey(hooks.current());
  async function submit(job: Job) {
    let response: Response | undefined;
    try {
      response = await hooks.request(`${hooks.endpoint}/prompt`, { method: "POST", redirect: "error",
        headers: { "Content-Type": "application/json" }, signal: job.controller.signal,
        body: JSON.stringify({ prompt: sceneWorkflow(job.prompt, hooks.seed?.() ?? Math.floor(Math.random() * 99999999)) }) });
      if (!valid(job) || job.settled) { void response.body?.cancel().catch(() => {}); job.finish({ status: "stale" }); return; }
      if (!response.ok) throw new Error("Submission rejected");
      // Bound the acknowledgment as well as the whole request; never retain provider error bodies.
      const reader = response.body?.getReader(); if (!reader) throw new Error("Missing acknowledgment");
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 16384 || !valid(job) || job.settled) throw new Error("Invalid acknowledgment");
          chunks.push(value);
        }
      } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!value || typeof value !== "object" || !("prompt_id" in value) || typeof value.prompt_id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(value.prompt_id) || ("error" in value && value.error)) throw new Error("Invalid acknowledgment");
      job.finish(valid(job) ? { status: "submitted", promptId: value.prompt_id } : { status: "stale" });
    } catch {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      job.finish({ status: valid(job) ? "failed" : "stale" });
    }
  }
  function pump() {
    if (running || disposed) return;
    const job = queue.shift(); if (!job) return;
    if (!valid(job)) { job.finish({ status: "stale" }); pump(); return; }
    running = job;
    void Promise.race([submit(job), job.promise]).finally(() => { if (running === job) running = undefined; pump(); });
  }
  function cancelStale() {
    for (const job of jobs) if (!valid(job)) job.finish({ status: "stale" });
    const scope = scopeKey(hooks.current());
    for (const [key, item] of attempts) if (item.scope !== scope) attempts.delete(key);
    pump();
  }
  return {
    request(prompt: string): Promise<Outcome> {
      if (disposed || !hooks.active()) return Promise.resolve({ status: "stale" });
      if (!hooks.endpoint || hooks.current().mode === "party") return Promise.resolve({ status: "disabled" });
      if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) return Promise.resolve({ status: "failed" });
      cancelStale(); prompt = prompt.trim(); const scope = scopeKey(hooks.current());
      const key = createHash("sha256").update(scope).update("\0").update(prompt).digest("hex");
      const prior = attempts.get(key); if (prior) return prior.promise;
      if (jobs.size >= 3 || attempts.size >= 64) return Promise.resolve({ status: "busy" });
      let resolve!: (value: Outcome) => void;
      const promise = new Promise<Outcome>(accept => { resolve = accept; });
      const job: Job = { scope, prompt, controller: new AbortController(), promise, settled: false, finish(result) {
        if (job.settled) return;
        job.settled = true; clearTimeout(timer); jobs.delete(job);
        const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
        if (result.status !== "submitted") job.controller.abort();
        resolve(result);
      } };
      const timer = setTimeout(() => { job.finish({ status: "failed" }); pump(); }, deadlineMs);
      jobs.add(job); queue.push(job); attempts.set(key, { scope, promise }); pump(); return promise;
    },
    cancelStale,
    dispose() { disposed = true; for (const job of jobs) job.finish({ status: "stale" }); attempts.clear(); }
  };
}

function sceneWorkflow(prompt: string, seed: number) {
  return {
    "1": { inputs: { ckpt_name: "sdxl_lightning_4step.safetensors" }, class_type: "CheckpointLoaderSimple" },
    "2": { inputs: { text: prompt, clip: ["1", 1] }, class_type: "CLIPTextEncode" },
    "3": { inputs: { text: "blurry low quality watermark text distorted", clip: ["1", 1] }, class_type: "CLIPTextEncode" },
    "4": { inputs: { width: 1024, height: 704, batch_size: 1 }, class_type: "EmptyLatentImage" },
    "5": { inputs: { seed, steps: 4, cfg: 1.0, sampler_name: "euler", scheduler: "normal", denoise: 1,
      model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] }, class_type: "KSampler" },
    "6": { inputs: { samples: ["5", 0], vae: ["1", 2] }, class_type: "VAEDecode" },
    "7": { inputs: { filename_prefix: "bde/scene", images: ["6", 0] }, class_type: "SaveImage" }
  };
}
