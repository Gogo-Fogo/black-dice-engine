import { randomUUID } from "node:crypto";
import type { AiLogEntry, ErrorEvent } from "../../../packages/contracts/dist/index.js";

const summaries: Record<AiLogEntry["kind"], string> = {
  input_packet: "Prepared AI input metadata.", output_packet: "AI output processing completed.",
  tool_call: "Optional tool operation recorded.", validation_failure: "Structured input or output validation failed."
};
const counts = new Set(["proposedStateEventCount", "mediaRequestCount", "audioCueCount", "revealPlanCount", "canonizationNoteCount",
  "warningPresent", "stateEventCount", "appliedCount", "queuedCount", "memoryCount"]);
const services = new Set(["audio-service", "comfy-router", "game-server", "local-model", "tts-service"]);
const correlation = (value: unknown) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : "redacted";

/** Operational metadata only: raw prompts, prose, provider errors and paths never enter this owner. */
export function createDiagnostics(options: { exportAi?(jsonl: string): void; onExportFailure?(): void; now?: () => number } = {}) {
  const aiLogs: AiLogEntry[] = [], errorEvents: ErrorEvent[] = [];
  let exportFailed = false;
  const stamp = () => ({ id: randomUUID(), createdAt: new Date((options.now ?? Date.now)()).toISOString() });
  return {
    aiLogs, errorEvents,
    recordAiLog(entry: Omit<AiLogEntry, "id" | "createdAt">) {
      const details: Record<string, unknown> = {};
      for (const key of counts) {
        const value = entry.details[key];
        if (typeof value === "boolean" || typeof value === "number" && Number.isSafeInteger(value) && value >= 0) details[key] = value;
      }
      if (entry.details.error !== undefined) details.errorPresent = Boolean(entry.details.error);
      const log: AiLogEntry = { ...stamp(), kind: entry.kind, adapter: entry.adapter,
        correlationId: correlation(entry.correlationId), summary: summaries[entry.kind], details };
      aiLogs.unshift(log); aiLogs.splice(24);
      try {
        options.exportAi?.(aiLogs.slice().reverse().map(item => JSON.stringify(item)).join("\n")); exportFailed = false;
      } catch {
        if (!exportFailed) options.onExportFailure?.();
        exportFailed = true; // A failed diagnostic export must never fail a game command.
      }
      return log;
    },
    recordErrorEvent(entry: Omit<ErrorEvent, "id" | "createdAt">) {
      const service = services.has(entry.service) ? entry.service : "optional-service";
      const event: ErrorEvent = { ...stamp(), service, severity: entry.severity, visibility: "gm_only",
        summary: `${service} operation failed.`, message: "The optional operation could not be completed. Core play remains available.",
        recoveryHint: "Check the service status and configuration before retrying. Use silence or prepared content while unavailable.",
        ...(entry.correlationId === undefined ? {} : { correlationId: correlation(entry.correlationId) }) };
      errorEvents.unshift(event); errorEvents.splice(24); return event;
    }
  };
}
