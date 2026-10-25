import { inspectGameSchema, migrateGameSchema } from "./schema-migrations.js";
import Database from "better-sqlite3";
import { dirname, isAbsolute } from "node:path";
import { mkdirSync } from "node:fs";

/** Opening is explicit. This module never reads environment/configuration or opens a store on import. */
export function openGameStore(databasePath: string) {
  if (databasePath !== ":memory:" && !isAbsolute(databasePath)) throw new Error("Database path must be absolute or :memory:");
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    inspectGameSchema(database);
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = FULL");
    const repository = createLegacyRepository(database);
    repository.initDb();
    return { ...repository, database, close() { if (database.open) database.close(); } };
  } catch (error) {
    if (database.open) database.close();
    throw error;
  }
}

/** Injected connection stays caller-owned; nested writes share the command transaction. */
export function createLegacyRepository(db: Database.Database) {
  function initDb() {
    migrateGameSchema(db);
  }

  function getMeta(key: string): string | null {
    const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  function setMeta(key: string, value: string) {
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  }

  type JsonTable = "party" | "asset_records";
  function checkTable(table: string): asserts table is JsonTable {
    if (table !== "party" && table !== "asset_records") throw new Error("Unsupported JSON table");
  }
  function saveTable<T extends { id: string }>(table: "party", items: T[]): void;
  function saveTable<T extends { id: string; status: string }>(table: "asset_records", items: T[]): void;
  function saveTable(table: JsonTable, items: { id: string; status?: string }[]) {
    checkTable(table);
    const insert = db.prepare(table === "asset_records"
      ? "INSERT OR REPLACE INTO asset_records (id, data, status) VALUES (?, ?, ?)"
      : "INSERT OR REPLACE INTO party (id, data) VALUES (?, ?)");
    const deleteAll = db.prepare(`DELETE FROM ${table}`);

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        if (table === "asset_records") insert.run(item.id, JSON.stringify(item), item.status);
        else insert.run(item.id, JSON.stringify(item));
      }
    })();
  }

  function loadTable<T>(table: JsonTable): T[] {
    checkTable(table);
    const rows = db.prepare(`SELECT data FROM ${table}`).all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  function saveRollLog<T extends { id: string; timestamp: string }>(items: T[]) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO roll_log (id, data, timestamp) VALUES (?, ?, ?)"
    );
    const deleteAll = db.prepare("DELETE FROM roll_log");

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        insert.run(item.id, JSON.stringify(item), item.timestamp);
      }
    })();
  }

  function loadRollLog<T>(): T[] {
    const rows = db
      .prepare("SELECT data FROM roll_log ORDER BY timestamp DESC")
      .all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  function saveEventLog<T extends { id: string; timestamp: string }>(items: T[]) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO event_log (id, data, timestamp) VALUES (?, ?, ?)"
    );
    const deleteAll = db.prepare("DELETE FROM event_log");

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        insert.run(item.id, JSON.stringify(item), item.timestamp);
      }
    })();
  }

  function loadEventLog<T>(): T[] {
    const rows = db
      .prepare("SELECT data FROM event_log ORDER BY timestamp DESC")
      .all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  function saveMediaJobs<T extends { id: string; status: string; createdAt: string }>(
    items: T[]
  ) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO media_jobs (id, data, status, created_at) VALUES (?, ?, ?, ?)"
    );
    const deleteAll = db.prepare("DELETE FROM media_jobs");

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        insert.run(item.id, JSON.stringify(item), item.status, item.createdAt);
      }
    })();
  }

  function loadMediaJobs<T>(): T[] {
    const rows = db
      .prepare("SELECT data FROM media_jobs ORDER BY created_at DESC")
      .all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  function saveMemoryEntries<T extends { id: string; createdAt: string }>(items: T[]) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO memory_entries (id, data, created_at) VALUES (?, ?, ?)"
    );
    const deleteAll = db.prepare("DELETE FROM memory_entries");

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        insert.run(item.id, JSON.stringify(item), item.createdAt);
      }
    })();
  }

  function loadMemoryEntries<T>(): T[] {
    const rows = db
      .prepare("SELECT data FROM memory_entries ORDER BY created_at DESC")
      .all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  function saveApprovalQueue<T extends { id: string; createdAt: string }>(items: T[]) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO approval_queue (id, data, created_at) VALUES (?, ?, ?)"
    );
    const deleteAll = db.prepare("DELETE FROM approval_queue");

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        insert.run(item.id, JSON.stringify(item), item.createdAt);
      }
    })();
  }

  function loadApprovalQueue<T>(): T[] {
    const rows = db
      .prepare("SELECT data FROM approval_queue ORDER BY created_at DESC")
      .all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  function saveAudioCues<T extends { id: string; status: string; createdAt: string }>(
    items: T[]
  ) {
    const insert = db.prepare(
      "INSERT OR REPLACE INTO audio_cues (id, data, status, created_at) VALUES (?, ?, ?, ?)"
    );
    const deleteAll = db.prepare("DELETE FROM audio_cues");

    db.transaction(() => {
      deleteAll.run();
      for (const item of items) {
        insert.run(item.id, JSON.stringify(item), item.status, item.createdAt);
      }
    })();
  }

  function loadAudioCues<T>(): T[] {
    const rows = db
      .prepare("SELECT data FROM audio_cues ORDER BY created_at DESC")
      .all() as Array<{ data: string }>;
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  return { initDb, getMeta, setMeta, saveTable, loadTable, saveRollLog, loadRollLog, saveEventLog, loadEventLog, saveMediaJobs, loadMediaJobs, saveMemoryEntries, loadMemoryEntries, saveApprovalQueue, loadApprovalQueue, saveAudioCues, loadAudioCues };
}
