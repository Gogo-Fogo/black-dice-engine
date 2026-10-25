import { isAudioCue, isAudioLibraryResponse, isAudioPlaybackResponse, isObject,
  type AudioCue, type AudioTrack } from "../../../packages/contracts/dist/index.js";

export class AudioTrackNotFound extends Error {
  constructor(public availableTracks: number) { super("No matching audio track found for cue tags"); }
}

/** Owns one bounded operation per cue object; callers retain state and visibility ownership. */
export function createAudioCuePlayback(request: typeof fetch, clock: {
  schedule(callback: () => void, delay: number): unknown;
  cancel(timer: unknown): void;
} = { schedule: (callback, delay) => setTimeout(callback, delay), cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>) }) {
  const pending = new Map<AudioCue, Promise<AudioTrack>>();
  const controllers = new Set<AbortController>();
  let active = true;
  function play(cue: AudioCue, endpoint: string): Promise<AudioTrack> {
    if (!active) return Promise.reject(new Error("Audio playback owner disposed"));
    const existing = pending.get(cue);
    if (existing) return existing;
    if (!isAudioCue(cue) || cue.volume < 0 || cue.volume > 1) return Promise.reject(new Error("Invalid audio cue"));
    const settings = { tags: [...cue.tags], volume: cue.volume, loop: cue.loop };
    const controller = new AbortController(); controllers.add(controller);
    const timer = clock.schedule(() => controller.abort(), 10000);
    const work = (async () => {
      const libraryResponse = await request(`${endpoint}/api/library`, { signal: controller.signal });
      if (!libraryResponse.ok) throw new Error("Failed to fetch audio library");
      const library: unknown = await libraryResponse.json();
      if (!isAudioLibraryResponse(library)) throw new Error("Invalid audio library response");
      if (controller.signal.aborted || !active) throw new Error("Audio playback cancelled");
      const track = library.tracks.find(track => {
        const tags = new Set(track.tags.map(tag => tag.toLowerCase()));
        return settings.tags.some(tag => tags.has(tag.toLowerCase()));
      });
      if (!track) throw new AudioTrackNotFound(library.tracks.length);
      const response = await request(`${endpoint}/api/play`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, loop: settings.loop, volume: settings.volume }), signal: controller.signal });
      if (!response.ok) throw new Error("Audio service play failed");
      const data: unknown = await response.json();
      if (!isObject(data) || data.ok !== true || !isAudioPlaybackResponse(data) ||
        data.playbackState.status !== "playing" || data.playbackState.currentTrackId !== track.id ||
        data.playbackState.volume !== settings.volume || data.playbackState.loop !== settings.loop) throw new Error("Audio playback not confirmed");
      if (controller.signal.aborted || !active) throw new Error("Audio playback cancelled");
      return track;
    })();
    let cancelWait: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancelWait = () => reject(new Error("Audio playback cancelled or timed out"));
      if (controller.signal.aborted) cancelWait();
      else controller.signal.addEventListener("abort", cancelWait, { once: true });
    });
    const operation = Promise.race([work, cancelled]).finally(() => {
      controller.signal.removeEventListener("abort", cancelWait);
      clock.cancel(timer); controllers.delete(controller); pending.delete(cue);
    });
    pending.set(cue, operation);
    return operation;
  }
  return {
    play,
    dispose() { active = false; for (const controller of controllers) controller.abort(); }
  };
}
