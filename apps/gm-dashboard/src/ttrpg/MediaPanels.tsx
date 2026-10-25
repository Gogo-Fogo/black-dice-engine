import React from "react";
import {AssetImage} from './AssetImage';
import {apiFetch} from '../../../session-client';
import type { SessionSnapshot } from "./types";
import type { useMediaJobs } from "./useMediaJobs";
import { formatTime, formatVisibilityLabel, formatMediaJobType, formatMediaJobStatus, formatAssetKind } from "./format";

export function MediaJobQueuePanel({ snapshot, pendingActionKey, media }: { snapshot: SessionSnapshot | null; pendingActionKey: string; media: ReturnType<typeof useMediaJobs> }) {
  const { mediaQueueStatus, startMediaJob, failMediaJob, markMediaJobGenerated } = media;
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>Media Job Queue</h2>
            <span>{snapshot?.mediaJobs.length ?? 0} tracked</span>
          </div>
          <p className="muted-line">
            Jobs auto-submit to ComfyUI when the router is configured. If ComfyUI is offline or the router is
            unconfigured, Start/Fail/Record remain manual overrides.
          </p>
          <div className="memory-entry-list">
            {snapshot?.mediaJobs.length ? (
              snapshot.mediaJobs.map((job) => (
                <div className="memory-entry-card" key={job.id}>
                  <div className="memory-entry-header">
                    <strong>{formatMediaJobType(job.type)}</strong>
                    <span className="event-pill event-memory">{formatMediaJobStatus(job.status)}</span>
                  </div>
                  <p>{job.prompt ?? "No prompt attached."}</p>
                  <div className="memory-entry-meta">
                    <span>{formatVisibilityLabel(job.visibility)}</span>
                    <span>{job.priority}</span>
                    <span>{job.runWhen}</span>
                    <span>{formatTime(job.createdAt)}</span>
                  </div>
                  <div className="memory-entry-meta">
                    <span>{job.startedAt ? `started ${formatTime(job.startedAt)}` : "not started"}</span>
                    <span>{job.completedAt ? `completed ${formatTime(job.completedAt)}` : "not completed"}</span>
                  </div>
                  <div className="tag-row">
                    {job.workflowId ? <span className="tag-chip">workflow: {job.workflowId}</span> : null}
                    {job.sceneId ? <span className="tag-chip">scene: {job.sceneId}</span> : null}
                    {job.comfyPromptId ? (
                      <span className="tag-chip">comfy: {job.comfyPromptId.slice(0, 8)}…</span>
                    ) : null}
                    {job.settings?.subjectName ? (
                      <span className="tag-chip">subject: {String(job.settings.subjectName)}</span>
                    ) : null}
                    {Array.isArray(job.settings?.variantSet)
                      ? job.settings.variantSet.map((variant) => (
                          <span className="tag-chip" key={`${job.id}-${String(variant)}`}>
                            view: {String(variant).replace(/_/g, " ")}
                          </span>
                        ))
                      : null}
                  </div>
                  {job.error ? <p className="export-note">Last error: {job.error}</p> : null}
                  {Boolean(job.settings.routerSubmissionAttemptedAt) && job.status !== "running" && job.status !== "generated" ? (
                    <p className="muted-line">Submission was attempted. Check ComfyUI before queueing a new job to avoid generating twice.</p>
                  ) : null}
                  <div className="approval-actions">
                    <button
                      className="mini-button"
                      disabled={
                        pendingActionKey !== "" ||
                        Boolean(job.settings.routerSubmissionAttemptedAt) ||
                        job.status === "running" ||
                        job.status === "generated" ||
                        job.status === "archived" ||
                        job.status === "rejected"
                      }
                      onClick={() => void startMediaJob(job.id)}
                      type="button"
                    >
                      {job.settings.routerSubmissionAttemptedAt ? "Submission Attempted" : job.status === "failed" ? "Retry Job" : "Start Job"}
                    </button>
                    <button
                      className="mini-button"
                      disabled={
                        pendingActionKey !== "" ||
                        job.status === "failed" ||
                        job.status === "generated" ||
                        job.status === "archived" ||
                        job.status === "rejected"
                      }
                      onClick={() => void failMediaJob(job.id)}
                      type="button"
                    >
                      Mark Failed
                    </button>
                    <button
                      className="mini-button"
                      disabled={
                        pendingActionKey !== "" ||
                        job.status === "generated" ||
                        job.status === "failed" ||
                        job.status === "archived" ||
                        job.status === "rejected"
                      }
                      onClick={() => void markMediaJobGenerated(job.id)}
                      type="button"
                    >
                      {job.status === "generated" ? "Metadata Recorded" : "Record Generated Metadata"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>No queued media jobs yet.</p>
            )}
          </div>
          {mediaQueueStatus ? (
            <p className="export-note">
              {mediaQueueStatus === "starting"
                ? "Starting media job..."
                : mediaQueueStatus === "failing"
                  ? "Marking media job as failed..."
                  : mediaQueueStatus === "recording"
                    ? "Recording generated media metadata..."
                    : mediaQueueStatus.startsWith("blocked:")
                      ? mediaQueueStatus.slice("blocked:".length)
                    : mediaQueueStatus.startsWith("started:")
                      ? `Media job ${mediaQueueStatus.split(":")[1]} is now running.`
                      : mediaQueueStatus.startsWith("failed-job:")
                        ? `Media job ${mediaQueueStatus.split(":")[1]} was marked failed.`
                        : mediaQueueStatus.startsWith("generated:")
                          ? `Stored asset metadata as ${mediaQueueStatus.split(":")[1]}.`
                          : mediaQueueStatus.startsWith("queued:")
                            ? `${mediaQueueStatus.split(":")[1]} media job(s) added to the queue.`
                            : mediaQueueStatus === "queueing"
                              ? "Queueing media jobs..."
                              : mediaQueueStatus.startsWith("approved:") ? "Asset approved for its listed audience." : mediaQueueStatus === "approving" ? "Checking and approving asset..." : "Media metadata update failed."}
            </p>
          ) : null}
        </article>
  );
}

export function GeneratedMediaPanel({ snapshot, media, pendingActionKey = "" }: { snapshot: SessionSnapshot | null; media?: ReturnType<typeof useMediaJobs>; pendingActionKey?: string }) {
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>Generated Media Metadata</h2>
            <span>{snapshot?.assetRecords.length ?? 0} tracked</span>
          </div>
          <p className="muted-line">
            These records keep prompts, workflows, and intended local output paths in runtime state while the
            actual files stay outside Git. Think of this as the campaign's memory of what art exists, not the art
            files themselves.
          </p>
          <div className="memory-entry-list">
            {snapshot?.assetRecords.length ? (
              snapshot.assetRecords.map((asset) => (
                <div className="memory-entry-card" key={asset.id}>
                  <div className="memory-entry-header">
                    <strong>{formatAssetKind(asset.kind)}</strong>
                    <span className="event-pill event-memory">{asset.status}</span>
                  </div>
                  <p>{asset.prompt ?? "No prompt attached."}</p>
                  {asset.kind==='image'&&['generated','approved'].includes(asset.status)&&<AssetImage request={apiFetch} src={`/api/assets/${encodeURIComponent(asset.id)}/preview`} alt="Generated image for GM review" className="character-portrait"/>}
                  <div className="memory-entry-meta">
                    <span>{formatVisibilityLabel(asset.visibility)}</span>
                    <span>{asset.workflowId ?? "no workflow"}</span>
                    <span>{asset.localPath ?? "no local path"}</span>
                  </div>
                  <div className="tag-row">
                    {asset.sceneId ? <span className="tag-chip">scene: {asset.sceneId}</span> : null}
                    <span className="tag-chip">asset: {asset.id}</span>
                  </div>
                  {media && asset.status === "generated" ? <button type="button" className="mini-button" disabled={pendingActionKey !== ""}
                    onClick={() => void media.approveAsset(asset.id)}>Approve for {formatVisibilityLabel(asset.visibility)}</button> : null}
                  {media&&asset.kind==='image'&&['generated','approved'].includes(asset.status)&&asset.visibility==='gm_only'&&<button type="button" className="mini-button" disabled={pendingActionKey!==''} onClick={()=>void media.approveAsset(asset.id,true)}>Approve and share with players</button>}
                </div>
              ))
            ) : (
              <p>No generated media metadata recorded yet.</p>
            )}
          </div>
        </article>
  );
}
