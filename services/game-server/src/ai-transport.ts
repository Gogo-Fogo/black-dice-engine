/** Bounded JSON transport for untrusted AI providers. Error bodies never become diagnostics. */
export async function requestAiJson(request: typeof fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const body: { current: ReadableStream<Uint8Array> | null } = { current: null };
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("AI request canceled or timed out."));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const operation = (async () => {
    signal.throwIfAborted();
    const response = await request(url, { ...init, redirect: "error", signal });
    body.current = response.body;
    if (signal.aborted) { void body.current?.cancel().catch(() => {}); signal.throwIfAborted(); }
    signal.throwIfAborted();
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error(`AI provider HTTP ${response.status}.`); }
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new Error("AI response must be JSON.");
    const maximum = 256 * 1024;
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) throw new Error("AI response exceeds the size limit.");
    if (!response.body) throw new Error("AI response is empty.");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) throw new Error("AI response exceeds the size limit.");
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  })();
  try { return await Promise.race([operation, aborted]); }
  finally {
    signal.removeEventListener("abort", onAbort);
    void reader?.cancel().catch(() => {});
    if (!reader) void body.current?.cancel().catch(() => {});
  }
}
