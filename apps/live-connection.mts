type Socket = Pick<WebSocket, "readyState" | "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close">;
type Timers = {
  timeout(callback: () => void, delay: number): unknown; cancelTimeout(handle: unknown): void;
  interval(callback: () => void, delay: number): unknown; cancelInterval(handle: unknown): void;
};
const defaultTimers: Timers = {
  timeout: (callback, delay) => setTimeout(callback, delay), cancelTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  interval: (callback, delay) => setInterval(callback, delay), cancelInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>)
};

/** Owns one socket and its timers. React and the authoritative game rules stay outside. */
export class LiveConnection {
  private active = false;
  private socket: Socket | null = null;
  private retry: unknown;
  private heartbeat: unknown;
  private attempts = 0;
  private lastMessageAt = 0;
  constructor(private hooks: {
    socket(): Socket; receive(message: unknown): boolean; refresh(): void;
    status(value: string): void; error(message: string): void; expired(): void; online(): boolean;
  }, private now = Date.now, private timers = defaultTimers) {}

  start() { if (this.active) return; this.active = true; this.hooks.refresh(); this.connect(); }
  private connect = () => {
    if (!this.active || this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    this.hooks.status(this.attempts ? "Reconnecting" : "Connecting");
    let socket: Socket;
    try { socket = this.hooks.socket(); this.socket = socket; }
    catch {
      this.hooks.error("Could not open the live connection. Retrying…");
      this.retry = this.timers.timeout(this.connect, 5000);
      return;
    }
    socket.onopen = () => {
      if (!this.active || this.socket !== socket) return;
      this.attempts = 0; this.lastMessageAt = this.now(); this.hooks.refresh();
      this.heartbeat = this.timers.interval(() => {
        if (this.now() - this.lastMessageAt > 25000) { socket.close(4000, "Reconnect"); return; }
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: "heartbeat" }));
      }, 5000);
    };
    socket.onmessage = event => {
      if (!this.active || this.socket !== socket) return;
      try {
        const message = JSON.parse(String(event.data));
        this.lastMessageAt = this.now();
        if (this.hooks.receive(message)) { this.hooks.status("Connected"); this.hooks.error(""); }
      } catch { this.hooks.error("A live update could not be read. Refreshing…"); this.hooks.refresh(); }
    };
    socket.onerror = () => { if (this.active && this.socket === socket) this.hooks.error("Live connection interrupted. Reconnecting…"); };
    socket.onclose = event => {
      if (!this.active || this.socket !== socket) return;
      this.timers.cancelInterval(this.heartbeat);
      if (event.code === 4001) { this.active = false; this.timers.cancelTimeout(this.retry); this.hooks.expired(); return; }
      this.hooks.status(this.hooks.online() ? "Reconnecting" : "Offline");
      this.retry = this.timers.timeout(this.connect, Math.min(5000, 500 * 2 ** Math.min(this.attempts++, 4)));
    };
  };
  wake() {
    if (!this.active) return;
    this.hooks.refresh();
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: "heartbeat" }));
    if (!this.socket || this.socket.readyState === 3) { this.timers.cancelTimeout(this.retry); this.connect(); }
  }
  offline() { if (this.active) { this.hooks.status("Offline"); this.hooks.error("No network. The host retains your saved game."); } }
  stop() {
    this.active = false;
    this.timers.cancelTimeout(this.retry); this.timers.cancelInterval(this.heartbeat);
    if (this.socket) {
      this.socket.onopen = null; this.socket.onmessage = null; this.socket.onclose = null; this.socket.onerror = null;
      this.socket.close(); this.socket = null;
    }
  }
}
