import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { apiFetch } from "../../../session-client";
import type { RollRecord } from "../../../../packages/contracts/dist/index.js";
import { createHostRequests, isHostCancellation } from "./host-requests";
import { useHostReports } from "./useHostReports";
import { useHostConnection } from "./useHostConnection";
import type { RuntimeStatus, SessionSnapshot } from "./types";

export function useHostSession() {
  const [runtime, storeRuntime] = useState<RuntimeStatus | null>(null);
  const [snapshot, storeSnapshot] = useState<SessionSnapshot | null>(null);
  const [pendingActionKey, setPendingActionKey] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");
  const [diceAnimation, setDiceAnimation] = useState<RollRecord | null>(null);
  const snapshotEpoch = useRef(0), runtimeEpoch = useRef(0);
  const setSnapshot = useCallback((next: SetStateAction<SessionSnapshot | null>) => {
    snapshotEpoch.current += 1; storeSnapshot(next);
  }, []);
  const setRuntime = useCallback((next: SetStateAction<RuntimeStatus | null>) => {
    runtimeEpoch.current += 1; storeRuntime(next);
  }, []);
  const [api] = useState(() => createHostRequests(apiFetch));
  const reports = useHostReports(api, setSnapshot, setPendingActionKey);
  const { loadCleanupReport, loadAiLogs, loadErrorEvents } = reports;
  useEffect(() => {
    api.activate();
    const snapshotStart = snapshotEpoch.current, runtimeStart = runtimeEpoch.current;
    const failed = (error: unknown) => {
      if (!isHostCancellation(error)) setBootstrapError("Some host data could not load. Check the server and reload to retry.");
    };
    // A slower initial REST read must not overwrite newer socket or command data.
    void api.snapshot().then(value => { if (snapshotEpoch.current === snapshotStart) storeSnapshot(value); }).catch(failed);
    void api.runtime().then(value => { if (runtimeEpoch.current === runtimeStart) storeRuntime(value); }).catch(failed);
    void loadCleanupReport({ silent: true }); void loadAiLogs(); void loadErrorEvents();
    return () => api.dispose();
  }, [api, loadCleanupReport, loadAiLogs, loadErrorEvents]);
  const { connectionLabel, connectionError } = useHostConnection({
    runtime: setRuntime, snapshot: setSnapshot,
    changed: () => { void loadAiLogs(); void loadErrorEvents(); },
    roll: roll => {
      setSnapshot(current => current ? { ...current, rollLog: [roll, ...current.rollLog.filter(item => item.id !== roll.id)].slice(0, 12) } : current);
      setDiceAnimation(roll);
    }
  });
  return { runtime, snapshot, setSnapshot, setRuntime, pendingActionKey, setPendingActionKey, reports,
    api, connectionLabel, connectionError, bootstrapError, diceAnimation, setDiceAnimation };
}
