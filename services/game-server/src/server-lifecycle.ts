import type { Server } from "node:http";
import type { WebSocketServer } from "ws";

type Timers = { every(callback: () => void, delay: number): unknown; cancel(timer: unknown): void };

/** Runtime-owned work, with injectable time/transport for checks that never start a real provider. */
export function createServerWork(options: { request?: typeof fetch; now?: () => number; timers?: Timers; onError?: () => void } = {}) {
  const request = options.request ?? fetch, now = options.now ?? Date.now;
  const timers = options.timers ?? { every: (callback, delay) => setInterval(callback, delay), cancel: timer => clearInterval(timer as ReturnType<typeof setInterval>) };
  const controller = new AbortController();
  const owned = new Set<unknown>();
  const stopped = () => controller.signal.aborted;
  const ownedRequest: typeof fetch = async (input, init) => {
    const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = inherited ? AbortSignal.any([inherited, controller.signal]) : controller.signal;
    signal.throwIfAborted();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const response = await Promise.race([request(input, { ...init, signal }), aborted]);
      signal.throwIfAborted();
      return response;
    } finally { signal.removeEventListener("abort", onAbort); }
  };
  return {
    now, request: ownedRequest,
    get active() { return !stopped(); },
    every(callback: () => void | Promise<void>, delay: number) {
      if (stopped()) throw new Error("Server work has stopped");
      const timer = timers.every(() => {
        if (stopped()) return;
        try { void Promise.resolve(callback()).catch(() => options.onError?.()); }
        catch { options.onError?.(); }
      }, delay);
      owned.add(timer);
    },
    stop() {
      if (stopped()) return;
      controller.abort(new Error("Server is stopping"));
      for (const timer of owned) timers.cancel(timer);
      owned.clear();
    }
  };
}

/** Stop admission/work, drain transports within a deadline, persist once, then close SQLite. */
export function createServerShutdown(options: {
  work: ReturnType<typeof createServerWork>;
  server: Server;
  sockets: WebSocketServer;
  stopAudio(): void;
  flush(): void | Promise<void>;
  closeStore(): void;
  graceMs?: number;
}) {
  let pending: Promise<void> | undefined;
  return function shutdown(): Promise<void> {
    if (pending) return pending;
    pending = (async () => {
      options.work.stop();
      options.stopAudio();
      for (const socket of options.sockets.clients) socket.terminate();
      const outcomes = await Promise.allSettled([
        new Promise<void>(resolve => options.sockets.close(() => resolve())),
        new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(() => options.server.closeAllConnections(), options.graceMs ?? 5000);
          options.server.close(error => { clearTimeout(deadline); if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error); else resolve(); });
        })
      ]);
      let error: unknown = outcomes.find(outcome => outcome.status === "rejected")?.reason;
      try { await options.flush(); } catch (failure) { error ??= failure; }
      try { options.closeStore(); } catch (failure) { error ??= failure; }
      if (error) throw error;
    })();
    return pending;
  };
}
