import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gameSchemaVersion, inspectGameSchema } from "./schema-migrations.js";

type Manifest = { version: 1; id: string; createdAt: string; sourceDbPath: string; schemaVersion: number;
  sizeBytes: number; sha256: string; note: string };
const validId = (id: string) => /^backup-\d{17}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const publicRecord = (record: Manifest) => ({ version: record.version, id: record.id, createdAt: record.createdAt,
  schemaVersion: record.schemaVersion, sizeBytes: record.sizeBytes, sha256: record.sha256, note: record.note });
export class BackupError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function inspect(path: string) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("quick_check", { simple: true }) !== "ok") throw new BackupError(409, "Backup integrity check failed.");
    const schema = inspectGameSchema(database);
    if (schema.version !== gameSchemaVersion) throw new BackupError(409, "Backup requires a compatible application version.");
    return schema.version;
  } finally { database.close(); }
}

/** Online SQLite snapshots. Validation is read-only; this API never replaces a live database. */
export function createBackups(database: Database.Database, options: { directory: string; source: string; now?: () => number }) {
  const root = resolve(options.directory), now = options.now ?? Date.now;
  let pending: Promise<ReturnType<typeof publicRecord>> | undefined;
  async function manifest(id: string): Promise<Manifest> {
    if (!validId(id)) throw new BackupError(400, "Invalid backup ID.");
    const folder = join(root, id), path = join(folder, "manifest.json");
    const directory = await lstat(folder), file = await lstat(path);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !file.isFile() || file.isSymbolicLink() || file.size > 16384) throw new BackupError(409, "Invalid backup manifest.");
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!value || typeof value !== "object") throw new BackupError(409, "Invalid backup manifest.");
    const record = value as Manifest;
    if (record.version !== 1 || record.id !== id || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) ||
      typeof record.sourceDbPath !== "string" || record.schemaVersion !== gameSchemaVersion || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 1 ||
      typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.sha256) || typeof record.note !== "string" || record.note.length > 200) throw new BackupError(409, "Invalid backup manifest.");
    return record;
  }
  return {
    async drain() { await pending?.catch(() => {}); },
    create(note = "") {
      if (typeof note !== "string" || note.length > 200) return Promise.reject(new BackupError(400, "Backup note must be at most 200 characters."));
      if (pending) return pending;
      pending = (async () => {
        try {
          inspectGameSchema(database);
          const createdAt = new Date(now()).toISOString(), id = `backup-${createdAt.replace(/\D/g, "")}-${randomUUID()}`;
          await mkdir(root, { recursive: true });
          const folder = join(root, id); await mkdir(folder); // Exclusive owned directory; never overwrite a prior snapshot.
          const path = join(folder, "snapshot.db");
          await database.backup(path);
          const schemaVersion = inspect(path), sizeBytes = (await lstat(path)).size, sha256 = await digest(path);
          const record: Manifest = { version: 1, id, createdAt, sourceDbPath: resolve(options.source), schemaVersion, sizeBytes, sha256, note: note.trim() };
          // Publish the manifest last. Incomplete snapshots cannot appear as successful backups.
          await writeFile(join(folder, "manifest.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
          return publicRecord(record);
        } catch (error) { throw error instanceof BackupError ? error : new BackupError(503, "Backup could not be completed. Check storage and retry."); }
      })().finally(() => { pending = undefined; });
      return pending;
    },
    async list() {
      let entries;
      try { entries = await readdir(root, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { backups: [], invalidCount: 0, limit: 100 }; throw new BackupError(503, "Backup list is unavailable."); }
      const ids = entries.filter(entry => validId(entry.name)).map(entry => entry.name).sort().reverse().slice(0, 100);
      const backups: ReturnType<typeof publicRecord>[] = []; let invalidCount = 0;
      for (const id of ids) { try { backups.push(publicRecord(await manifest(id))); } catch { invalidCount++; } }
      return { backups, invalidCount, limit: 100 };
    },
    async validate(id: string) {
      try {
        const record = await manifest(id), path = join(root, id, "snapshot.db"), file = await lstat(path);
        if (!file.isFile() || file.isSymbolicLink() || file.size !== record.sizeBytes || await digest(path) !== record.sha256) throw new BackupError(409, "Backup checksum or size does not match.");
        inspect(path);
        return { valid: true as const, backup: publicRecord(record) };
      } catch (error) {
        if (error instanceof BackupError) throw error;
        throw new BackupError(409, "Backup validation failed. The live database was not changed.");
      }
    }
  };
}
