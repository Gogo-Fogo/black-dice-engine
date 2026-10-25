import { isObject, isRollRecord, isSessionSnapshot as snapshot, isRuntimeStatus as runtime, type RollRecord } from "../../../../packages/contracts/dist/index.js";
import type { RuntimeStatus, SessionSnapshot } from "./types";

export type HostUpdateHooks = {
  runtime(value: RuntimeStatus): void;
  snapshot(value: SessionSnapshot): void;
  roll(value: RollRecord): void;
  changed(): void;
};

/** Bounded presentation dedup belongs to the host view, never authoritative dice. */
export class HostUpdates {
  private presented = new Set<string>();
  constructor(private hooks: HostUpdateHooks) {}
  receive(value: unknown) {
    if (!isObject(value)) return false;
    if (value.type === "connected") {
      if (!isObject(value.payload) || !runtime(value.payload.runtimeStatus) || !snapshot(value.payload.sessionSnapshot)) return false;
      this.hooks.runtime(value.payload.runtimeStatus); this.hooks.snapshot(value.payload.sessionSnapshot); return true;
    }
    if (value.type === "runtime_status" && runtime(value.payload)) { this.hooks.runtime(value.payload); return true; }
    if (value.type === "session_snapshot" && snapshot(value.payload)) {
      this.hooks.snapshot(value.payload); this.hooks.changed(); return true;
    }
    if (value.type === "roll_recorded" && isRollRecord(value.payload)) {
      if (!this.presented.has(value.payload.id)) {
        this.presented.add(value.payload.id);
        if (this.presented.size > 128) this.presented.delete(this.presented.values().next().value!);
        this.hooks.roll(value.payload);
      }
      return true;
    }
    return false;
  }
}
