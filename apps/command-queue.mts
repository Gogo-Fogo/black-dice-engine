export type PendingCommand<Action extends string> = { action: Action; body: Record<string, unknown> };
export type CommandStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export type CommandTransport<Action extends string> = (action: Action, body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Persists before send and retains ambiguity. Domain adapters validate bodies/receipts. */
export class CommandQueue<Action extends string, Receipt> {
  private current: PendingCommand<Action> | null = null;
  private inFlight: Promise<Receipt> | null = null;
  storageAvailable = true;
  constructor(private options: {
    key: string; storage: CommandStorage; transport: CommandTransport<Action>;
    accepts(value: unknown): value is PendingCommand<Action>;
    receipt(pending: PendingCommand<Action>, value: unknown): Receipt;
  }) {
    try {
      const raw = options.storage.getItem(options.key);
      if (raw) { const value: unknown = JSON.parse(raw); if (options.accepts(value)) this.current = value; else options.storage.removeItem(options.key); }
    } catch { this.storageAvailable = false; }
  }
  pending() { return this.current; }
  protected stage(pending: PendingCommand<Action>) {
    if (this.current) throw new Error("Confirm the pending action before starting another.");
    this.current = pending; this.save();
  }
  private save() {
    try { if (this.current) this.options.storage.setItem(this.options.key, JSON.stringify(this.current)); else this.options.storage.removeItem(this.options.key); }
    catch { this.storageAvailable = false; }
  }
  run(): Promise<Receipt> {
    if (this.inFlight) return this.inFlight;
    if (!this.current) return Promise.reject(new Error("There is no pending action."));
    const pending = this.current;
    this.inFlight = (async () => {
      const response = await this.options.transport(pending.action, pending.body);
      const value = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) { this.current = null; this.save(); }
        throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "Action could not be confirmed. Retry the same pending action.");
      }
      const receipt = this.options.receipt(pending, value);
      this.current = null; this.save(); return receipt;
    })().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
}
