import type { CapabilityState, ServiceState } from "../../../packages/contracts/dist/index.js";
type CheckedState = "reachable" | "ready" | "busy";
type Descriptor = { name: string; enabled: boolean; configured: boolean; probe(signal: AbortSignal): Promise<CheckedState>; busy?(): boolean };

/** Read-only health observations; never submits inference or media work. */
export function createCapabilityHealth(descriptors: Descriptor[], options: { now?: () => number; deadlineMs?: number } = {}) {
  const now = options.now ?? Date.now, deadlineMs = options.deadlineMs ?? 2500;
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 10000 || new Set(descriptors.map(item => item.name)).size !== descriptors.length) throw new Error("Invalid capability health configuration");
  const observations = new Map<string, { state: CapabilityState; checkedAt: string; latencyMs: number }>();
  const controllers = new Set<AbortController>();
  let active = true, flight: Promise<void> | undefined;
  const messages: Record<CapabilityState, string> = {
    disabled: "Disabled by the runtime profile or provider policy", unconfigured: "No endpoint configured",
    configured: "Configured; health has not been checked", reachable: "Reachable; readiness is not established",
    ready: "Readiness check passed; generation/playback is not guaranteed", busy: "Ready service with active work",
    failed: "Health check failed or timed out; optional capability unavailable"
  };
  function status(): ServiceState[] {
    return descriptors.map(item => {
      const observed = observations.get(item.name);
      let state: CapabilityState = !item.enabled ? "disabled" : !item.configured ? "unconfigured" : observed?.state ?? "configured";
      // Never let old evidence remain ready indefinitely after probing stops.
      if (observed && now() - Date.parse(observed.checkedAt) > 30000 && item.enabled && item.configured) state = "configured";
      if (state === "ready" && item.busy?.()) state = "busy";
      return { name: item.name, status: state === "ready" ? "ok" : state === "busy" ? "degraded" : state === "failed" ? "offline" : "unknown",
        message: messages[state], ...(observed ? { latencyMs: observed.latencyMs } : {}),
        capability: { enabled: item.enabled, configured: item.configured, state, checkedAt: observed?.checkedAt ?? null } };
    });
  }
  async function check(item: Descriptor) {
    if (!active || !item.enabled || !item.configured) return;
    const controller = new AbortController(); controllers.add(controller);
    const started = now(); let onAbort: () => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Capability probe cancelled"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    let state: CapabilityState = "failed";
    try {
      const result = await Promise.race([Promise.resolve().then(() => controller.signal.aborted ? Promise.reject() : item.probe(controller.signal)), interrupted]);
      if (["reachable", "ready", "busy"].includes(result)) state = result;
    } catch { /* Never expose provider bodies, paths, credentials or exception text. */ }
    finally { clearTimeout(timer); controller.signal.removeEventListener("abort", onAbort); controllers.delete(controller); }
    if (active) observations.set(item.name, { state, checkedAt: new Date(now()).toISOString(), latencyMs: Math.max(0, now() - started) });
  }
  return { status,
    refresh(): Promise<void> {
      if (!active) return Promise.resolve();
      if (!flight) flight = Promise.all(descriptors.map(check)).then(() => {}).finally(() => { flight = undefined; });
      return flight;
    },
    dispose() { active = false; for (const controller of controllers) controller.abort(); controllers.clear(); }
  };
}

/** Exact expected service identity, without trusting arbitrary HTTP 200 JSON. */
export async function probeService(request: typeof fetch, endpoint: string, service: "audio-service" | "comfy-router" | "tts", signal: AbortSignal): Promise<CheckedState> {
  const response = await request(`${endpoint}/health`, { signal, redirect: "error" });
  if (!response.ok) throw new Error("Service health failed");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true || !("service" in body) || body.service !== service) throw new Error("Invalid service health");
  if (service === "tts") return "status" in body && body.status === "ready" ? "ready" : "reachable";
  if (service === "audio-service") return "configured" in body && body.configured === true && "trackCount" in body && Number.isSafeInteger(body.trackCount) && Number(body.trackCount) > 0 ? "ready" : "reachable";
  // Router configuration and workflow metadata cannot prove the separate GPU host.
  return "reachable";
}
