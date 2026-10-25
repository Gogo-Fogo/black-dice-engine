export type DiceAudioEnvironment = {
  audio(path: string): Pick<HTMLAudioElement, "currentTime" | "play" | "pause" | "removeAttribute" | "load">;
  later(callback: () => void, milliseconds: number): unknown; cancel(timer: unknown): void; random(): number;
};
const browserAudio: DiceAudioEnvironment = {
  audio: path => new Audio(path), later: (callback, milliseconds) => setTimeout(callback, milliseconds), cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>), random: Math.random
};

/** Call from a gesture. Each invocation owns its audio and timer; cleanup is idempotent. */
export function playDiceRollSound(environment = browserAudio) {
  const audio = environment.audio("./audio/dice-roll.mp3");
  let timer: unknown;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true; environment.cancel(timer); audio.pause(); audio.removeAttribute("src"); audio.load();
  };
  try {
    const length = 1.5 + environment.random() * 1.5;
    audio.currentTime = environment.random() * (23 - length);
    void audio.play().catch(stop);
    timer = environment.later(stop, length * 1000);
  } catch (error) { stop(); throw error; }
  return stop;
}
