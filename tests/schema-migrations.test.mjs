import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { mkdtemp, mkdir, readFile, copyFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const extension = directory === 'dist' ? 'js' : 'ts';
const load = name => import(`../services/game-server/${directory}/${name}.${extension}`);
const { migrateGameSchema, inspectGameSchema, gameSchemaVersion, SchemaMigrationError } = await load('schema-migrations');
const { openGameStore } = await load('db');
const { SessionAuthority } = await load('session-authority');
const { CommandStore } = await load('command-store');
const rowDump = database => Object.fromEntries(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'bde_schema_migrations' ORDER BY name").all()
  .map(({ name }) => { assert.match(name, /^[a-z_]+$/); return [name, database.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]; }));

async function fixture(run) {
  const root = fileURLToPath(new URL('../tmp/', import.meta.url)); await mkdir(root, { recursive: true });
  const folder = await mkdtemp(resolve(root, 'migrations-'));
  try { await run(folder); }
  finally { assert.ok(resolve(folder).startsWith(resolve(root) + sep)); await rm(folder, { recursive: true, force: true }); }
}

test('fresh migration versions are ordered, repeatable and upgrades roll back DDL/history/version atomically', () => {
  const database = new Database(':memory:');
  try {
    assert.equal(inspectGameSchema(database).version, 0);
    assert.equal(migrateGameSchema(database, 1).version, 1);
    database.prepare('INSERT INTO meta VALUES (?, ?)').run('original', 'retained');
    database.exec("CREATE TRIGGER reject_migration BEFORE INSERT ON bde_schema_migrations WHEN NEW.version = 2 BEGIN SELECT RAISE(ABORT, 'synthetic migration failure'); END");
    assert.throws(() => migrateGameSchema(database), /synthetic migration failure/);
    assert.equal(inspectGameSchema(database).version, 1);
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE name = 'local_rooms'").get(), undefined);
    assert.equal(database.prepare('SELECT value FROM meta').get().value, 'retained');
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM bde_schema_migrations').get().count, 1);
    database.exec('DROP TRIGGER reject_migration');
    assert.equal(migrateGameSchema(database).version, gameSchemaVersion);
    const before = rowDump(database), history = database.prepare('SELECT * FROM bde_schema_migrations ORDER BY version').all();
    assert.deepEqual(history.map(row => row.version), [1, 2]);
    migrateGameSchema(database); assert.deepEqual(rowDump(database), before);
    assert.deepEqual(database.prepare('SELECT * FROM bde_schema_migrations ORDER BY version').all(), history);
    assert.throws(() => migrateGameSchema(database, 1), /downgrade/);
    assert.equal(inspectGameSchema(database).version, gameSchemaVersion);
  } finally { database.close(); }
});

test('unversioned legacy records and compatible extra columns survive adoption byte for byte', () => {
  const database = new Database(':memory:');
  try {
    database.exec('CREATE TABLE party (id TEXT PRIMARY KEY, data TEXT NOT NULL, annotation TEXT); CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const original = ' { "id" : "demo-seat", "unrecognizedField" : "original-demo-canary" } ';
    database.prepare('INSERT INTO party VALUES (?, ?, ?)').run('demo-seat', original, 'retained extra column');
    database.prepare('INSERT INTO meta VALUES (?, ?)').run('demo', 'retained');
    const before = rowDump(database);
    migrateGameSchema(database);
    const after = rowDump(database);
    for (const [name, rows] of Object.entries(before)) assert.deepEqual(after[name], rows);
    assert.equal(database.prepare('SELECT data FROM party').get().data, original);
    assert.equal(inspectGameSchema(database).version, gameSchemaVersion);
  } finally { database.close(); }
});

test('unversioned current authority/state/receipts retain credentials and exact replay after adoption', () => {
  const database = new Database(':memory:');
  try {
    const authority = new SessionAuthority(database, () => 1000), host = authority.bootstrap();
    const store = new CommandStore(database, () => 1000);
    const key = { sessionId: host.sessionId, mode: 'ttrpg', actorId: host.actorId, kind: 'demo', requestId: 'demo-original' };
    const payload = { original: true }, result = { status: 200, body: { total: 4 }, revision: 1 };
    store.commit(key, payload, 0, { original: true }, result);
    for (const name of ['command_sessions', 'command_receipts', 'command_events']) database.exec(`ALTER TABLE ${name} ADD COLUMN annotation TEXT`);
    database.exec('DROP TABLE bde_schema_migrations'); database.pragma('user_version = 0');
    const before = rowDump(database);
    migrateGameSchema(database);
    assert.deepEqual(rowDump(database), before);
    assert.equal(new SessionAuthority(database, () => 1000).authenticate(host.token).actorId, host.actorId);
    assert.deepEqual(new CommandStore(database).replay(key, payload), result);
    assert.deepEqual(new CommandStore(database).state(host.sessionId, 'ttrpg'), { original: true });
    const nextKey = { ...key, requestId: 'demo-after-adoption' }, nextResult = { ...result, revision: 2 };
    new CommandStore(database).commit(nextKey, payload, 1, { original: false }, nextResult);
    assert.deepEqual(new CommandStore(database).replay(nextKey, payload), nextResult);
  } finally { database.close(); }
});

test('incompatible columns/keys/defaults or history fail closed without partial schema adoption', () => {
  for (const ddl of [
    'CREATE TABLE unrelated (value TEXT)',
    'CREATE TABLE party (id TEXT PRIMARY KEY, data INTEGER NOT NULL)',
    'CREATE TABLE party (id TEXT, data TEXT NOT NULL)',
    'CREATE TABLE party (id TEXT PRIMARY KEY, data TEXT NOT NULL, required_extra TEXT NOT NULL)',
    'CREATE TABLE local_members (actor_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, token_hash TEXT NOT NULL, role TEXT NOT NULL, label TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE local_members (actor_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, token_hash TEXT NOT NULL, role TEXT NOT NULL, label TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0); CREATE UNIQUE INDEX partial_token ON local_members(token_hash) WHERE revoked = 0',
    'CREATE TABLE local_members (actor_id TEXT PRIMARY KEY, room_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL, label TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 1)'
  ]) {
    const database = new Database(':memory:');
    try {
      database.exec(ddl); const before = rowDump(database);
      assert.throws(() => migrateGameSchema(database), SchemaMigrationError);
      assert.deepEqual(rowDump(database), before); assert.equal(database.pragma('user_version', { simple: true }), 0);
      assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE name = 'bde_schema_migrations'").get(), undefined);
    } finally { database.close(); }
  }
  const database = new Database(':memory:');
  try {
    migrateGameSchema(database);
    database.exec("UPDATE bde_schema_migrations SET checksum = 'tampered' WHERE version = 1");
    assert.throws(() => migrateGameSchema(database), /history/);
    database.exec("DELETE FROM bde_schema_migrations WHERE version = 1");
    assert.throws(() => inspectGameSchema(database), /history/);
  } finally { database.close(); }
});

test('newer databases are refused before journal-mode or persistent byte changes', async () => fixture(async folder => {
  const path = resolve(folder, 'future.db'), database = new Database(path);
  database.exec("CREATE TABLE future_only (value TEXT); INSERT INTO future_only VALUES ('original demo')");
  database.pragma(`user_version = ${gameSchemaVersion + 1}`); database.close();
  const before = await readFile(path);
  assert.throws(() => openGameStore(path), /newer/);
  assert.deepEqual(await readFile(path), before);
}));

test('online backup includes WAL writes and a disposable restored copy can adopt the schema independently', async () => fixture(async folder => {
  const path = resolve(folder, 'legacy.db'), backup = resolve(folder, 'before-migration.db'), restored = resolve(folder, 'restored.db');
  const database = new Database(path); let recovered;
  try {
    database.pragma('journal_mode = WAL'); database.pragma('wal_autocheckpoint = 0');
    database.exec('CREATE TABLE party (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    const data = JSON.stringify({ id: 'original-demo', value: 'before migration' });
    database.prepare('INSERT INTO party VALUES (?, ?)').run('original-demo', data);
    await database.backup(backup);
    const copy = new Database(backup, { readonly: true });
    try {
      assert.equal(copy.pragma('quick_check', { simple: true }), 'ok'); assert.equal(inspectGameSchema(copy).version, 0);
      assert.equal(copy.prepare('SELECT data FROM party').get().data, data);
    } finally { copy.close(); }
    migrateGameSchema(database);
    database.prepare('UPDATE party SET data = ?').run(JSON.stringify({ id: 'original-demo', value: 'after migration' }));
    await copyFile(backup, restored);
    recovered = openGameStore(restored);
    assert.equal(inspectGameSchema(recovered.database).version, gameSchemaVersion);
    assert.equal(recovered.database.pragma('quick_check', { simple: true }), 'ok');
    assert.equal(recovered.database.prepare('SELECT data FROM party').get().data, data);
    assert.equal(JSON.parse(database.prepare('SELECT data FROM party').get().data).value, 'after migration');
  } finally { recovered?.close(); database.close(); }
}));
