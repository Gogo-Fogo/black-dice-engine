import { createHash } from "node:crypto";
import type { NarrationScope } from "./narration.js";
export class SpeechError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const scopeKey = (scope: NarrationScope) => JSON.stringify([scope.sessionId, scope.mode, scope.roundId, scope.stage, scope.revision]);
type Job = { key: string; scope: string; text: string; controller: AbortController; promise: Promise<Uint8Array>;
  resolve(value: Uint8Array): void; reject(error: unknown): void; callers: number; timer: ReturnType<typeof setTimeout>; settled: boolean };

/** Owns bounded, deduplicated synthesis. No device playback or persistent audio files. */
export function createSpeech(hooks: { request: typeof fetch; endpoint: string; current(): NarrationScope; active(): boolean;
  now?: () => number; deadlineMs?: number; maxBytes?: number }) {
  const now = hooks.now ?? Date.now, deadlineMs = hooks.deadlineMs ?? 30000, maxBytes = hooks.maxBytes ?? 8 * 1024 * 1024;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000 || !Number.isInteger(maxBytes) || maxBytes < 12 || maxBytes > 8 * 1024 * 1024) throw new Error("Invalid speech bounds");
  const jobs = new Map<string, Job>(), queue: Job[] = [];
  const cache = new Map<string, { scope: string; bytes: Uint8Array; at: number }>();
  let disposed = false, running: Job | undefined, cacheBytes = 0;
  const valid = (job: Job) => !disposed && hooks.active() && job.scope === scopeKey(hooks.current());
  function finish(job: Job, error?: SpeechError, bytes?: Uint8Array) {
    if (job.settled) return;
    job.settled = true; clearTimeout(job.timer); jobs.delete(job.key);
    const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1);
    if (error) { job.controller.abort(); job.reject(error); } else job.resolve(bytes!);
  }
  function trimCache() {
    const current = scopeKey(hooks.current());
    for (const [key, item] of cache) if (item.scope !== current || now() - item.at > 300000) { cacheBytes -= item.bytes.byteLength; cache.delete(key); }
    while (cache.size > 8 || cacheBytes > 16 * 1024 * 1024) {
      const oldest = cache.entries().next().value;
      if (!oldest) break; cacheBytes -= oldest[1].bytes.byteLength; cache.delete(oldest[0]);
    }
  }
  async function generate(job: Job) {
    let response: Response | undefined;
    try {
      response = await hooks.request(`${hooks.endpoint}/speak`, {
        method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: job.text, voice: "bm_george", speed: 0.85 }), signal: job.controller.signal
      });
      if (!valid(job) || job.settled) { void response.body?.cancel().catch(() => {}); finish(job, new SpeechError(409, "Speech request is no longer current.")); return; }
      if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "audio/wav") throw new SpeechError(502, "Speech service returned invalid audio.");
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) < 12 || Number(length) > maxBytes)) throw new SpeechError(502, "Speech audio exceeds the allowed size.");
      const reader = response.body?.getReader(); if (!reader) throw new SpeechError(502, "Speech service returned no audio.");
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          if (job.controller.signal.aborted || !valid(job) || job.settled) throw new SpeechError(409, "Speech request is no longer current.");
          size += value.byteLength; if (size > maxBytes) throw new SpeechError(502, "Speech audio exceeds the allowed size.");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (size < 12 || length !== null && Number(length) !== size) throw new SpeechError(502, "Speech service returned incomplete audio.");
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      if (new DataView(bytes.buffer).getUint32(4, true) !== size - 8) throw new SpeechError(502, "Speech service returned incomplete audio.");
      if (new TextDecoder().decode(bytes.subarray(0, 4)) !== "RIFF" || new TextDecoder().decode(bytes.subarray(8, 12)) !== "WAVE") throw new SpeechError(502, "Speech service returned invalid audio.");
      if (!valid(job) || job.settled) { finish(job, new SpeechError(409, "Speech request is no longer current.")); return; }
      cache.set(job.key, { scope: job.scope, bytes, at: now() }); cacheBytes += size; trimCache(); finish(job, undefined, bytes);
    } catch (error) {
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
      finish(job, error instanceof SpeechError ? error : new SpeechError(502, "Speech service unavailable."));
    }
  }
  function pump() {
    if (running || disposed) return;
    const job = queue.shift(); if (!job) return;
    if (!valid(job)) { finish(job, new SpeechError(409, "Speech request is no longer current.")); pump(); return; }
    running = job;
    // A transport/body reader ignoring abort must not hold the queue after timeout.
    void Promise.race([generate(job), job.promise.then(() => {}, () => {})]).finally(() => { if (running === job) running = undefined; pump(); });
  }
  function synthesize(text: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (disposed || !hooks.active()) return Promise.reject(new SpeechError(503, "Speech is unavailable."));
    if (!hooks.endpoint) return Promise.reject(new SpeechError(503, "Speech is not configured."));
    if (typeof text !== "string" || !text.trim() || text.trim().length > 4000) return Promise.reject(new SpeechError(400, "Speech text must contain 1 to 4000 characters."));
    if (signal?.aborted) return Promise.reject(new SpeechError(409, "Speech request cancelled."));
    trimCache(); text = text.trim(); const scope = scopeKey(hooks.current());
    const key = createHash("sha256").update(scope).update("\0").update(text).digest("hex");
    const cached = cache.get(key); if (cached) return Promise.resolve(cached.bytes.slice());
    let job = jobs.get(key);
    if (!job) {
      if (jobs.size >= 3) return Promise.reject(new SpeechError(503, "Speech queue is busy. Try again shortly."));
      let resolve!: Job["resolve"], reject!: Job["reject"];
      const promise = new Promise<Uint8Array>((accept, decline) => { resolve = accept; reject = decline; });
      job = { key, scope, text, controller: new AbortController(), promise, resolve, reject, callers: 0, settled: false, timer: undefined! };
      const owned = job;
      job.timer = setTimeout(() => { finish(owned, new SpeechError(504, "Speech request timed out.")); pump(); }, deadlineMs);
      jobs.set(key, job); queue.push(job);
    }
    const owned = job; owned.callers++;
    return new Promise<Uint8Array>((resolve, reject) => {
      let done = false;
      const settle = (error?: unknown, bytes?: Uint8Array) => {
        if (done) return; done = true; signal?.removeEventListener("abort", onAbort); owned.callers--;
        if (error) reject(error); else resolve(bytes!.slice());
        if (owned.callers === 0 && !owned.settled) finish(owned, new SpeechError(409, "Speech request cancelled."));
      };
      const onAbort = () => settle(new SpeechError(409, "Speech request cancelled."));
      signal?.addEventListener("abort", onAbort, { once: true });
      owned.promise.then(bytes => settle(undefined, bytes), error => settle(error)); pump();
    });
  }
  return { synthesize,
    cancelStale() {
      if (disposed || !hooks.active()) return;
      for (const job of jobs.values()) if (!valid(job)) finish(job, new SpeechError(409, "Speech request is no longer current."));
      trimCache(); pump();
    },
    dispose() { disposed = true; for (const job of jobs.values()) finish(job, new SpeechError(503, "Speech is unavailable.")); cache.clear(); cacheBytes = 0; }
  };
}
