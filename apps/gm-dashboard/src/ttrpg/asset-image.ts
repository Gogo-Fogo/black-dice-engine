/** Authenticated read with exclusive URL ownership; late replies cannot revive a closed image. */
export function loadAssetImage(source: string, request: typeof fetch, update: (url: string) => void,
  urls: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL) {
  const controller = new AbortController(); let owned: string | undefined;
  if (/^\/api\/assets\/[^/]+\/(content|preview)$/.test(source)) void (async () => {
    try {
      const response = await request(source, { signal: controller.signal });
      if (!response.ok || !/^image\/(png|jpeg|webp)$/.test(response.headers.get("content-type") ?? "")) return;
      const blob = await response.blob();
      if (controller.signal.aborted || blob.size > 64 * 1024 * 1024) return;
      owned = urls.createObjectURL(blob); update(owned);
    } catch { /* Keep failed/unapproved content absent. */ }
  })();
  return () => { controller.abort(); if (owned) { urls.revokeObjectURL(owned); owned = undefined; } };
}
