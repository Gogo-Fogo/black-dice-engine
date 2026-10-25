import { isScenePacketResponse, isSceneQueueResponse, isLocalDraftResponse, isDirectorDraftResponse } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";
import { useState } from "react";
import { apiFetch } from "../../../session-client";
import type { ScenePacket, ScenePacketValidation, SessionSnapshot, LocalModelAdapterDraft, DirectorModeAdapterDraft } from "./types";

export function useSceneDrafts({ setSnapshot, setPendingActionKey, setMediaQueueStatus, loadCleanupReport }: { setSnapshot(value: SessionSnapshot): void; setPendingActionKey(value: string): void; setMediaQueueStatus(value: string): void; loadCleanupReport(options?: {silent?: boolean}): Promise<void> }) {
const [scenePacket, setScenePacket] = useState<ScenePacket | null>(null);

const [scenePacketStatus, setScenePacketStatus] = useState("");

const [scenePacketValidation, setScenePacketValidation] = useState<ScenePacketValidation | null>(null);

const [localModelDraft, setLocalModelDraft] = useState<LocalModelAdapterDraft | null>(null);

const [localModelStatus, setLocalModelStatus] = useState("");

const [directorDraft, setDirectorDraft] = useState<DirectorModeAdapterDraft | null>(null);

const [directorStatus, setDirectorStatus] = useState("");

async function loadScenePacket() {
    setScenePacketStatus("loading");

    try {
      const response = await apiFetch("/api/scene-packet");

      if (!response.ok) {
        setScenePacketStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isScenePacketResponse);
      setScenePacket(json.packet);
      setScenePacketValidation(json.validation);
      setScenePacketStatus("ready");
    } catch {
      setScenePacketStatus("failed");
    }
  }

async function queueScenePacketProposals() {
    if (!scenePacket) {
      return;
    }

    setPendingActionKey("scene-packet-queue");
    try {
      const response = await apiFetch("/api/scene-packet/queue-proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket)
      });

      if (!response.ok) {
        setScenePacketStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isSceneQueueResponse);
      setSnapshot(json.sessionSnapshot);
      setScenePacketValidation(json.validation);
      setScenePacketStatus(`queued:${json.queuedCount}`);
    } catch {
      setScenePacketStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

async function queueScenePacketMediaJobs() {
    if (!scenePacket) {
      return;
    }

    setPendingActionKey("scene-packet-media");
    setMediaQueueStatus("queueing");
    try {
      const response = await apiFetch("/api/scene-packet/queue-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket)
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isSceneQueueResponse);
      setSnapshot(json.sessionSnapshot);
      setScenePacketValidation(json.validation);
      setMediaQueueStatus(`queued:${json.queuedCount}`);
      await loadCleanupReport({ silent: true });
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

async function queueScenePacketAudioCues() {
    if (!scenePacket) {
      return;
    }

    setPendingActionKey("scene-packet-audio");
    setMediaQueueStatus("queueing-audio");
    try {
      const response = await apiFetch("/api/scene-packet/queue-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket)
      });

      if (!response.ok) {
        setMediaQueueStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isSceneQueueResponse);
      setSnapshot(json.sessionSnapshot);
      setScenePacketValidation(json.validation);
      setMediaQueueStatus(`queued-audio:${json.queuedCount}`);
    } catch {
      setMediaQueueStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

async function runLocalModelDraft() {
    setPendingActionKey("local-model-draft");
    setLocalModelStatus("running");

    try {
      const response = await apiFetch("/api/local-model/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket ? { packet: scenePacket } : {})
      });

      if (!response.ok) {
        setLocalModelStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isLocalDraftResponse);
      setLocalModelDraft(json.draft);
      setScenePacketValidation(json.validation);
      setLocalModelStatus("ready");
    } catch {
      setLocalModelStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

async function runDirectorModeDraft() {
    setPendingActionKey("director-mode-draft");
    setDirectorStatus("running");

    try {
      const response = await apiFetch("/api/director-mode/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(scenePacket ? { packet: scenePacket } : {})
      });

      if (!response.ok) {
        setDirectorStatus("failed");
        return;
      }

      const json = await readHostResponse(response, isDirectorDraftResponse);
      setDirectorDraft(json.draft);
      setScenePacketValidation(json.validation);
      setDirectorStatus("ready");
    } catch {
      setDirectorStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }
return { scenePacket, setScenePacket, scenePacketStatus, setScenePacketStatus, scenePacketValidation, setScenePacketValidation, localModelDraft, setLocalModelDraft, localModelStatus, setLocalModelStatus, directorDraft, setDirectorDraft, directorStatus, setDirectorStatus, loadScenePacket, queueScenePacketProposals, queueScenePacketMediaJobs, queueScenePacketAudioCues, runLocalModelDraft, runDirectorModeDraft };
}
