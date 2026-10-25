import { useCallback, useRef, useState } from "react";
import type { AiLogEntry, CleanupReport, ErrorEvent, SessionSnapshot } from "./types";
import { isHostCancellation, type HostRequests } from "./host-requests";

export function useHostReports(api: HostRequests, setSnapshot: (value: SessionSnapshot) => void, setPendingActionKey: (key: string) => void) {
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [cleanupReportStatus, setCleanupReportStatus] = useState("");
  const [memoryEntryStatus, setMemoryEntryStatus] = useState("");
  const [memoryEntryExportPath, setMemoryEntryExportPath] = useState("");
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>([]);
  const [errorEvents, setErrorEvents] = useState<ErrorEvent[]>([]);
  const memoryBusy = useRef(false);
  const loadCleanupReport = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setCleanupReportStatus("loading");
    try { setCleanupReport(await api.cleanup()); setCleanupReportStatus("ready"); }
    catch (error) { if (!isHostCancellation(error)) setCleanupReportStatus("failed"); }
  }, [api]);
  const loadAiLogs = useCallback(async () => {
    try { setAiLogs(await api.aiLogs()); } catch { /* Retain prior diagnostics. */ }
  }, [api]);
  const loadErrorEvents = useCallback(async () => {
    try { setErrorEvents(await api.errors()); } catch { /* Retain prior diagnostics. */ }
  }, [api]);
  async function createMemoryEntry() {
    if (memoryBusy.current) return;
    memoryBusy.current = true;
    setPendingActionKey("memory-entry-create"); setMemoryEntryStatus("creating");
    try {
      const data = await api.memory();
      setSnapshot(data.sessionSnapshot); setMemoryEntryExportPath(data.exportPath); setMemoryEntryStatus(`ready:${data.entry.id}`);
    } catch (error) { if (!isHostCancellation(error)) setMemoryEntryStatus("failed"); }
    finally { memoryBusy.current = false; setPendingActionKey(""); }
  }
  return { cleanupReport, cleanupReportStatus, loadCleanupReport, aiLogs, errorEvents, loadAiLogs,
    loadErrorEvents, memoryEntryStatus, memoryEntryExportPath, createMemoryEntry };
}
