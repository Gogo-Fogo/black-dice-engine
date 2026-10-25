import { isDirectorDraftResponse, isNarrationToggle, type ActionProposal } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";
import { createAiActions } from "./ai-actions";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../../../session-client";
import type { ScenePacket, DirectorModeAdapterDraft } from "./types";

export function useAiDirector({ scenePacket, setDirectorDraft, setPendingActionKey }: { scenePacket: ScenePacket | null; setDirectorDraft(value: DirectorModeAdapterDraft): void; setPendingActionKey(value: string): void }) {
const [aiNarrationEnabled, setAiNarrationEnabled] = useState(false);
const [narrationKnown, setNarrationKnown] = useState(false);
const [narrationToggleStatus, setNarrationToggleStatus] = useState("loading");
const toggleEpoch = useRef(0), toggleBusy = useRef(false), applyBusy = useRef(false);
const [aiActions] = useState(() => createAiActions(apiFetch));

const [aiProposedAction, setAiProposedAction] = useState<ActionProposal | null>(null);

const [aiProposeStatus, setAiProposeStatus] = useState("");

const [aiDirectorGuidance, setAiDirectorGuidance] = useState("");

const [aiDirectorStatus, setAiDirectorStatus] = useState("");

async function runAiProposeAction() {
    setPendingActionKey("ai-propose-action");
    setAiProposeStatus("running");
    try {
      const json = await aiActions.propose();
      setAiProposedAction(json.proposal);
      setAiProposeStatus("ready");
    } catch {
      setAiProposeStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

async function runAiDirectorGuidance() {
    setPendingActionKey("ai-director-guidance");
    setAiDirectorStatus("running");
    try {
      const response = await apiFetch("/api/director-mode/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenePacket ? { packet: scenePacket } : {})
      });
      if (!response.ok) {
        setAiDirectorStatus("failed");
        return;
      }
      const json = await readHostResponse(response, isDirectorDraftResponse);
      setAiDirectorGuidance(json.draft?.response?.directorGuidance || "");
      setDirectorDraft(json.draft);
      setAiDirectorStatus("ready");
    } catch {
      setAiDirectorStatus("failed");
    } finally {
      setPendingActionKey("");
    }
  }

useEffect(() => {
    let active = true;
    const epoch = toggleEpoch.current;
    async function loadAiNarrationToggle() {
      try {
        const res = await apiFetch("/api/ai/narration-toggle");
        if (!res.ok) throw new Error("Narration setting unavailable");
        const json = await readHostResponse(res, isNarrationToggle);
        if (active && toggleEpoch.current === epoch) {
          setAiNarrationEnabled(json.enabled); setNarrationKnown(true); setNarrationToggleStatus("ready");
        }
      } catch {
        if (active && toggleEpoch.current === epoch) setNarrationToggleStatus("failed");
      }
    }
    void loadAiNarrationToggle();
    return () => { active = false; };
  }, []);
async function toggleNarration(enabled: boolean) {
  if (toggleBusy.current) return;
  toggleBusy.current = true; toggleEpoch.current += 1; setNarrationToggleStatus("saving");
  try {
    const confirmed = await aiActions.toggle(enabled);
    setAiNarrationEnabled(confirmed); setNarrationKnown(true); setNarrationToggleStatus("ready");
  } catch { setNarrationToggleStatus("failed"); }
  finally { toggleBusy.current = false; }
}
async function applyProposedAction() {
  if (!aiProposedAction || applyBusy.current) return;
  applyBusy.current = true; setAiProposeStatus("applying"); setPendingActionKey("ai-apply-action");
  try { await aiActions.apply(aiProposedAction); setAiProposeStatus("applied"); }
  catch { setAiProposeStatus("apply-failed"); }
  finally { applyBusy.current = false; setPendingActionKey(""); }
}
return { narrationKnown, narrationToggleStatus, applyProposedAction, toggleNarration, aiNarrationEnabled, setAiNarrationEnabled, aiProposedAction, setAiProposedAction, aiProposeStatus, setAiProposeStatus, aiDirectorGuidance, setAiDirectorGuidance, aiDirectorStatus, setAiDirectorStatus, runAiProposeAction, runAiDirectorGuidance };
}
