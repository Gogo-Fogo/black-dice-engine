import { isRouterJobResponse, isRouterStatusResponse, type MediaJob, type RouterStatusResponse } from "../../../packages/contracts/dist/index.js";

export class MediaRouterError extends Error {
  constructor(public code: "busy" | "stale" | "failed", message: string) { super(message); }
}
type Task = { valid(): boolean; controller: AbortController; settled: boolean;
  execute(signal: AbortSignal): Promise<unknown>; promise: Promise<unknown>; finish(error?: unknown, value?: unknown): void };

/** Bounded logical request owner. Callers own durable admission and authoritative state. */
export function createMediaRouterClient(request: typeof fetch, hooks: {
  scope?(): string; current?(job: MediaJob): boolean; enabled?(): boolean; startDeadlineMs?: number; pollDeadlineMs?: number;
  reference?(job: MediaJob): {referenceImage: string; seed: number; referenceId: string} | undefined;
} = {}) {
  const startDeadline = hooks.startDeadlineMs ?? 25000, pollDeadline = hooks.pollDeadlineMs ?? 8000;
  for (const value of [startDeadline, pollDeadline]) if (!Number.isInteger(value) || value < 1 || value > 25000) throw new Error("Invalid media deadline");
  const scope = hooks.scope ?? (() => "default"), current = hooks.current ?? (() => true);
  const tasks = new Set<Task>(), queue: Task[] = [];
  const starts = new Map<string, { scope: string; payload: string; promise: Promise<unknown> }>();
  const polls = new Map<string, Promise<unknown>>();
  let disposed = false, running: Task | undefined;
  const stale = () => new MediaRouterError("stale", "Media request is no longer current.");
  const busy = () => new MediaRouterError("busy", "Media request queue is busy. Try again shortly.");
  function pump() {
    if (running || disposed) return;
    const task = queue.shift(); if (!task) return;
    if (!task.valid()) { task.finish(stale()); pump(); return; }
    running = task;
    void Promise.race([task.execute(task.controller.signal).then(value => task.finish(task.valid() ? undefined : stale(), value), error => {
      task.finish(error instanceof MediaRouterError ? error : new MediaRouterError("failed", "Media router unavailable."));
    }), task.promise.then(() => {}, () => {})]).finally(() => { if (running === task) running = undefined; pump(); });
  }
  function cancelStale() {
    for (const task of tasks) if (!task.valid()) task.finish(stale());
    for (const [key, attempt] of starts) if (attempt.scope !== scope()) starts.delete(key);
    pump();
  }
  function enqueue(job: MediaJob, deadline: number, execute: Task["execute"]) {
    if (disposed || hooks.enabled?.() === false || !current(job)) return Promise.reject(stale());
    cancelStale(); if (tasks.size >= 3) return Promise.reject(busy());
    const ownedScope = scope(), status = job.status;
    let accept!: (value: unknown) => void, decline!: (error: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => { accept = resolve; decline = reject; });
    const task: Task = { controller: new AbortController(), promise, execute, settled: false,
      valid: () => !disposed && hooks.enabled?.() !== false && scope() === ownedScope && current(job) && job.status === status,
      finish(error, value) {
        if (task.settled) return;
        task.settled = true; clearTimeout(timer); tasks.delete(task);
        const index = queue.indexOf(task); if (index >= 0) queue.splice(index, 1);
        if (error) { task.controller.abort(); decline(error); } else accept(value);
      }
    };
    const timer = setTimeout(() => { task.finish(new MediaRouterError("failed", "Media request timed out; submission may have been accepted.")); pump(); }, deadline);
    tasks.add(task); queue.push(task); pump(); return promise;
  }
  async function json(url: string, init: RequestInit, signal: AbortSignal, label: string): Promise<unknown> {
    signal.throwIfAborted();
    const response = await request(url, { ...init, redirect: "error", signal });
    if (signal.aborted || !response.ok) {
      void response.body?.cancel().catch(() => {}); signal.throwIfAborted();
      throw new MediaRouterError("failed", `Media ${label} failed (${response.status})`);
    }
    const reader = response.body?.getReader(); if (!reader) throw new MediaRouterError("failed", `Invalid media ${label} confirmation`);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        signal.throwIfAborted(); size += value.byteLength;
        if (size > 128 * 1024) throw new MediaRouterError("failed", `Invalid media ${label} confirmation`);
        chunks.push(value);
      }
    } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    signal.throwIfAborted();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new MediaRouterError("failed", `Invalid media ${label} confirmation`); }
  }
  return {
    get canStart() { cancelStale(); return !disposed && hooks.enabled?.() !== false && tasks.size < 3 && starts.size < 64; },
    start(endpoint: string, job: MediaJob): Promise<{ routerJobId: string; promptId: string }> {
      if (disposed || hooks.enabled?.() === false || !current(job)) return Promise.reject(stale());
      cancelStale();
      const reference=hooks.reference?.(job);
      const payload = JSON.stringify({ id: job.id, workflowId: job.workflowId, prompt: job.prompt, negativePrompt: job.negativePrompt, type: job.type, ...reference });
      const key = JSON.stringify([scope(), endpoint, job.id]), prior = starts.get(key);
      if (prior) return (prior.payload === payload ? prior.promise : Promise.reject(new MediaRouterError("failed", "Media job ID was already attempted with different input."))) as Promise<{ routerJobId: string; promptId: string }>;
      if (tasks.size >= 3 || starts.size >= 64) return Promise.reject(busy());
      const identity = { id: job.id, type: job.type, workflowId: job.workflowId };
      const promise = enqueue(job, startDeadline, async signal => {
        const preparation = await json(`${endpoint}/api/jobs/prepare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }, signal, "preparation");
        if (!isRouterJobResponse(preparation) || preparation.job.id !== identity.id || preparation.job.status !== "prepared" ||
          preparation.job.type !== identity.type || (identity.workflowId !== undefined && preparation.job.workflowId !== identity.workflowId) ||
          reference && (preparation.job.referenceId!==reference.referenceId || preparation.job.seed!==reference.seed)) {
          throw new MediaRouterError("failed", "Invalid media preparation confirmation");
        }
        signal.throwIfAborted();
        const submission = await json(`${endpoint}/api/jobs/${encodeURIComponent(identity.id)}/submit`, { method: "POST" }, signal, "submission");
        if (!isRouterJobResponse(submission) || submission.job.id !== identity.id || submission.job.status !== "submitted" ||
          submission.job.workflowId !== preparation.job.workflowId || submission.job.type !== identity.type || !submission.job.comfyPromptId ||
          reference && (submission.job.referenceId!==reference.referenceId || submission.job.seed!==reference.seed)) {
          throw new MediaRouterError("failed", "Invalid media submission confirmation");
        }
        return { routerJobId: submission.job.id, promptId: submission.job.comfyPromptId };
      });
      starts.set(key, { scope: scope(), payload, promise });
      return promise as Promise<{ routerJobId: string; promptId: string }>;
    },
    poll(endpoint: string, routerJobId: string, promptId?: string, job?: MediaJob): Promise<RouterStatusResponse> {
      const key = JSON.stringify([scope(), endpoint, routerJobId, promptId]);
      const prior = polls.get(key); if (prior) return prior as Promise<RouterStatusResponse>;
      // Optional job retains compatibility for import-safe adapter consumers; bootstrap always supplies it.
      const target = job ?? { id: routerJobId, status: "running" } as MediaJob;
      const promise = enqueue(target, pollDeadline, async signal => {
        const value = await json(`${endpoint}/api/jobs/${encodeURIComponent(routerJobId)}/status`, {}, signal, "status");
        if (!isRouterStatusResponse(value) || value.job.id !== routerJobId || (promptId !== undefined && value.job.comfyPromptId !== promptId)) {
          throw new MediaRouterError("failed", "Invalid media status confirmation");
        }
        return value;
      });
      polls.set(key, promise); void promise.then(() => polls.delete(key), () => polls.delete(key));
      return promise as Promise<RouterStatusResponse>;
    },
    cancelStale,
    dispose() { disposed = true; for (const task of tasks) task.finish(stale()); starts.clear(); polls.clear(); }
  };
}

/** One poll per live object; late replies cannot overwrite a manual terminal action or a replacement. */
export function createMediaJobPoller(client: Pick<ReturnType<typeof createMediaRouterClient>, "poll">, callbacks: {
  current(job: MediaJob): boolean;
  completed(job: MediaJob, outputs?: Record<string, unknown>): void;
  failed(job: MediaJob, error: string): void;
}) {
  const pending = new Set<MediaJob>();
  return async (endpoint: string, job: MediaJob) => {
    if (pending.has(job) || job.status !== "running" || !job.comfyRouterJobId) return;
    const routerId = job.comfyRouterJobId, promptId = job.comfyPromptId;
    pending.add(job);
    try {
      const result = await client.poll(endpoint, routerId, promptId, job);
      if (!callbacks.current(job) || job.status !== "running" || job.comfyRouterJobId !== routerId || job.comfyPromptId !== promptId) return;
      if (result.comfyStatus === "completed") callbacks.completed(job, result.job.outputs);
      else if (result.comfyStatus === "failed") callbacks.failed(job, "ComfyUI job failed");
    } finally { pending.delete(job); }
  };
}
