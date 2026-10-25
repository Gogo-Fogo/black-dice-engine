import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const entry = new URL(process.env.BDE_TEST_BUILT === '1' ? '../services/game-server/dist/db.js' : '../services/game-server/src/db.ts', import.meta.url);
const modulePromise = import(entry.href);

test('legacy persistence isolates data and rolls back a failed table replacement', async () => {
  const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(resolve(temporaryRoot, 'persistence-'));
  let persistence;
  try {
    const { openGameStore } = await modulePromise;
    persistence = openGameStore(resolve(folder, 'synthetic.db'));
    const character = { id: 'demo-seat-1', name: 'Clockwork Sparrow', hp: { current: 8, max: 8 } };
    persistence.saveTable('party', [character]);
    assert.deepEqual(persistence.loadTable('party'), [character]);
    const cyclic = { id: 'invalid' };
    cyclic.self = cyclic;
    assert.throws(() => persistence.saveTable('party', [cyclic]), /circular/i);
    assert.deepEqual(persistence.loadTable('party'), [character], 'DELETE and INSERT must roll back together');
    const roll = { id: 'demo-roll-1', timestamp: '2026-01-01T00:00:00.000Z', total: 4 };
    persistence.saveRollLog([roll]);
    assert.deepEqual(persistence.loadRollLog(), [roll]);
    persistence.setMeta('demo', 'isolated');
    assert.equal(persistence.getMeta('demo'), 'isolated');
    assert.equal(persistence.getMeta('absent'), null);
    assert.equal(resolve(persistence.database.name), resolve(folder, 'synthetic.db'));
  } finally {
    persistence?.close();
    assert.ok(resolve(folder).startsWith(resolve(temporaryRoot) + sep));
    await rm(folder, { recursive: true, force: true });
  }
});


test('database module import performs no configuration read or filesystem initialization', async () => {
  const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(resolve(temporaryRoot, 'persistence-import-'));
  const keys = ['BDE_DB_PATH', 'BDE_GAME_SERVER_PORT'];
  const previous = keys.map(key => process.env[key]);
  try {
    process.env.BDE_DB_PATH = resolve(folder, 'must-not-create', 'ignored.db');
    process.env.BDE_GAME_SERVER_PORT = 'invalid-import-canary';
    // A fresh module URL is intentional: the preceding repository test may have imported the module.
    await import(entry.href + '?import-safety');
    assert.deepEqual(await readdir(folder), []);
    const { openGameStore } = await modulePromise;
    assert.throws(() => openGameStore('relative.db'), /absolute/);
    assert.deepEqual(await readdir(folder), []);
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
    assert.ok(resolve(folder).startsWith(resolve(temporaryRoot) + sep));
    await rm(folder, { recursive: true, force: true });
  }
});

test('injected repositories isolate connections and preserve caller-owned transaction rollback', async () => {
  const { createLegacyRepository } = await modulePromise;
  const first = new Database(':memory:'), second = new Database(':memory:');
  try {
    const a = createLegacyRepository(first), b = createLegacyRepository(second);
    a.initDb(); b.initDb();
    a.setMeta('room', 'first'); b.setMeta('room', 'second');
    assert.equal(a.getMeta('room'), 'first'); assert.equal(b.getMeta('room'), 'second');
    const saved = { id: 'original', timestamp: '2026-01-01' };
    a.saveRollLog([saved]); a.saveTable('party', [{ id: 'original-seat' }]);
    assert.throws(first.transaction(() => {
      a.saveRollLog([{ id: 'discarded', timestamp: '2026-01-02' }]);
      a.saveTable('party', [{ id: 'discarded-seat' }]); a.setMeta('room', 'discarded');
      throw new Error('synthetic outer transaction failure');
    }), /outer transaction failure/);
    assert.deepEqual(a.loadRollLog(), [saved]); assert.deepEqual(a.loadTable('party'), [{ id: 'original-seat' }]);
    assert.equal(a.getMeta('room'), 'first'); assert.deepEqual(b.loadRollLog(), []);
    assert.equal(first.open, true); assert.equal(second.open, true);
  } finally { first.close(); second.close(); }
});

test('explicit store close is idempotent and reopen preserves all legacy table formats and ordering', async () => {
  const { openGameStore } = await modulePromise;
  const temporaryRoot = fileURLToPath(new URL('../tmp/', import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(resolve(temporaryRoot, 'persistence-reopen-'));
  const path = resolve(folder, 'nested', 'demo.db');
  let store;
  try {
    store = openGameStore(path);
    assert.equal(store.database.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(store.database.pragma('synchronous', { simple: true }), 2);
    const earlier = { id: 'earlier', timestamp: '2026-01-01', createdAt: '2026-01-01', status: 'queued' };
    const later = { id: 'later', timestamp: '2026-01-02', createdAt: '2026-01-02', status: 'queued' };
    const pairs = [['saveRollLog', 'loadRollLog'], ['saveEventLog', 'loadEventLog'], ['saveMediaJobs', 'loadMediaJobs'],
      ['saveMemoryEntries', 'loadMemoryEntries'], ['saveApprovalQueue', 'loadApprovalQueue'], ['saveAudioCues', 'loadAudioCues']];
    for (const [save] of pairs) store[save]([earlier, later]);
    store.saveTable('party', [{ id: 'seat' }]); store.saveTable('asset_records', [{ id: 'asset', status: 'generated' }]); store.setMeta('demo', 'retained');
    assert.equal(store.database.prepare('SELECT status FROM asset_records').get().status, 'generated');
    assert.throws(() => store.saveTable('asset_records', [{ id: 'invalid' }]), /NOT NULL/);
    assert.throws(() => store.saveTable('meta; DELETE FROM party', []), /Unsupported JSON table/);
    assert.throws(() => store.loadTable('meta'), /Unsupported JSON table/);
    store.close(); store.close(); assert.equal(store.database.open, false);
    store = openGameStore(path);
    for (const [, load] of pairs) assert.deepEqual(store[load](), [later, earlier]);
    assert.deepEqual(store.loadTable('party'), [{ id: 'seat' }]); assert.deepEqual(store.loadTable('asset_records'), [{ id: 'asset', status: 'generated' }]);
    assert.equal(store.getMeta('demo'), 'retained');
  } finally {
    store?.close();
    assert.ok(resolve(folder).startsWith(resolve(temporaryRoot) + sep));
    await rm(folder, { recursive: true, force: true });
  }
});
