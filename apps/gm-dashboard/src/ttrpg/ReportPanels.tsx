import React from "react";
import type { SessionSnapshot } from "./types";
import type { useHostReports } from "./useHostReports";
import { formatTime, formatVisibilityLabel, formatMemoryKind } from "./format";

export function CleanupPanel({ reports }: { reports: ReturnType<typeof useHostReports> }) {
  const { cleanupReport, cleanupReportStatus, loadCleanupReport } = reports;
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>Cleanup Policy</h2>
            <span>{cleanupReport ? formatTime(cleanupReport.generatedAt) : "not loaded"}</span>
          </div>
          <p className="muted-line">
            This is a report-only cleanup pass. It shows what should be archived or reviewed later while keeping
            final files outside Git and untouched for now.
          </p>
          <button className="export-button" onClick={() => void loadCleanupReport()} type="button">
            Refresh Cleanup Report
          </button>
          {cleanupReportStatus ? (
            <p className="export-note">
              {cleanupReportStatus === "loading"
                ? "Refreshing cleanup report..."
                : cleanupReportStatus === "ready"
                  ? "Cleanup report refreshed."
                  : "Cleanup report failed to load."}
            </p>
          ) : null}
          {cleanupReport ? (
            <div className="context-block">
              <div className="packet-meta-grid">
                <div>
                  <span>Tracked Jobs</span>
                  <strong>{cleanupReport.summary.trackedMediaJobs}</strong>
                </div>
                <div>
                  <span>Tracked Assets</span>
                  <strong>{cleanupReport.summary.trackedAssets}</strong>
                </div>
                <div>
                  <span>Archive Candidates</span>
                  <strong>{cleanupReport.summary.archiveCandidateCount}</strong>
                </div>
                <div>
                  <span>Review Candidates</span>
                  <strong>{cleanupReport.summary.reviewCandidateCount}</strong>
                </div>
                <div>
                  <span>Protected Finals</span>
                  <strong>{cleanupReport.summary.protectedFinalAssetCount}</strong>
                </div>
              </div>
              <div className="tag-row">
                <span className="tag-chip">media root: {cleanupReport.outputRoots.mediaOutputRoot}</span>
                <span className="tag-chip">repo exports: {cleanupReport.outputRoots.repoExportsRoot}</span>
              </div>
              <div className="validation-list">
                {cleanupReport.policy.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
              <div>
                <p className="detail-label">Archive Candidates</p>
                <div className="memory-entry-list">
                  {cleanupReport.archiveCandidates.length ? (
                    cleanupReport.archiveCandidates.map((candidate) => (
                      <div className="memory-entry-card" key={`archive-${candidate.kind}-${candidate.id}`}>
                        <div className="memory-entry-header">
                          <strong>{candidate.kind.replace("_", " ")}</strong>
                          <span className="event-pill event-memory">{candidate.status}</span>
                        </div>
                        <p>{candidate.reason}</p>
                        <div className="memory-entry-meta">
                          <span>{candidate.recommendedAction.replace("_", " ")}</span>
                          <span>{candidate.workflowId ?? "no workflow"}</span>
                          <span>{candidate.timestamp ? formatTime(candidate.timestamp) : "no timestamp"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No archive candidates yet.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="detail-label">Review / Protected Items</p>
                <div className="memory-entry-list">
                  {cleanupReport.reviewCandidates.length ? (
                    cleanupReport.reviewCandidates.map((candidate) => (
                      <div className="memory-entry-card" key={`review-${candidate.kind}-${candidate.id}`}>
                        <div className="memory-entry-header">
                          <strong>{candidate.kind.replace("_", " ")}</strong>
                          <span className="event-pill event-state">{candidate.recommendedAction.replace("_", " ")}</span>
                        </div>
                        <p>{candidate.reason}</p>
                        <div className="memory-entry-meta">
                          <span>{candidate.status}</span>
                          <span>{candidate.workflowId ?? "no workflow"}</span>
                          <span>{candidate.localPath ?? "no local path"}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No review candidates yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p>No cleanup report loaded yet.</p>
          )}
        </article>
  );
}

export function MemoryPanel({ reports, snapshot, pendingActionKey }: { reports: ReturnType<typeof useHostReports>; snapshot: SessionSnapshot | null; pendingActionKey: string }) {
  const { memoryEntryStatus, memoryEntryExportPath, createMemoryEntry } = reports;
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>Memory Entry Drafts</h2>
            <span>{snapshot?.memoryEntries.length ?? 0} saved</span>
          </div>
          <p className="muted-line">
            Use this after a scene settles. It turns the current table state and recent events into a reusable
            campaign-memory artifact.
          </p>
          <button
            className="export-button"
            disabled={pendingActionKey !== ""}
            onClick={() => void createMemoryEntry()}
            type="button"
          >
            Create Memory Entry
          </button>
          {memoryEntryStatus ? (
            <p className="export-note">
              {memoryEntryStatus === "creating"
                ? "Building memory entry..."
                : memoryEntryStatus.startsWith("ready:")
                  ? memoryEntryExportPath
                    ? `Memory entry saved to ${memoryEntryExportPath}`
                    : "Memory entry created."
                  : "Memory entry generation failed."}
            </p>
          ) : null}
          <div className="memory-entry-list">
            {snapshot?.memoryEntries.length ? (
              snapshot.memoryEntries.map((entry) => (
                <div className="memory-entry-card" key={entry.id}>
                  <div className="memory-entry-header">
                    <strong>{entry.source.label}</strong>
                    <span className="event-pill event-memory">{formatMemoryKind(entry.kind)}</span>
                  </div>
                  <p>{entry.summary}</p>
                  <div className="memory-entry-meta">
                    <span>{formatVisibilityLabel(entry.visibility)}</span>
                    <span>{entry.status}</span>
                    <span>{formatTime(entry.createdAt)}</span>
                  </div>
                  {entry.entities.length ? (
                    <div className="tag-row">
                      {entry.entities.slice(0, 6).map((entity) => (
                        <span className="tag-chip" key={`${entry.id}-${entity}`}>
                          {entity}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p>No memory entries generated yet.</p>
            )}
          </div>
        </article>
  );
}
