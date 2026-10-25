import type { TableEventRecord, MemoryEntry, MediaJob, AssetRecord } from "./types";

export function formatRelativeTime(value: string) {
  const elapsedMs = Date.now() - new Date(value).getTime();
  const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.round(elapsedSeconds / 60);

  return `${elapsedMinutes}m ago`;
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatVisibilityLabel(value: TableEventRecord["visibility"]) {
  switch (value) {
    case "gm_only":
      return "GM only";
    case "public_demo":
      return "Public demo";
    default:
      return "Table visible";
  }
}

export function formatMemoryKind(value: MemoryEntry["kind"]) {
  return value.replace(/_/g, " ");
}

export function formatMediaJobType(value: MediaJob["type"]) {
  return value.replace(/_/g, " ");
}

export function formatAssetKind(value: AssetRecord["kind"]) {
  return value.replace(/_/g, " ");
}

export function formatMediaJobStatus(value: MediaJob["status"]) {
  return value.replace(/_/g, " ");
}

export function formatSimpleLabel(value: string) {
  return value.replace(/_/g, " ");
}

export function formatInitiative(value: number | null) {
  if (value === null) return "--";
  return `Init ${value}`;
}
