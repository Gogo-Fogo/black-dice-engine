import React from "react";
import type { useSceneDrafts } from "./useSceneDrafts";
import type { useAiDirector } from "./useAiDirector";

export function SceneDraftPanel({ controller, pendingActionKey, mediaQueueStatus }: { controller: ReturnType<typeof useSceneDrafts>; pendingActionKey: string; mediaQueueStatus: string }) {
const { scenePacket, scenePacketStatus, scenePacketValidation, localModelDraft, localModelStatus, directorDraft, directorStatus, loadScenePacket, queueScenePacketProposals, queueScenePacketMediaJobs, queueScenePacketAudioCues, runLocalModelDraft, runDirectorModeDraft } = controller;
return (<article className="panel">
          <div className="panel-header">
            <h2>Scene Packet Draft</h2>
            <span>{scenePacket ? scenePacket.visibility : "not generated"}</span>
          </div>
          <p className="muted-line">
            This is the working scene bundle for AI and media tools. Start here, then branch into approval,
            narration, director planning, or queued media.
          </p>
          <button className="export-button" onClick={() => void loadScenePacket()} type="button">
            Generate Scene Packet
          </button>
          {scenePacketStatus ? (
            <p className="export-note">
              {scenePacketStatus === "loading"
                ? "Building scene packet..."
                : scenePacketStatus === "ready"
                  ? "Scene packet refreshed."
                  : scenePacketStatus.startsWith("queued:")
                    ? `${scenePacketStatus.split(":")[1]} proposal(s) added to the approval queue.`
                  : "Scene packet failed to load."}
            </p>
          ) : null}
          {scenePacket ? (
            <div className="scene-packet-block">
              <strong>{scenePacket.sceneTitle}</strong>
              <p>{scenePacket.summary}</p>
              <p className="helper-note">
                Suggested order: 1) Generate the packet. 2) Queue risky state or media work you want to keep. 3)
                Run Local Model Draft for moment-to-moment narration. 4) Run Director Mode Draft for pacing,
                reveals, and canon notes. 5) Create a memory entry when the scene settles.
              </p>
              <div className="packet-meta-grid">
                <div>
                  <span>Beats</span>
                  <strong>{scenePacket.beats.length}</strong>
                </div>
                <div>
                  <span>Proposed State</span>
                  <strong>{scenePacket.proposedStateEvents.length}</strong>
                </div>
                <div>
                  <span>Media</span>
                  <strong>{scenePacket.mediaRequests.length}</strong>
                </div>
                <div>
                  <span>Audio</span>
                  <strong>{scenePacket.audioCues.length}</strong>
                </div>
                <div>
                  <span>Validation</span>
                  <strong>{scenePacketValidation?.ok ? "Valid" : "Needs fixes"}</strong>
                </div>
              </div>
              {scenePacketValidation && !scenePacketValidation.ok ? (
                <div className="validation-list">
                  {scenePacketValidation.errors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              ) : null}
              <div className="packet-beat-list">
                {scenePacket.beats.map((beat, index) => (
                  <div className="packet-beat" key={`${scenePacket.id}-${index}`}>
                    <span className="event-pill event-state">{beat.kind}</span>
                    <p>{beat.text}</p>
                  </div>
                ))}
              </div>
              {scenePacket.proposedStateEvents.length ? (
                <div className="packet-beat-list">
                  {scenePacket.proposedStateEvents.map((event) => (
                    <div className="packet-beat" key={event.id}>
                      <span className="event-pill event-claim">{event.type}</span>
                      <p>{event.actor.label} proposed a GM-reviewed state change.</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                className="export-button"
                disabled={
                  pendingActionKey !== "" ||
                  !scenePacket.proposedStateEvents.length ||
                  scenePacketValidation?.ok === false
                }
                onClick={() => void queueScenePacketProposals()}
                type="button"
              >
                Queue Proposed State Events
              </button>
              <button
                className="export-button secondary-action"
                disabled={
                  pendingActionKey !== "" ||
                  !scenePacket.mediaRequests.length ||
                  scenePacketValidation?.ok === false
                }
                onClick={() => void queueScenePacketMediaJobs()}
                type="button"
              >
                Queue Media Jobs
              </button>
              <button
                className="export-button secondary-action"
                disabled={
                  pendingActionKey !== "" ||
                  !scenePacket.audioCues.length ||
                  scenePacketValidation?.ok === false
                }
                onClick={() => void queueScenePacketAudioCues()}
                type="button"
              >
                Queue Audio Cues
              </button>
              {scenePacket.audioCues.length ? (
                <div className="packet-beat-list">
                  {scenePacket.audioCues.map((cue, index) => (
                    <div className="packet-beat" key={`${scenePacket.id}-audio-${index}`}>
                      <span className="event-pill event-memory">{String(cue.kind ?? "audio")}</span>
                      <p>
                        {String(cue.notes ?? "Suggested audio cue")}
                        {Array.isArray(cue.tags) && cue.tags.length ? (
                          <span className="tag-row" style={{ marginLeft: 8 }}>
                            {cue.tags.map((tag: string) => (
                              <span className="tag-chip" key={tag}>{tag}</span>
                            ))}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              {mediaQueueStatus === "queueing" ||
              mediaQueueStatus.startsWith("queued:") ||
              mediaQueueStatus === "queueing-visual-canon" ||
              mediaQueueStatus.startsWith("visual-canon:") ||
              mediaQueueStatus === "queueing-audio" ||
              mediaQueueStatus.startsWith("queued-audio:") ||
              mediaQueueStatus === "failed" ? (
                <p className="export-note">
                  {mediaQueueStatus === "queueing"
                    ? "Queueing media jobs..."
                    : mediaQueueStatus.startsWith("queued:")
                      ? `${mediaQueueStatus.split(":")[1]} media job(s) added to the queue.`
                      : mediaQueueStatus === "queueing-visual-canon"
                        ? "Queueing character visual-canon job..."
                        : mediaQueueStatus.startsWith("visual-canon:")
                          ? `Character visual-canon job ${mediaQueueStatus.split(":")[1]} added to the queue.`
                          : mediaQueueStatus === "queueing-audio"
                            ? "Queueing audio cues..."
                            : mediaQueueStatus.startsWith("queued-audio:")
                              ? `${mediaQueueStatus.split(":")[1]} audio cue(s) added to the queue.`
                      : "Media jobs failed to queue."}
                </p>
              ) : null}
            </div>
          ) : (
            <p>No scene packet generated yet.</p>
          )}
        </article>);
}

export function LocalModelPanel({ controller, pendingActionKey }: { controller: ReturnType<typeof useSceneDrafts>; pendingActionKey: string;  }) {
const { scenePacket, scenePacketStatus, scenePacketValidation, localModelDraft, localModelStatus, directorDraft, directorStatus, loadScenePacket, queueScenePacketProposals, queueScenePacketMediaJobs, queueScenePacketAudioCues, runLocalModelDraft, runDirectorModeDraft } = controller;
return (<article className="panel">
          <div className="panel-header">
            <h2>Local Model Adapter</h2>
            <span>{localModelDraft?.adapter.mode ?? "placeholder"}</span>
          </div>
          <p className="muted-line">
            This is the fast narrator lane. Use it to preview moment-to-moment scene narration built from the
            current packet.
          </p>
          <button
            className="export-button"
            disabled={pendingActionKey !== ""}
            onClick={() => void runLocalModelDraft()}
            type="button"
          >
            Run Local Model Draft
          </button>
          {localModelStatus ? (
            <p className="export-note">
              {localModelStatus === "running"
                ? "Preparing local-model draft..."
                : localModelStatus === "ready"
                  ? localModelDraft?.adapter.endpointConfigured
                    ? `Placeholder contract built for ${localModelDraft.adapter.endpoint}`
                    : "Placeholder contract built with no local endpoint configured yet."
                  : "Local-model draft failed."}
            </p>
          ) : null}
          {localModelDraft ? (
            <div className="context-block">
              <div className="packet-meta-grid">
                <div>
                  <span>Scene Packet</span>
                  <strong>{localModelDraft.request.sceneTitle}</strong>
                </div>
                <div>
                  <span>State / Media / Audio</span>
                  <strong>
                    {localModelDraft.request.proposedStateEventCount} / {localModelDraft.request.mediaRequestCount} /{" "}
                    {localModelDraft.request.audioCueCount}
                  </strong>
                </div>
              </div>
              <div className="context-row">
                <strong>Prompt Preview</strong>
                <p>{localModelDraft.request.promptPreview}</p>
              </div>
              <div className="context-row">
                <strong>Context Summary</strong>
                <p>{localModelDraft.request.contextSummary}</p>
              </div>
              <div className="context-row">
                <strong>Draft Narration</strong>
                <p>{localModelDraft.response.narration}</p>
              </div>
              <div className="context-row">
                <strong>Suggested Next Beat</strong>
                <p>{localModelDraft.response.suggestedNextBeat}</p>
              </div>
              <div className="context-list">
                {localModelDraft.response.gmNotes.map((note) => (
                  <div className="context-row" key={note}>
                    <strong>GM Note</strong>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              {localModelDraft.response.riskyStateChangeWarning ? (
                <div className="validation-list">
                  <p>{localModelDraft.response.riskyStateChangeWarning}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p>No local-model draft run yet.</p>
          )}
        </article>);
}

export function DirectorDraftPanel({ controller, pendingActionKey }: { controller: ReturnType<typeof useSceneDrafts>; pendingActionKey: string;  }) {
const { scenePacket, scenePacketStatus, scenePacketValidation, localModelDraft, localModelStatus, directorDraft, directorStatus, loadScenePacket, queueScenePacketProposals, queueScenePacketMediaJobs, queueScenePacketAudioCues, runLocalModelDraft, runDirectorModeDraft } = controller;
return (<article className="panel">
          <div className="panel-header">
            <h2>Director Mode Adapter</h2>
            <span>{directorDraft?.adapter.mode ?? "placeholder"}</span>
          </div>
          <p className="muted-line">
            This is the higher-level planning lane. Use it for pacing, reveal order, canon notes, and scene
            escalation rather than line-by-line narration.
          </p>
          <button
            className="export-button"
            disabled={pendingActionKey !== ""}
            onClick={() => void runDirectorModeDraft()}
            type="button"
          >
            Run Director Mode Draft
          </button>
          {directorStatus ? (
            <p className="export-note">
              {directorStatus === "running"
                ? "Preparing director-mode draft..."
                : directorStatus === "ready"
                  ? directorDraft?.adapter.enabled
                    ? `Placeholder director contract built for ${directorDraft.adapter.model}`
                    : "Placeholder director contract built with no director model configured yet."
                  : "Director-mode draft failed."}
            </p>
          ) : null}
          {directorDraft ? (
            <div className="context-block">
              <div className="packet-meta-grid">
                <div>
                  <span>Scene Packet</span>
                  <strong>{directorDraft.request.sceneTitle}</strong>
                </div>
                <div>
                  <span>Memory / Approvals</span>
                  <strong>
                    {directorDraft.request.memoryEntryCount} / {directorDraft.request.pendingApprovalCount}
                  </strong>
                </div>
              </div>
              <div className="context-row">
                <strong>Prompt Preview</strong>
                <p>{directorDraft.request.promptPreview}</p>
              </div>
              <div className="context-row">
                <strong>Context Summary</strong>
                <p>{directorDraft.request.contextSummary}</p>
              </div>
              <div className="context-row">
                <strong>Director Guidance</strong>
                <p>{directorDraft.response.directorGuidance}</p>
              </div>
              <div className="context-list">
                {directorDraft.response.revealPlan.map((step) => (
                  <div className="context-row" key={step}>
                    <strong>Reveal Plan</strong>
                    <p>{step}</p>
                  </div>
                ))}
              </div>
              <div className="context-list">
                {directorDraft.response.canonizationNotes.map((note) => (
                  <div className="context-row" key={note}>
                    <strong>Canonization Note</strong>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
              {directorDraft.response.escalationWarning ? (
                <div className="validation-list">
                  <p>{directorDraft.response.escalationWarning}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p>No director-mode draft run yet.</p>
          )}
        </article>);
}

export function AiDirectorPanel({ controller, pendingActionKey }: { controller: ReturnType<typeof useAiDirector>; pendingActionKey: string;  }) {
const { narrationKnown, narrationToggleStatus, aiNarrationEnabled, aiProposedAction, aiProposeStatus, aiDirectorGuidance, aiDirectorStatus, runAiProposeAction, runAiDirectorGuidance, toggleNarration, applyProposedAction } = controller;
return (<article className="panel">
          <div className="panel-header">
            <h2>AI Director</h2>
            <span className="pill pill-ok">{narrationKnown ? (aiNarrationEnabled ? "ON" : "OFF") : "UNKNOWN"}</span>
          </div>
          <p className="muted-line">
            Use the AI to propose actions, get director guidance, and enable richer auto-narration.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "#bca06d", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={aiNarrationEnabled}
                disabled={narrationToggleStatus === "loading" || narrationToggleStatus === "saving"}
                onChange={event => void toggleNarration(event.target.checked)}
              />
              AI Narration on rolls
            </label>
            <span style={{ fontSize: "0.7rem", color: "#8a7a5a" }}>
              {narrationKnown ? (aiNarrationEnabled ? "AI narration enabled" : "Prepared narration enabled") : "Narration setting has not been confirmed"}
            </span>
          </div>

          {narrationToggleStatus === "failed" ? <p role="status">Narration setting could not be confirmed. Retry the switch; the last confirmed setting is shown.</p> : null}
          {narrationToggleStatus === "saving" ? <p role="status">Saving narration setting...</p> : null}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
            <button
              className="export-button"
              style={{ background: "linear-gradient(135deg, #5a4a8a 0%, #3a2a6a 100%)" }}
              disabled={pendingActionKey !== ""}
              onClick={() => void runAiProposeAction()}
              type="button"
            >
              {pendingActionKey === "ai-propose-action" ? "⏳ Thinking..." : "🎲 AI Propose Action"}
            </button>
            <button
              className="export-button"
              style={{ background: "linear-gradient(135deg, #4a6a8a 0%, #2a4a6a 100%)" }}
              disabled={pendingActionKey !== ""}
              onClick={() => void runAiDirectorGuidance()}
              type="button"
            >
              {pendingActionKey === "ai-director-guidance" ? "⏳ Thinking..." : "🎬 AI Director Guidance"}
            </button>
          </div>

          {aiProposeStatus === "running" ? (
            <p className="export-note">Asking the AI what the party should do next...</p>
          ) : aiProposeStatus === "failed" ? (
            <p className="export-note" style={{ color: "#c66" }}>AI proposal unavailable or invalid. Check the configured provider and try again.</p>
          ) : null}

          {aiProposedAction && ["ready", "applying", "applied", "apply-failed"].includes(aiProposeStatus) ? (
            <div className="context-block" style={{ borderLeft: "3px solid #7a5aaa", paddingLeft: "12px" }}>
              <div className="packet-meta-grid">
                <div>
                  <span>Action</span>
                  <strong>{String(aiProposedAction.action ?? "—")}</strong>
                </div>
                <div>
                  <span>Skill</span>
                  <strong>{String(aiProposedAction.skill ?? "—")}</strong>
                </div>
                <div>
                  <span>Difficulty</span>
                  <strong>{String(aiProposedAction.difficulty ?? "—")}</strong>
                </div>
              </div>
              <div className="context-row">
                <strong>Description</strong>
                <p>{String(aiProposedAction.description ?? "")}</p>
              </div>
              <div className="context-row">
                <strong>Consequences</strong>
                <p>{String(aiProposedAction.consequences ?? "")}</p>
              </div>
              <button
                className="mini-button"
                style={{ marginTop: "8px" }}
                disabled={pendingActionKey !== "" || aiProposeStatus === "applying"}
                onClick={() => void applyProposedAction()}
                type="button"
              >
                {aiProposeStatus === "applying" ? "Applying..." : "Use This Action"}
              </button>
              {aiProposeStatus === "applied" ? <p role="status">Action confirmed by the table.</p> : null}
              {aiProposeStatus === "apply-failed" ? <p role="status">Action was not confirmed. Your proposal is retained for retry.</p> : null}
            </div>
          ) : null}

          {aiDirectorStatus === "running" ? (
            <p className="export-note">Consulting the AI director for scene guidance...</p>
          ) : aiDirectorStatus === "failed" ? (
            <p className="export-note" style={{ color: "#c66" }}>Director guidance failed. Is Ollama running?</p>
          ) : null}

          {aiDirectorGuidance && aiDirectorStatus === "ready" ? (
            <div className="context-block" style={{ borderLeft: "3px solid #4a7aaa", paddingLeft: "12px" }}>
              <div className="context-row">
                <strong>Director Guidance</strong>
                <p style={{ whiteSpace: "pre-wrap" }}>{aiDirectorGuidance}</p>
              </div>
            </div>
          ) : null}
        </article>);
}
