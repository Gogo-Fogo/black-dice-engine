import React from "react";
import type { RuntimeStatus, AiLogEntry, ErrorEvent, SessionSnapshot } from "./types";
import { formatTime, formatVisibilityLabel, formatMediaJobType, formatRelativeTime, formatSimpleLabel } from "./format";

export function RuntimePanel({ runtime }: { runtime: RuntimeStatus | null }) {
  return (<article className="panel">
          <div className="panel-header">
            <h2>Runtime Status</h2>
            <span className={`pill pill-${runtime?.status ?? "offline"}`}>
              {runtime?.status ?? "offline"}
            </span>
          </div>
          <p className="muted-line">Mode: {runtime?.mode ?? "offline"}</p>
          {runtime?.mediaPressure ? (
            <div className="scene-packet-block">
              <div className="panel-header">
                <h3>Media Pressure</h3>
                <span className={`pill pill-${runtime.mediaPressure.level === "low" ? "ok" : "degraded"}`}>
                  {runtime.mediaPressure.level}
                </span>
              </div>
              <p className="helper-note">{runtime.mediaPressure.summary}</p>
              {runtime.mediaPressure.blockedJobTypes.length ? (
                <div className="tag-row">
                  {runtime.mediaPressure.blockedJobTypes.map((type) => (
                    <span className="tag-chip" key={type}>
                      blocked: {formatMediaJobType(type)}
                    </span>
                  ))}
                </div>
              ) : null}
              {runtime.mediaPressure.reasons.length ? (
                <div className="validation-list">
                  {runtime.mediaPressure.reasons.map((reason) => (
                    <p key={reason}>{reason}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {runtime?.warnings?.length ? (
            <div className="validation-list">
              {runtime.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <ul className="service-list">
            {runtime?.services.map((service) => (
              <li key={service.name}>
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.message ?? "Ready"}</span>
                </div>
                <span>{service.capability?.state ?? service.status}</span>
              </li>
            )) ?? <li>Waiting for runtime service data.</li>}
          </ul>
        </article>);
}

export function PresencePanel({ runtime }: { runtime: RuntimeStatus | null }) {
  return (<article className="panel">
          <div className="panel-header">
            <h2>Presence</h2>
            <span>{runtime?.clients.length ?? 0} clients</span>
          </div>
          <div className="presence-list">
            {runtime?.clients.map((client) => (
              <div className="presence-row" key={client.id}>
                <div>
                  <strong>
                    {client.playerLabel ?? client.role}
                    {client.claimedCharacterName ? ` - ${client.claimedCharacterName}` : ""}
                  </strong>
                  <p>
                    {client.role} · last seen {formatRelativeTime(client.lastSeenAt)}
                  </p>
                </div>
                <span className={`presence-pill presence-${client.status}`}>{client.status}</span>
              </div>
            )) ?? <p>Waiting for connected clients.</p>}
          </div>
        </article>);
}

export function AiActivityPanel({ aiLogs }: { aiLogs: AiLogEntry[] }) {
  return (<article className="panel panel-wide">
          <div className="panel-header">
            <h2>AI Activity Log</h2>
            <span>{aiLogs.length} recent entries</span>
          </div>
          <p className="muted-line">
            This log shows what the AI-facing runtime prepared, validated, queued, or refused. It is mainly for
            debugging and trust-building while we wire the real adapters in.
          </p>
          <div className="event-log">
            {aiLogs.length ? (
              aiLogs.map((entry) => (
                <div className="event-row" key={entry.id}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>
                      {entry.adapter} · {entry.kind} · {entry.correlationId}
                    </p>
                  </div>
                  <div className="event-meta">
                    <span className={`event-pill ${entry.kind === "validation_failure" ? "event-validation" : "event-memory"}`}>
                      {entry.kind.replace(/_/g, " ")}
                    </span>
                    <small>{formatTime(entry.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>No AI activity logged yet.</p>
            )}
          </div>
        </article>);
}

export function ErrorLogPanel({ errorEvents }: { errorEvents: ErrorEvent[] }) {
  return (<article className="panel panel-wide">
          <div className="panel-header">
            <h2>Error Log</h2>
            <span>{errorEvents.length} recent events</span>
          </div>
          <p className="muted-line">
            These are service failures, degraded states, and recoverable errors the runtime detected. They are
            GM-only so players do not see system problems during a session.
          </p>
          <div className="event-log">
            {errorEvents.length ? (
              errorEvents.map((entry) => (
                <div className="event-row" key={entry.id}>
                  <div>
                    <strong>{entry.summary}</strong>
                    <p>{entry.message}</p>
                    <p className="helper-note">{entry.recoveryHint}</p>
                  </div>
                  <div className="event-meta">
                    <span className={`event-pill ${entry.severity === "critical" ? "event-validation" : entry.severity === "error" ? "event-state" : "event-memory"}`}>
                      {entry.severity} · {entry.service}
                    </span>
                    <small>{formatTime(entry.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>No errors logged. Services are running cleanly.</p>
            )}
          </div>
        </article>);
}

export function RollLogPanel({ snapshot }: { snapshot: SessionSnapshot | null }) {
  return (<article className="panel panel-wide">
          <div className="panel-header">
            <h2>Live Roll Log</h2>
            <span>In-memory truth</span>
          </div>
          <div className="roll-log">
            {snapshot?.rollLog.map((roll) => (
              <div key={roll.id} className="roll-row">
                <div>
                  <strong>{roll.actorName}</strong>
                  <p>{roll.note}</p>
                </div>
                <div className="roll-values">
                  <span>{roll.dice}</span>
                  <strong>{roll.total}</strong>
                  <small>{formatTime(roll.timestamp)}</small>
                </div>
              </div>
            )) ?? <p>Waiting for the first roll.</p>}
          </div>
        </article>);
}

export function EventHistoryPanel({ snapshot }: { snapshot: SessionSnapshot | null }) {
  return (<article className="panel panel-wide">
          <div className="panel-header">
            <h2>Table Event History</h2>
            <span>{snapshot?.eventLog.length ?? 0} recent events</span>
          </div>
          <div className="event-log">
            {snapshot?.eventLog.map((entry) => (
              <div key={entry.id} className="event-row">
                <div>
                  <strong>{entry.summary}</strong>
                  <p>
                    {entry.actor.label} · {formatVisibilityLabel(entry.visibility)}
                  </p>
                </div>
                <div className="event-meta">
                  <span className={`event-pill event-${entry.category}`}>{entry.category}</span>
                  <small>{formatTime(entry.timestamp)}</small>
                </div>
              </div>
            )) ?? <p>Waiting for the first state change.</p>}
          </div>
        </article>);
}

export function CampaignContextPanel({ snapshot }: { snapshot: SessionSnapshot | null }) {
  return (<article className="panel">
          <div className="panel-header">
            <h2>Campaign Context</h2>
            <span>{snapshot?.campaignBible.visibility ?? "loading"}</span>
          </div>
          {snapshot ? (
            <div className="context-block">
              <strong>{snapshot.campaignBible.subtitle}</strong>
              <p>{snapshot.activeSceneContext.location?.summary ?? "No scene location summary resolved yet."}</p>
              <div className="packet-meta-grid">
                <div>
                  <span>Scene Location</span>
                  <strong>{snapshot.activeSceneContext.location?.name ?? "Unresolved"}</strong>
                </div>
                <div>
                  <span>Safety Rating</span>
                  <strong>{snapshot.activeSceneContext.safety.rating}</strong>
                </div>
              </div>
              <div className="tag-row">
                {snapshot.activeSceneContext.tone.map((tone) => (
                  <span className="tag-chip" key={tone}>
                    {tone}
                  </span>
                ))}
              </div>
              {snapshot.activeSceneContext.location?.features.length ? (
                <div>
                  <p className="detail-label">Location Features</p>
                  <div className="tag-row">
                    {snapshot.activeSceneContext.location.features.map((feature) => (
                      <span className="tag-chip" key={feature}>
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {snapshot.activeSceneContext.npcs.length ? (
                <div>
                  <p className="detail-label">Relevant NPCs</p>
                  <div className="context-list">
                    {snapshot.activeSceneContext.npcs.map((npc) => (
                      <div className="context-row" key={npc.id}>
                        <strong>{npc.name}</strong>
                        <p>
                          {npc.role} · {npc.motive}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {snapshot.activeSceneContext.facts.length ? (
                <div>
                  <p className="detail-label">Matched Facts</p>
                  <div className="context-list">
                    {snapshot.activeSceneContext.facts.map((fact) => (
                      <div className="context-row" key={fact.id}>
                        <strong>{formatSimpleLabel(fact.id)}</strong>
                        <p>{fact.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p>No campaign facts matched this scene yet.</p>
              )}
            </div>
          ) : (
            <p>Waiting for campaign context.</p>
          )}
        </article>);
}
