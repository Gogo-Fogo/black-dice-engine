import { isRuntimeStatus, isSessionSnapshot, isCleanupReport, isAiLogEntry, isErrorEvent, isMemoryEntry } from "../../../../packages/contracts/dist/index.js";
import type { AiLogEntry, CleanupReport, ErrorEvent, MemoryEntry, SessionSnapshot } from "./types";

const cancelled = () => Object.assign(new Error("Host request cancelled"), { name: "AbortError" });
export const isHostCancellation = (error: unknown) => error instanceof Error && error.name === "AbortError";

/** Auth is supplied by the caller. This owner bounds reads and suppresses disposed results. */
export function createHostRequests(request: typeof fetch, clock: {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
} = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>)
}) {
  let active = true;
  let generation = 0;
  const pending = new Map<AbortController, unknown>();
  async function perform<T>(path: string, init: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
    if (!active) throw cancelled();
    const current = generation;
    const controller = new AbortController();
    const timeout = clock.schedule(() => controller.abort(), 10000);
    pending.set(controller, timeout);
    try {
      const response = await request(path, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error("Host request failed");
      const result = await read(response);
      if (!active || generation !== current || controller.signal.aborted) throw cancelled();
      return result;
    } catch (error) {
      if (!active || generation !== current) throw cancelled();
      if (controller.signal.aborted) throw new Error("Host request timed out");
      throw error;
    } finally {
      clock.cancel(timeout);
      pending.delete(controller);
    }
  }
  const json = <T>(path: string, init: RequestInit = {}) => perform<T>(path, init, response => response.json());
  return {
    activate() { active = true; generation += 1; },
    dispose() {
      active = false;
      generation += 1;
      for (const [controller, timeout] of pending) { clock.cancel(timeout); controller.abort(); }
      pending.clear();
    },
    async runtime() {
      const data = await json<unknown>("/api/runtime-status");
      if (!isRuntimeStatus(data)) throw new Error("Invalid runtime status");
      return data;
    },
    async snapshot() {
      const data = await json<unknown>("/api/session-snapshot");
      if (!isSessionSnapshot(data)) throw new Error("Invalid session snapshot");
      return data;
    },
    pendingNarration: () => json<{ text?: unknown }>("/api/pending-narration"),
    speech: (text: string) => perform("/api/speak", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text })
    }, response => response.blob()),
    async cleanup() {
      const data = await json<{ report: CleanupReport }>("/api/media-cleanup-report");
      if (!isCleanupReport(data?.report)) throw new Error("Invalid cleanup report");
      return data.report;
    },
    async aiLogs() {
      const data = await json<{ logs: AiLogEntry[] }>("/api/ai-logs");
      if (!Array.isArray(data?.logs) || !data.logs.every(isAiLogEntry)) throw new Error("Invalid activity log");
      return data.logs;
    },
    async errors() {
      const data = await json<{ events: ErrorEvent[] }>("/api/error-events");
      if (!Array.isArray(data?.events) || !data.events.every(isErrorEvent)) throw new Error("Invalid error log");
      return data.events;
    },
    async memory() {
      const data = await json<{ entry: MemoryEntry; exportPath: string; sessionSnapshot: SessionSnapshot }>("/api/memory-entries", { method: "POST" });
      if (!isMemoryEntry(data?.entry) || !isSessionSnapshot(data?.sessionSnapshot) || typeof data.exportPath !== "string") throw new Error("Invalid memory response");
      return data;
    },
    async save() {
      const data = await json<{ ok: boolean; sessionSnapshot: SessionSnapshot }>("/api/save-now", { method: "POST" });
      if (data?.ok !== true || !isSessionSnapshot(data.sessionSnapshot)) throw new Error("Save not confirmed");
      return data.sessionSnapshot;
    },
    async scene(title: string) {
      const data = await json<{ sessionSnapshot: SessionSnapshot }>("/api/set-scene", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title })
      });
      if (!isSessionSnapshot(data?.sessionSnapshot)) throw new Error("Scene change not confirmed");
      return data.sessionSnapshot;
    },
    summary: () => perform("/api/session-summary.md", {}, async response => {
      const blob = await response.blob();
      const match = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
      const filename = (match?.[1] ?? "session-summary.md").replace(/[^a-zA-Z0-9_. -]/g, "_");
      return { blob, filename, exportPath: response.headers.get("x-export-path") ?? "" };
    })
  };
}

export type HostRequests = ReturnType<typeof createHostRequests>;
