import { freemem, totalmem } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { RuntimeResources } from "../../../packages/contracts/dist/index.js";

type Measurements = Omit<RuntimeResources, "sampledAt" | "gpu">;
/** Explicitly owned host/process measurements; no GPU inference or external command. */
export function createResourceMonitor(options: { now?: () => number; read?: () => Measurements } = {}) {
  const now = options.now ?? Date.now;
  const histogram = options.read ? undefined : monitorEventLoopDelay({ resolution: 20 });
  histogram?.enable();
  let cached: RuntimeResources | undefined, sampled = -Infinity, disposed = false;
  const read = options.read ?? (() => {
    const memory = process.memoryUsage();
    const delay = histogram && histogram.count > 0 ? Number((histogram.percentile(95) / 1e6).toFixed(2)) : null;
    histogram?.reset();
    return { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, hostFreeMemoryBytes: freemem(), hostTotalMemoryBytes: totalmem(), eventLoopDelayP95Ms: delay };
  });
  return {
    sample(): RuntimeResources {
      const time = now();
      if (cached && (disposed || time - sampled < 1000)) return cached;
      cached = { ...read(), sampledAt: new Date(time).toISOString(), gpu: "unmeasured" }; sampled = time;
      return cached;
    },
    dispose() { disposed = true; histogram?.disable(); }
  };
}

export function resourcePressure(value: RuntimeResources) {
  const fraction = value.hostFreeMemoryBytes / value.hostTotalMemoryBytes;
  const lowMemory = fraction < .05 || value.hostFreeMemoryBytes < 256 * 1024 ** 2;
  const elevatedMemory = fraction < .1 || value.hostFreeMemoryBytes < 512 * 1024 ** 2;
  const delay = value.eventLoopDelayP95Ms ?? 0;
  const level = lowMemory || delay > 200 ? "high" : elevatedMemory || delay > 50 ? "elevated" : "low";
  const reasons: string[] = [];
  if (lowMemory || elevatedMemory) reasons.push("Measured host free memory is low; defer heavy media work.");
  if (delay > 50) reasons.push("Measured event-loop delay is elevated; defer optional work.");
  return { level, reasons } as const;
}
