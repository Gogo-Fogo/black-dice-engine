import { createHash } from "node:crypto";
import type Database from "better-sqlite3";

type Table = { name: string; columns: Record<string, string>; primaryKey?: string[] };
type Migration = { version: number; name: string; tables: Table[] };
const table = (name: string, columns: Record<string, string>, primaryKey?: string[]): Table => ({ name, columns, primaryKey });

// Append migrations; never edit a published version's definitions/checksum.
const migrations: Migration[] = [
  { version: 1, name: "legacy-table-baseline", tables: [
    table("party", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL" }),
    table("roll_log", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", timestamp: "TEXT NOT NULL" }),
    table("event_log", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", timestamp: "TEXT NOT NULL" }),
    table("media_jobs", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", status: "TEXT NOT NULL", created_at: "TEXT NOT NULL" }),
    table("asset_records", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", status: "TEXT NOT NULL" }),
    table("memory_entries", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", created_at: "TEXT NOT NULL" }),
    table("approval_queue", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", created_at: "TEXT NOT NULL" }),
    table("audio_cues", { id: "TEXT PRIMARY KEY", data: "TEXT NOT NULL", status: "TEXT NOT NULL", created_at: "TEXT NOT NULL" }),
    table("meta", { key: "TEXT PRIMARY KEY", value: "TEXT NOT NULL" })
  ] },
  { version: 2, name: "local-authority-and-durable-commands", tables: [
    table("local_rooms", { id: "TEXT PRIMARY KEY", code: "TEXT NOT NULL", expires_at: "INTEGER NOT NULL", active: "INTEGER NOT NULL" }),
    table("local_members", { actor_id: "TEXT PRIMARY KEY", room_id: "TEXT NOT NULL", token_hash: "TEXT NOT NULL UNIQUE",
      role: "TEXT NOT NULL", label: "TEXT NOT NULL", revoked: "INTEGER NOT NULL DEFAULT 0" }),
    table("command_sessions", { session_id: "TEXT NOT NULL", mode: "TEXT NOT NULL", revision: "INTEGER NOT NULL", state_json: "TEXT NOT NULL" }, ["session_id", "mode"]),
    table("command_receipts", { session_id: "TEXT NOT NULL", mode: "TEXT NOT NULL", actor_id: "TEXT NOT NULL", kind: "TEXT NOT NULL", request_id: "TEXT NOT NULL",
      fingerprint: "TEXT NOT NULL", status: "INTEGER NOT NULL", result_json: "TEXT NOT NULL", revision: "INTEGER NOT NULL" }, ["session_id", "mode", "actor_id", "kind", "request_id"]),
    table("command_events", { session_id: "TEXT NOT NULL", mode: "TEXT NOT NULL", revision: "INTEGER NOT NULL", event_json: "TEXT NOT NULL" }, ["session_id", "mode", "revision"])
  ] }
];
export const gameSchemaVersion = migrations.at(-1)!.version;
const history: Table = table("bde_schema_migrations", { version: "INTEGER PRIMARY KEY", name: "TEXT NOT NULL", checksum: "TEXT NOT NULL" });
const checksum = (migration: Migration) => createHash("sha256").update(JSON.stringify(migration)).digest("hex");
const exists = (database: Database.Database, name: string) => database.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(name) as { type: string } | undefined;
const ddl = (definition: Table) => `CREATE TABLE IF NOT EXISTS ${definition.name} (${[
  ...Object.entries(definition.columns).map(([name, declaration]) => `${name} ${declaration}`),
  ...(definition.primaryKey ? [`PRIMARY KEY (${definition.primaryKey.join(", ")})`] : [])
].join(", ")})`;

export class SchemaMigrationError extends Error {}
type Column = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };
function validateTable(database: Database.Database, definition: Table) {
  if (exists(database, definition.name)?.type !== "table") throw new SchemaMigrationError(`Missing or incompatible table: ${definition.name}`);
  const columns = database.prepare("SELECT name, type, [notnull], dflt_value, pk FROM pragma_table_info(?)").all(definition.name) as Column[];
  const primaryKey = definition.primaryKey ?? Object.entries(definition.columns).filter(([, value]) => value.includes("PRIMARY KEY")).map(([name]) => name);
  for (const [name, declaration] of Object.entries(definition.columns)) {
    const column = columns.find(column => column.name === name);
    if (!column || column.type.toUpperCase() !== declaration.split(" ")[0] ||
      column.notnull !== Number(declaration.includes("NOT NULL")) || column.pk !== primaryKey.indexOf(name) + 1 ||
      column.dflt_value !== (declaration.match(/DEFAULT (.+)$/)?.[1] ?? null)) throw new SchemaMigrationError(`Incompatible column: ${definition.name}.${name}`);
    if (declaration.includes("UNIQUE")) {
      const indexes = database.prepare("SELECT name FROM pragma_index_list(?) WHERE [unique] = 1 AND partial = 0").all(definition.name) as { name: string }[];
      if (!indexes.some(index => {
        const entries = database.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno").all(index.name) as { name: string }[];
        return entries.length === 1 && entries[0].name === name;
      })) throw new SchemaMigrationError(`Missing unique key: ${definition.name}.${name}`);
    }
  }
  if (columns.some(column => !(column.name in definition.columns) && (column.pk || column.notnull && column.dflt_value === null))) {
    throw new SchemaMigrationError(`Incompatible additional column: ${definition.name}`);
  }
}

/** Read-only preflight: no directory creation, DDL, journal-mode changes or record rewriting. */
export function inspectGameSchema(database: Database.Database) {
  const version = database.pragma("user_version", { simple: true }) as number;
  if (!Number.isSafeInteger(version) || version < 0 || version > gameSchemaVersion) throw new SchemaMigrationError("Database schema is newer than this application; use a compatible build.");
  const journal = exists(database, history.name);
  if (!version && !migrations.some(migration => migration.tables.some(definition => exists(database, definition.name)))) {
    const foreignTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> ? LIMIT 1").get(history.name);
    if (foreignTable) throw new SchemaMigrationError("Unrecognized unversioned database; refusing schema adoption.");
  }
  if (version && !journal) throw new SchemaMigrationError("Database version has no matching migration history.");
  if (journal) {
    validateTable(database, history);
    const rows = database.prepare("SELECT version, name, checksum FROM bde_schema_migrations ORDER BY version").all() as { version: number; name: string; checksum: string }[];
    if (rows.length !== version || rows.some((row, index) => row.version !== migrations[index]?.version || row.name !== migrations[index]?.name || row.checksum !== checksum(migrations[index]))) {
      throw new SchemaMigrationError("Database migration history does not match this application.");
    }
  }
  for (const migration of migrations) for (const definition of migration.tables) {
    if (migration.version <= version || exists(database, definition.name)) validateTable(database, definition);
  }
  return { version, latestVersion: gameSchemaVersion, pending: migrations.filter(migration => migration.version > version).map(migration => ({ version: migration.version, name: migration.name })) };
}

/** Additive baseline/adoption only. All pending DDL/history/version changes commit together. */
export function migrateGameSchema(database: Database.Database, targetVersion = gameSchemaVersion) {
  if (!Number.isInteger(targetVersion) || targetVersion < 1 || targetVersion > gameSchemaVersion) throw new SchemaMigrationError("Unsupported target schema version.");
  return database.transaction(() => {
    const before = inspectGameSchema(database);
    if (targetVersion < before.version) throw new SchemaMigrationError("Schema downgrade is not supported; restore a verified backup instead.");
    database.exec(ddl(history));
    for (const migration of migrations.filter(migration => migration.version > before.version && migration.version <= targetVersion)) {
      for (const definition of migration.tables) {
        database.exec(ddl(definition));
        validateTable(database, definition);
      }
      database.prepare("INSERT INTO bde_schema_migrations (version, name, checksum) VALUES (?, ?, ?)").run(migration.version, migration.name, checksum(migration));
      database.pragma(`user_version = ${migration.version}`);
    }
    return inspectGameSchema(database);
  }).immediate();
}
