import React from "react";
import type { SessionSnapshot } from "./types";
import type { useAudioLibrary } from "./useAudioLibrary";

export function AudioLibraryPanel({ audio }: { audio: ReturnType<typeof useAudioLibrary> }) {
  const { audioTracks, audioPlayback, audioServiceUrl, playAudioTrack, pauseAudio, stopAudio, setAudioVolume, toggleAudioMute } = audio;
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>Audio Library</h2>
            <span>{audioTracks.length} tracks</span>
          </div>
          <p className="muted-line">
            Browse the local audio library by kind. Playback controls the host audio service state; the GM
            dashboard is the default playback source.
          </p>
          {audioServiceUrl ? (
            <div>
              <div className="panel-header">
                <h3>Now Playing</h3>
                <span className={`pill pill-${audioPlayback?.status === "playing" ? "ok" : "degraded"}`}>
                  {audioPlayback?.status ?? "idle"}
                </span>
              </div>
              {audioPlayback?.currentTrackId ? (
                <div className="context-row">
                  <strong>
                    {audioTracks.find((t) => t.id === audioPlayback.currentTrackId)?.filename ?? "Unknown track"}
                  </strong>
                  <p>
                    Volume: {Math.round((audioPlayback?.volume ?? 0) * 100)}%
                    {audioPlayback?.muted ? " · muted" : ""}
                    {audioPlayback?.loop ? " · looping" : ""}
                  </p>
                </div>
              ) : (
                <p className="muted-line">No track selected.</p>
              )}
              <div className="quick-action-row">
                <button
                  className="mini-button"
                  disabled={!audioPlayback?.currentTrackId}
                  onClick={() => void pauseAudio()}
                  type="button"
                >
                  Pause
                </button>
                <button
                  className="mini-button"
                  disabled={audioPlayback?.status === "idle"}
                  onClick={() => void stopAudio()}
                  type="button"
                >
                  Stop
                </button>
                <button
                  className="mini-button"
                  disabled={audioPlayback?.status === "idle"}
                  onClick={() => void toggleAudioMute()}
                  type="button"
                >
                  {audioPlayback?.muted ? "Unmute" : "Mute"}
                </button>
              </div>
              <div className="quick-action-row">
                <button className="mini-button" onClick={() => void setAudioVolume(0.2)} type="button">
                  Vol 20%
                </button>
                <button className="mini-button" onClick={() => void setAudioVolume(0.5)} type="button">
                  Vol 50%
                </button>
                <button className="mini-button" onClick={() => void setAudioVolume(0.8)} type="button">
                  Vol 80%
                </button>
                <button className="mini-button" onClick={() => void setAudioVolume(1.0)} type="button">
                  Vol 100%
                </button>
              </div>
              <div>
                <p className="detail-label">Tracks</p>
                <div className="memory-entry-list">
                  {audioTracks.length ? (
                    audioTracks.map((track) => (
                      <div className="memory-entry-card" key={track.id}>
                        <div className="memory-entry-header">
                          <strong>{track.filename}</strong>
                          <span className="event-pill event-memory">{track.kind}</span>
                        </div>
                        <div className="tag-row">
                          {track.tags.map((tag) => (
                            <span className="tag-chip" key={`${track.id}-${tag}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="approval-actions">
                          <button
                            className="mini-button"
                            onClick={() => void playAudioTrack(track.id, false)}
                            type="button"
                          >
                            Play
                          </button>
                          <button
                            className="mini-button"
                            onClick={() => void playAudioTrack(track.id, true)}
                            type="button"
                          >
                            Loop
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No audio tracks found in library.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p>Audio service not configured in runtime status.</p>
          )}
        </article>
  );
}

export function AudioCuePanel({ audio, snapshot, pendingActionKey }: { audio: ReturnType<typeof useAudioLibrary>; snapshot: SessionSnapshot | null; pendingActionKey: string }) {
  const { audioCuePlayStatus, playAudioCue } = audio;
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>Audio Cue Queue</h2>
            <span>{snapshot?.audioCueQueue.length ?? 0} queued</span>
          </div>
          <p className="muted-line">
            Scene-packet audio cues land here. The GM can trigger playback manually; auto-play on scene
            change is not wired yet.
          </p>
          <div className="memory-entry-list">
            {snapshot?.audioCueQueue.length ? (
              snapshot.audioCueQueue.map((cue) => (
                <div className="memory-entry-card" key={cue.id}>
                  <div className="memory-entry-header">
                    <strong>{cue.kind}</strong>
                    <span className="event-pill event-memory">{cue.status}</span>
                  </div>
                  <p>{cue.notes ?? "No notes attached."}</p>
                  <div className="tag-row">
                    {cue.tags.map((tag) => (
                      <span className="tag-chip" key={`${cue.id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                    {cue.loop ? <span className="tag-chip">loop</span> : null}
                    <span className="tag-chip">vol: {Math.round(cue.volume * 100)}%</span>
                  </div>
                  <div className="approval-actions">
                    <button
                      className="mini-button"
                      disabled={pendingActionKey !== "" || cue.status === "playing"}
                      onClick={() => void playAudioCue(cue.id)}
                      type="button"
                    >
                      {cue.status === "playing" ? "Playing" : "Play Cue"}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p>No audio cues queued yet.</p>
            )}
          </div>
          {audioCuePlayStatus ? (
            <p className="export-note">
              {audioCuePlayStatus === "playing"
                ? "Starting audio cue..."
                : audioCuePlayStatus.startsWith("playing:")
                  ? `Playing track: ${audioCuePlayStatus.split(":")[1]}`
                  : audioCuePlayStatus.startsWith("failed:")
                    ? `Failed: ${audioCuePlayStatus.slice("failed:".length)}`
                    : "Audio cue playback updated."}
            </p>
          ) : null}
        </article>
  );
}
