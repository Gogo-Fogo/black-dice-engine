import { isMediaJobResponse, isAssetResponse, isRuntimeStatus, isObject } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";
import type { RuntimeStatus, SessionSnapshot } from "./types";

export type MediaJobDependencies = {
  request: typeof fetch;
  setSnapshot: (snapshot: SessionSnapshot) => void;
  setRuntime: (runtime: RuntimeStatus) => void;
  setPendingActionKey: (key: string) => void;
  setMediaQueueStatus: (status: string) => void;
  loadCleanupReport: (options?: { silent?: boolean }) => Promise<void>;
};

export function createMediaJobActions({ request: apiFetch, setSnapshot, setRuntime,
  setPendingActionKey, setMediaQueueStatus, loadCleanupReport }: MediaJobDependencies) {
  async function queueCharacterVisualCanonJob(characterId: string) {
    setPendingActionKey(`visual-canon-${characterId}`);
    setMediaQueueStatus("queueing-visual-canon");
    try {
      const response = await apiFetch(`/api/characters/${characterId}/visual-canon-job`, {
        method: "POST"
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isMediaJobResponse);
      setSnapshot(json.sessionSnapshot);
      setMediaQueueStatus(`visual-canon:${json.job.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function markMediaJobGenerated(jobId: string) {
    setPendingActionKey(`media-generated-${jobId}`);
    setMediaQueueStatus("recording");
    try {
      const response = await apiFetch(`/api/media-jobs/${jobId}/mark-generated`, {
        method: "POST"
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isAssetResponse);
      setSnapshot(json.sessionSnapshot);
      setMediaQueueStatus(`generated:${json.asset.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function startMediaJob(jobId: string) {
    setPendingActionKey(`media-start-${jobId}`);
    setMediaQueueStatus("starting");
    try {
      const response = await apiFetch(`/api/media-jobs/${jobId}/start`, {
        method: "POST"
      });

      if (!response.ok) {
        try {
          const json: unknown = await response.json();
          if (isObject(json)) {
            if (isRuntimeStatus(json.runtimeStatus)) setRuntime(json.runtimeStatus);
            if (isObject(json.pressure) && typeof json.pressure.summary === "string") {
              setMediaQueueStatus(`blocked:${json.pressure.summary}`);
              return;
            }
            if (typeof json.error === "string") {
              setMediaQueueStatus(`blocked:${json.error}`);
              return;
            }
          }
        } catch {
          // fall through to generic failure below
        }
        setMediaQueueStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isMediaJobResponse);
      setSnapshot(json.sessionSnapshot);
      if (json.runtimeStatus) {
        setRuntime(json.runtimeStatus);
      }
      setMediaQueueStatus(`started:${json.job.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function failMediaJob(jobId: string) {
    setPendingActionKey(`media-failed-${jobId}`);
    setMediaQueueStatus("failing");
    try {
      const response = await apiFetch(`/api/media-jobs/${jobId}/fail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          error: "Marked failed from GM dashboard."
        })
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isMediaJobResponse);
      setSnapshot(json.sessionSnapshot);
      setMediaQueueStatus(`failed-job:${json.job.id}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

  async function approveAsset(assetId: string, share=false) {
    setPendingActionKey(`asset-approve-${assetId}`);
    setMediaQueueStatus("approving");
    try {
      const response = await apiFetch(`/api/assets/${encodeURIComponent(assetId)}/approve`, { method: "POST", ...(share?{headers:{'Content-Type':'application/json'},body:JSON.stringify({share:true})}:{}) });
      const value = await readHostResponse(response, isAssetResponse);
      setSnapshot(value.sessionSnapshot); setMediaQueueStatus(`approved:${value.asset.id}`);
    } catch { setMediaQueueStatus("failed"); }
    finally { setPendingActionKey(""); }
  }

  return { approveAsset, queueCharacterVisualCanonJob, markMediaJobGenerated, startMediaJob, failMediaJob };
}
