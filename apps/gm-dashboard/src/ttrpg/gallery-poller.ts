export type GalleryImage = { filename: string; url: string };
type Clock = {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
};

/** A single in-flight read; stopping aborts it and suppresses late completion. */
export function startGalleryPolling({ read, update, clock = {
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: timer => clearTimeout(timer as ReturnType<typeof setTimeout>)
} }: {
  read: (signal: AbortSignal) => Promise<unknown>;
  update: (images: GalleryImage[]) => void;
  clock?: Clock;
}) {
  let stopped = false;
  let next: unknown;
  let deadline: unknown;
  let active: AbortController | undefined;
  async function poll() {
    if (stopped) return;
    next = undefined;
    const controller = new AbortController();
    active = controller;
    const timeout = clock.schedule(() => controller.abort(), 5000);
    deadline = timeout;
    try {
      const data = await read(controller.signal);
      if (stopped || controller.signal.aborted || !data || typeof data !== "object") return;
      const images: unknown = (data as { images?: unknown }).images;
      if (!Array.isArray(images) || !images.every(image => image && typeof image === "object" &&
        typeof image.filename === "string" && typeof image.url === "string")) return;
      update(images.map(({ filename, url }) => ({ filename, url })));
    } catch { /* Retain the last successful gallery while unavailable. */ }
    finally {
      clock.cancel(timeout);
      deadline = undefined;
      active = undefined;
      if (!stopped) next = clock.schedule(() => { void poll(); }, 5000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    if (next !== undefined) clock.cancel(next);
    if (deadline !== undefined) clock.cancel(deadline);
    next = undefined;
    deadline = undefined;
    active?.abort();
  };
}
