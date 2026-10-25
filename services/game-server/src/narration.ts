export type NarrationScope = {
  sessionId: string; mode: string; roundId: number | null; stage: string; revision: number;
};
type Completion = { text: string; error?: string };
type Outcome<R> = { status: "stale" } | { status: "generated" | "fallback"; text: string; value?: R };
type Channel = "roll" | "draft";
type Pending = { scope: NarrationScope; controller: AbortController };
const sameScope = (a: NarrationScope, b: NarrationScope) =>
  a.sessionId === b.sessionId && a.mode === b.mode && a.roundId === b.roundId && a.stage === b.stage && a.revision === b.revision;

/** Two bounded presentation slots. No state mutation, provider/config lookup or I/O on import. */
export function createNarration<I, R extends Completion>(hooks: {
  current(): NarrationScope;
  active(): boolean;
  generate(input: I, signal: AbortSignal): Promise<R>;
  deadlineMs?: number;
  timers?: { after(callback: () => void, delay: number): unknown; clear(timer: unknown): void };
}) {
  const deadlineMs = hooks.deadlineMs ?? 10000;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000) throw new Error("Invalid narration deadline");
  const timers = hooks.timers ?? { after: (callback, delay) => setTimeout(callback, delay), clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) };
  const pending = new Map<Channel, Pending>();
  let disposed = false;
  const current = (item: Pending) => !disposed && hooks.active() && sameScope(item.scope, hooks.current());
  const cancel = (item: Pending) => item.controller.abort();
  return {
    get busy() { return pending.size > 0; },
    async run(channel: Channel, input: I, fallback: string, signal?: AbortSignal): Promise<Outcome<R>> {
      if (disposed || !hooks.active() || signal?.aborted) return { status: "stale" };
      const prior = pending.get(channel);
      if (prior) cancel(prior);
      const item: Pending = { scope: { ...hooks.current() }, controller: new AbortController() };
      if (!current(item) || signal?.aborted) return { status: "stale" };
      pending.set(channel, item);
      let timedOut = false;
      const onCallerAbort = () => cancel(item);
      signal?.addEventListener("abort", onCallerAbort, { once: true });
      let onAbort: () => void = () => {};
      const interrupted = new Promise<undefined>(resolve => {
        onAbort = () => resolve(undefined);
        item.controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      const timer = timers.after(() => { timedOut = true; cancel(item); }, deadlineMs);
      try {
        // Race the whole completion, including body decoding. An adapter which ignores
        // abort may finish later, but cannot retain a slot or publish its result.
        const value = await Promise.race([
          Promise.resolve().then(() => item.controller.signal.aborted ? undefined : hooks.generate(input, item.controller.signal)).catch(() => undefined),
          interrupted
        ]);
        if (!current(item) || pending.get(channel) !== item || signal?.aborted || item.controller.signal.aborted && !timedOut) return { status: "stale" };
        if (value && !value.error && typeof value.text === "string" && value.text.trim() && value.text.length <= 12000) return { status: "generated", text: value.text.trim(), value };
        return { status: "fallback", text: fallback };
      } finally {
        timers.clear(timer);
        signal?.removeEventListener("abort", onCallerAbort);
        item.controller.signal.removeEventListener("abort", onAbort);
        if (pending.get(channel) === item) pending.delete(channel);
      }
    },
    cancelStale() { for (const item of pending.values()) if (!current(item)) cancel(item); },
    dispose() { disposed = true; for (const item of pending.values()) cancel(item); pending.clear(); }
  };
}
