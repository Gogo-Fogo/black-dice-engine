import React from "react";
import type { useYoutubeMusic } from "./useYoutubeMusic";

function extractYtId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function formatYtLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return `/${u.pathname.slice(1)}`;
    return u.searchParams.get("v") || url.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

export function YoutubeMusicPanel({ music }: { music: ReturnType<typeof useYoutubeMusic> }) {
  const { ytUrl, setYtUrl, ytVideoId, ytPlaying, ytLoop, setYtLoop, ytVolume, setYtVolume, ytTracks, setYtTracks, ytFading, selectTrack, stopTrack, clearTracks } = music;
  return (
        <article className="panel">
          <div className="panel-header">
            <h2>🎵 YouTube Music</h2>
            <span>{ytTracks.length} tracks</span>
          </div>
          <p className="muted-line">
            Paste any YouTube URL below. Works with full-length ambience videos, music compilations, or short loops.
            Premium account = no ads.
          </p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              type="text"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const url = ytUrl.trim();
                  const id = extractYtId(url);
                  if (id) {
                    setYtTracks((prev) => [...prev, { url, id, label: url }]);
                    setYtUrl("");
                  }
                }
              }}
              placeholder="Paste YouTube URL and press Enter..."
              style={{ flex: 1, fontSize: "0.85rem", padding: "8px 12px" }}
            />
          </div>
          {ytTracks.length > 0 ? (
            <div className="yt-controls">
              <div className={`yt-player-wrap ${ytFading ? "yt-fading" : ""}`}>
                {ytVideoId ? (
                  <iframe
                    title="Selected YouTube music"
                    key={ytVideoId}
                    src={`https://www.youtube.com/embed/${ytVideoId}?autoplay=1&loop=${ytLoop ? "1" : "0"}${ytLoop ? `&playlist=${ytVideoId}` : ""}&controls=0&enablejsapi=1`}
                    allow="autoplay"
                    style={{ width: "100%", height: "120px", border: "none", borderRadius: "4px", opacity: ytFading ? 0 : 1, transition: "opacity 0.5s" }}
                  />
                ) : (
                  <div className="yt-placeholder">Select a track below to play</div>
                )}
              </div>
              <div className="quick-action-row" style={{ marginTop: "8px" }}>
                <button className="mini-button" disabled={!ytVideoId} onClick={stopTrack} type="button">
                  {ytPlaying ? "⏹ Stop" : "▶ Play"}
                </button>
                <button className="mini-button" disabled={!ytVideoId} onClick={() => setYtLoop(!ytLoop)} type="button">
                  {ytLoop ? "🔁 Looping" : "🔂 Once"}
                </button>
                <span style={{ fontSize: "0.78rem", color: "#bca06d", padding: "4px 8px" }}>Vol {ytVolume}%</span>
                <button className="mini-button" onClick={() => setYtVolume(Math.max(0, ytVolume - 10))} type="button">−</button>
                <button className="mini-button" onClick={() => setYtVolume(Math.min(100, ytVolume + 10))} type="button">+</button>
              </div>
              <div className="tag-row" style={{ marginTop: "8px" }}>
                {ytTracks.map((track) => (
                  <button
                    type="button"
                    key={track.id}
                    className={`tag-chip ${track.id === ytVideoId ? "condition-chip" : ""}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      selectTrack(track.id);
                    }}
                  >
                    {track.id === ytVideoId && ytPlaying ? "▶ " : ""}{formatYtLabel(track.url)}
                  </button>
                ))}
                <button type="button" className="tag-chip muted-chip" onClick={clearTracks}>Clear all</button>
              </div>
            </div>
          ) : null}
        </article>
  );
}
