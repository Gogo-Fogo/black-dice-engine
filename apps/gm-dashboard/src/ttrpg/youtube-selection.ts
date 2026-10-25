type Clock = {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
};

/** Own the delayed visual track transition; never contact a media provider here. */
export function createTrackSelection(clock: Clock = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>)
}) {
  let timer: unknown;
  let generation = 0;
  function cancel() {
    generation += 1;
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
  }
  return {
    cancel,
    select(id: string, apply: (id: string) => void) {
      cancel();
      const current = generation;
      timer = clock.schedule(() => {
        if (current !== generation) return;
        timer = undefined;
        apply(id);
      }, 300);
    }
  };
}
