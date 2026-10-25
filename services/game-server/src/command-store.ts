import { migrateGameSchema } from "./schema-migrations.js";
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { SessionError } from "./session-authority.js";

import type { CommandKey } from "../../../packages/contracts/dist/index.js";
export type { CommandKey } from "../../../packages/contracts/dist/index.js";
export type CommandResult = { status: number; body: unknown; revision: number };
export const defaultMaxJournalEntries = 5000;
type HistoryPolicy = { maxJournalEntries: number };
export function fingerprint(value: unknown) {
  const canonical = JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Receipts, complete mode state and event metadata share one SQLite transaction. */
export class CommandStore {
  private maxJournalEntries: number;
  constructor(private database: Database.Database, private now = Date.now,
    policy: HistoryPolicy = { maxJournalEntries: defaultMaxJournalEntries }) {
    if (!Number.isSafeInteger(policy.maxJournalEntries) || policy.maxJournalEntries < 1 || policy.maxJournalEntries > 50000) {
      throw new Error("Journal retention must be an integer from 1 to 50000.");
    }
    this.maxJournalEntries = policy.maxJournalEntries;
    migrateGameSchema(database);
    database.transaction(() => this.trimJournal())();
  }

  /** Only redundant commit metadata expires; never delete outcomes, receipts or checkpoints. */
  private trimJournal() {
    this.database.prepare(`DELETE FROM command_events WHERE rowid IN (
      SELECT rowid FROM command_events ORDER BY rowid DESC LIMIT -1 OFFSET ?
    )`).run(this.maxJournalEntries);
  }

  /** Private diagnostic metadata, not a full event-sourced replay or audience projection. */
  historyWindow(sessionId: string, mode: string) {
    const rows = this.database.prepare(`SELECT revision, event_json FROM command_events
      WHERE session_id = ? AND mode = ? ORDER BY revision`).all(sessionId, mode) as { revision: number; event_json: string }[];
    const currentRevision = this.revision(sessionId, mode);
    return { currentRevision, maxJournalEntries: this.maxJournalEntries, truncated: rows.length < currentRevision,
      firstRetainedRevision: rows[0]?.revision ?? null, lastRetainedRevision: rows.at(-1)?.revision ?? null,
      events: rows.map(row => ({ revision: row.revision, metadata: JSON.parse(row.event_json) as unknown })) };
  }

  revision(sessionId: string, mode: string) {
    const row = this.database.prepare("SELECT revision FROM command_sessions WHERE session_id = ? AND mode = ?")
      .get(sessionId, mode) as { revision: number } | undefined;
    return row?.revision ?? 0;
  }

  state(sessionId: string, mode: string): unknown | undefined {
    const row = this.database.prepare("SELECT state_json FROM command_sessions WHERE session_id = ? AND mode = ?")
      .get(sessionId, mode) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) : undefined;
  }

  replay(key: CommandKey, payload: unknown): CommandResult | null {
    const row = this.database.prepare(`SELECT fingerprint, status, result_json, revision FROM command_receipts
      WHERE session_id = ? AND mode = ? AND actor_id = ? AND kind = ? AND request_id = ?`)
      .get(key.sessionId, key.mode, key.actorId, key.kind, key.requestId) as
      { fingerprint: string; status: number; result_json: string; revision: number } | undefined;
    if (!row) return null;
    if (row.fingerprint !== fingerprint(payload)) throw new SessionError(409, "Request ID was already used for a different command.");
    return { status: row.status, body: JSON.parse(row.result_json), revision: row.revision };
  }

  commit(key: CommandKey, payload: unknown, expectedRevision: number, state: unknown, result: CommandResult,
    persistLegacy: () => void = () => {}, phase: { roundId: number | null; stage: string } = { roundId: null, stage: "table" }) {
    this.database.transaction(() => {
      if (this.revision(key.sessionId, key.mode) !== expectedRevision) throw new SessionError(409, "Session changed. Refresh before retrying.");
      if (result.revision !== expectedRevision + 1) throw new Error("Invalid command revision");
      persistLegacy();
      this.database.prepare(`INSERT INTO command_sessions (session_id, mode, revision, state_json) VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, mode) DO UPDATE SET revision = excluded.revision, state_json = excluded.state_json`)
        .run(key.sessionId, key.mode, result.revision, JSON.stringify(state));
      this.database.prepare("INSERT INTO command_receipts (session_id, mode, actor_id, kind, request_id, fingerprint, status, result_json, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(key.sessionId, key.mode, key.actorId, key.kind, key.requestId, fingerprint(payload), result.status, JSON.stringify(result.body), result.revision);
      this.database.prepare("INSERT INTO command_events (session_id, mode, revision, event_json) VALUES (?, ?, ?, ?)")
        .run(key.sessionId, key.mode, result.revision, JSON.stringify({ schemaVersion: 1, type: "command_committed", ...key, revision: result.revision,
          ...phase, committedAt: this.now() }));
      this.trimJournal();
    })();
  }
}
