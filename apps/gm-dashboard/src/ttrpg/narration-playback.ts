type PlaybackDependencies = {
  context: () => AudioContext;
  audio: (url: string) => HTMLAudioElement;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
};

/** Playback resources belong to this host view, including asynchronous decode completion. */
export function createNarrationPlayback(dependencies: PlaybackDependencies = {
  context: () => new AudioContext(), audio: url => new Audio(url),
  createUrl: blob => URL.createObjectURL(blob), revokeUrl: url => URL.revokeObjectURL(url)
}) {
  let context: AudioContext | undefined;
  let epoch = 0;
  let cleanup: (() => void) | undefined;
  function stop() {
    epoch += 1;
    const release = cleanup; cleanup = undefined; release?.();
  }
  return {
    async unlock() {
      try {
        context ??= dependencies.context();
        const current = context;
        await current.resume();
        return current === context && current.state === "running";
      } catch { return false; }
    },
    async play(blob: Blob, ended: () => void) {
      stop();
      const current = epoch;
      try {
        if (context) {
          const owner = context;
          const buffer = await owner.decodeAudioData(await blob.arrayBuffer());
          if (current !== epoch || owner !== context) return false;
          const source = owner.createBufferSource();
          let released = false;
          const release = () => {
            if (released) return; released = true;
            source.onended = null;
            try { source.stop(); } catch { /* It may already have ended. */ }
            source.disconnect();
          };
          cleanup = release;
          source.onended = () => { if (current === epoch) { stop(); ended(); } };
          source.buffer = buffer; source.connect(owner.destination); source.start();
        } else {
          const url = dependencies.createUrl(blob);
          let audio: HTMLAudioElement | undefined, released = false;
          const release = () => {
            if (released) return; released = true;
            if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute("src"); }
            dependencies.revokeUrl(url);
          };
          cleanup = release;
          audio = dependencies.audio(url);
          audio.onended = audio.onerror = () => { if (current === epoch) { stop(); ended(); } };
          await audio.play();
          if (current !== epoch) return false;
        }
        return true;
      } catch (error) { if (current === epoch) stop(); throw error; }
    },
    stop,
    dispose() {
      stop();
      const owner = context; context = undefined;
      if (owner) void owner.close().catch(() => {});
    }
  };
}
