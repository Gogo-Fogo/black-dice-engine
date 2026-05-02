import Database from "better-sqlite3";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const dbDir = process.env.BDE_DB_PATH
  ? dirname(process.env.BDE_DB_PATH)
  : join(currentDir, "../../../_data");
const dbPath = process.env.BDE_DB_PATH || join(dbDir, "black-dice-engine.db");

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS party (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roll_log (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_log (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_jobs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_records (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_queue (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audio_cues (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
}

export function saveTable<T extends { id: string }>(table: string, items: T[]) {
  const insert = db.prepare(`INSERT OR REPLACE INTO ${table} (id, data) VALUES (?, ?)`);
  const deleteAll = db.prepare(`DELETE FROM ${table}`);

  db.transaction(() => {
    deleteAll.run();
    for (const item of items) {
      insert.run(item.id, JSON.stringify(item));
    }
  })();
}

export function loadTable<T>(table: string): T[] {
  const rows = db.prepare(`SELECT data FROM ${table}`).all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function saveRollLog<T extends { id: string; timestamp: string }>(items: T[]) {
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

export function loadRollLog<T>(): T[] {
  const rows = db
    .prepare("SELECT data FROM roll_log ORDER BY timestamp DESC")
    .all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function saveEventLog<T extends { id: string; timestamp: string }>(items: T[]) {
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

export function loadEventLog<T>(): T[] {
  const rows = db
    .prepare("SELECT data FROM event_log ORDER BY timestamp DESC")
    .all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function saveMediaJobs<T extends { id: string; status: string; createdAt: string }>(
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

export function loadMediaJobs<T>(): T[] {
  const rows = db
    .prepare("SELECT data FROM media_jobs ORDER BY created_at DESC")
    .all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function saveMemoryEntries<T extends { id: string; createdAt: string }>(items: T[]) {
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

export function loadMemoryEntries<T>(): T[] {
  const rows = db
    .prepare("SELECT data FROM memory_entries ORDER BY created_at DESC")
    .all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function saveApprovalQueue<T extends { id: string; createdAt: string }>(items: T[]) {
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

export function loadApprovalQueue<T>(): T[] {
  const rows = db
    .prepare("SELECT data FROM approval_queue ORDER BY created_at DESC")
    .all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}

export function saveAudioCues<T extends { id: string; status: string; createdAt: string }>(
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

export function loadAudioCues<T>(): T[] {
  const rows = db
    .prepare("SELECT data FROM audio_cues ORDER BY created_at DESC")
    .all() as Array<{ data: string }>;
  return rows.map((row) => JSON.parse(row.data) as T);
}
