import { isAudioLibraryResponse, isAudioPlaybackResponse, isAudioCueResponse, isObject } from "../../../../packages/contracts/dist/index.js";
import { readHostResponse } from "./read-host-response";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../session-client";
import type { RuntimeStatus, AudioTrack, PlaybackState } from "./types";

export function useAudioLibrary(runtime: RuntimeStatus | null) {
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [audioPlayback, setAudioPlayback] = useState<PlaybackState | null>(null);
  const [audioServiceUrl, setAudioServiceUrl] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const [audioCuePlayStatus, setAudioCuePlayStatus] = useState("");

  async function loadAudioLibrary() {
    if (!audioServiceUrl) return;
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/library`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = await readHostResponse(response, isAudioLibraryResponse);
      setAudioTracks(json.tracks);
    } catch {
      // ignore
    }
  }

  async function loadAudioStatus() {
    if (!audioServiceUrl) return;
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/status`, {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = await readHostResponse(response, isAudioPlaybackResponse);
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function playAudioTrack(trackId: string, loop = false) {
    if (!audioServiceUrl) return;
    setAudioStatus("playing");
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, loop }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        setAudioStatus("failed");
        return;
      }
      const json = await readHostResponse(response, isAudioPlaybackResponse);
      setAudioPlayback(json.playbackState);
      setAudioStatus("ready");
    } catch {
      setAudioStatus("failed");
    }
  }

  async function pauseAudio() {
    if (!audioServiceUrl) return;
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/pause`, {
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = await readHostResponse(response, isAudioPlaybackResponse);
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function stopAudio() {
    if (!audioServiceUrl) return;
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/stop`, {
        method: "POST",
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = await readHostResponse(response, isAudioPlaybackResponse);
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function setAudioVolume(volume: number) {
    if (!audioServiceUrl) return;
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/volume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = await readHostResponse(response, isAudioPlaybackResponse);
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function toggleAudioMute() {
    if (!audioServiceUrl || !audioPlayback) return;
    const next = !audioPlayback.muted;
    try {
      const response = await apiFetch(`${audioServiceUrl}/api/mute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted: next }),
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return;
      const json = await readHostResponse(response, isAudioPlaybackResponse);
      setAudioPlayback(json.playbackState);
    } catch {
      // ignore
    }
  }

  async function playAudioCue(cueId: string) {
    setAudioCuePlayStatus("playing");
    try {
      const response = await apiFetch(`/api/audio-cues/${cueId}/play`, {
        method: "POST",
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const json: unknown = await response.json();
        setAudioCuePlayStatus(`failed:${isObject(json) && typeof json.error === "string" ? json.error : "Unknown error"}`);
        return;
      }

      const json = await readHostResponse(response, isAudioCueResponse);
      setAudioCuePlayStatus(`playing:${String(json.matchedTrack?.filename ?? "track")}`);
      await loadAudioStatus();
    } catch {
      setAudioCuePlayStatus("failed:request");
    }
  }

  useEffect(() => {
    const audioService = runtime?.services.find((s) => s.name === "audio-service");
    const message = audioService?.message ?? "";
    const match = message.match(/https?:\/\/[^\s]+/);
    const nextUrl = match ? match[0] : "";
    if (nextUrl && nextUrl !== audioServiceUrl) {
      setAudioServiceUrl(nextUrl);
    }
  }, [runtime, audioServiceUrl]);

  useEffect(() => {
    if (!audioServiceUrl) return;
    void loadAudioLibrary();
    void loadAudioStatus();
    const interval = window.setInterval(() => {
      void loadAudioStatus();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [audioServiceUrl]);

  return { audioTracks, audioPlayback, audioServiceUrl, audioStatus, audioCuePlayStatus, loadAudioLibrary, loadAudioStatus, playAudioTrack, pauseAudio, stopAudio, setAudioVolume, toggleAudioMute, playAudioCue };
}
