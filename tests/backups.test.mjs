import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, writeFile, appendFile, copyFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const built = process.env.BDE_TEST_BUILT === '1';
const { openGameStore } = await import(`../services/game-server/${built ? 'dist/db.js' : 'src/db.ts'}`);
const { createBackups } = await import(`../services/game-server/${built ? 'dist/backups.js' : 'src/backups.ts'}`);
async function fixture(run) {
  const root = resolve('tmp'); await mkdir(root, { recursive: true });
  const folder = await mkdtemp(resolve(root, 'backup-check-')), source = resolve(folder, 'live.db');
  const store = openGameStore(source), directory = resolve(folder, 'snapshots');
  try { await run({ folder, source, store, directory, owner: createBackups(store.database, { directory, source }) }); }
  finally { store.close(); assert.ok(folder.startsWith(root + sep)); await rm(folder, { recursive: true, force: true }); }
}

test('online snapshot includes live WAL data, shares creation and restores only into a disposable copy', async () => fixture(async ({ folder, source, store, directory, owner }) => {
  store.database.pragma('wal_autocheckpoint = 0');
  store.setMeta('demo', 'before');
  const first = owner.create('Synthetic rehearsal'), shared = owner.create('Second caller'); assert.equal(first, shared);
  const record = await first; assert.equal(record.note, 'Synthetic rehearsal'); assert.ok(record.sizeBytes > 0);
  assert.equal(record.sourceDbPath, undefined); assert.match(record.sha256, /^[a-f0-9]{64}$/);
  const snapshot = resolve(directory, record.id, 'snapshot.db'), manifest = JSON.parse(await readFile(resolve(directory, record.id, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceDbPath, source); assert.deepEqual(await owner.validate(record.id), { valid: true, backup: record });
  store.setMeta('demo', 'after');
  const restoredPath = resolve(folder, 'disposable-restored.db'); await copyFile(snapshot, restoredPath);
  const restored = openGameStore(restoredPath);
  try { assert.equal(restored.getMeta('demo'), 'before'); } finally { restored.close(); }
  assert.equal(store.getMeta('demo'), 'after', 'Live database was never replaced');
  assert.equal((await owner.list()).backups.length, 1); await owner.drain();
}));

test('backup validation rejects modified bytes and incompatible schema without touching the live store', async () => fixture(async ({ store, directory, owner }) => {
  store.setMeta('demo', 'unchanged');
  const record = await owner.create(), path = resolve(directory, record.id, 'snapshot.db');
  await appendFile(path, 'synthetic corruption');
  await assert.rejects(owner.validate(record.id), error => error.status === 409);
  const second = await owner.create(), secondPath = resolve(directory, second.id, 'snapshot.db');
  const copy = new Database(secondPath); copy.pragma('user_version = 999'); copy.close();
  const bytes = await readFile(secondPath), manifestPath = resolve(directory, second.id, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')); manifest.sha256 = createHash('sha256').update(bytes).digest('hex'); manifest.sizeBytes = bytes.length;
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(owner.validate(second.id), error => error.status === 409 && !error.message.includes(directory));
  assert.equal(store.getMeta('demo'), 'unchanged');
}));

test('backup manifests reject traversal, malformed records and oversized notes; failed creation never reports success', async () => fixture(async ({ store, source, directory, owner }) => {
  assert.deepEqual(await owner.list(), { backups: [], invalidCount: 0, limit: 100 });
  for (const id of ['../live.db', '', 'backup-private']) await assert.rejects(owner.validate(id), error => error.status === 400);
  await assert.rejects(owner.create('x'.repeat(201)), error => error.status === 400);
  const record = await owner.create(); await writeFile(resolve(directory, record.id, 'manifest.json'), 'PRIVATE_BROKEN_MANIFEST');
  assert.equal((await owner.list()).invalidCount, 1); await assert.rejects(owner.validate(record.id), error => !error.message.includes('PRIVATE'));
  const blocked = resolve(directory, 'not-a-directory'); await writeFile(blocked, 'Synthetic file');
  const invalid = createBackups(store.database, { source, directory: blocked });
  await assert.rejects(invalid.create(), error => error.status === 503 && !error.message.includes(blocked));
  assert.equal(await readFile(blocked, 'utf8'), 'Synthetic file');
}));

test('authenticated backup endpoints create/validate persistent snapshots and deny players with path-safe errors', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const api = (path, body, credential = token) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) });
    const snapshot = await (await api('/api/session-snapshot')).json();
    const player = await (await api('/api/session/join', { code: snapshot.tablePin, label: 'Demo backup observer' }, '')).json();
    assert.equal((await api('/api/backup', {}, player.token)).status, 403);
    assert.equal((await api('/api/backups', undefined, player.token)).status, 403);
    const created = await api('/api/backup', { note: 'Demo online snapshot' }); assert.equal(created.status, 200);
    const body = await created.json(); assert.equal(body.ok, true); assert.equal(body.backup.sourceDbPath, undefined); assert.ok(body.backup.sha256);
    assert.equal((await api(`/api/backups/${body.backup.id}/validate`, {}, player.token)).status, 403);
    const validation = await (await api(`/api/backups/${body.backup.id}/validate`, {})).json(); assert.equal(validation.valid, true);
    await server.restart();
    const listed = await (await api('/api/backups')).json(); assert.equal(listed.backups[0].id, body.backup.id);
    const failed = await api('/api/backups/unknown/validate', {}); assert.equal(failed.status, 400); assert.doesNotMatch(JSON.stringify(await failed.json()), /[A-Z]:\\\\|PRIVATE|stack/);
  });
});


test('automatic process start/end snapshots include final state and shutdown waits for publication', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = (await server.hostToken()).trim();
    const api = (path, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) });
    let listed;
    for (let tries = 0; tries < 100; tries++) {
      listed = await (await api('/api/backups')).json();
      if (listed.backups.length) break;
      await new Promise(done => setTimeout(done, 10));
    }
    assert.equal(listed.backups.length, 1);
    assert.equal(listed.backups[0].note, 'Automatic session-start backup');
    assert.equal((await (await api(`/api/backups/${listed.backups[0].id}/validate`, {})).json()).valid, true);
    const scene = await (await api('/api/scene-packet')).json();
    const queued = await api('/api/scene-packet/queue-audio', scene.packet); assert.equal(queued.status, 200);
    await server.shutdown();
    const directory = resolve(server.folder, 'backups'), ids = await readdir(directory);
    assert.equal(ids.length, 2);
    const records = await Promise.all(ids.map(async id => JSON.parse(await readFile(resolve(directory, id, 'manifest.json'), 'utf8'))));
    const end = records.find(record => record.note === 'Automatic session-end backup'); assert.ok(end);
    const database = new Database(resolve(directory, end.id, 'snapshot.db'), { readonly: true });
    try { assert.ok(database.prepare('SELECT COUNT(*) AS count FROM audio_cues').get().count > 0); }
    finally { database.close(); }
    assert.doesNotMatch(server.diagnostics(), /Automatic backup failed|Shutdown could not save/);
  }, { automaticBackups: true, gracefulStop: true });
});

test('failed automatic startup backup warns without preventing play and a successful manual retry clears it', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = (await server.hostToken()).trim();
    const api = (path, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) });
    for (let tries = 0; !server.diagnostics().includes('Automatic backup failed') && tries < 100; tries++) await new Promise(done => setTimeout(done, 10));
    assert.match(server.diagnostics(), /Automatic backup failed/);
    assert.match(JSON.stringify(await (await api('/api/runtime-status')).json()), /Automatic backup failed/);
    assert.equal((await api('/api/session-snapshot')).status, 200);
    assert.equal((await api('/api/backup', {})).status, 503);
    const path = resolve(server.folder, 'backups');
    assert.equal(await readFile(path, 'utf8'), 'Synthetic blocked backup destination');
    await rm(path); // Only this test's own synthetic obstruction.
    assert.equal((await api('/api/backup', {})).status, 200);
    assert.doesNotMatch(JSON.stringify(await (await api('/api/runtime-status')).json()), /Automatic backup failed/);
  }, { automaticBackups: true, blockedBackups: true });
});

test('runtime backup facade requires and forwards host credentials to the live database owner', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const preload = resolve(server.folder, 'runtime-fetch-guard.mjs');
    await writeFile(preload, `const original = globalThis.fetch; globalThis.fetch = (url, init) => { if (!String(url).startsWith(${JSON.stringify(server.base + '/api/back')})) throw new Error('Unexpected runtime request'); return original(url, init); };`);
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(env, { BDE_HOST: '127.0.0.1', BDE_RUNTIME_SERVICE_PORT: '0', BDE_GAME_SERVER_ENDPOINT: server.base });
    const child = spawn(process.execPath, [...(built ? [] : ['--import', 'tsx']), '--import', pathToFileURL(preload).href,
      built ? './services/runtime-service/dist/index.js' : './services/runtime-service/src/index.ts'], { cwd: resolve('.'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(child, 'exit'); let output = '';
    child.stderr.on('data', chunk => { output += chunk; });
    try {
      const base = await new Promise((accept, reject) => {
        const timer = setTimeout(() => reject(new Error('Synthetic runtime startup timeout')), 5000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', () => { clearTimeout(timer); reject(new Error('Synthetic runtime exited')); });
        child.stdout.on('data', chunk => { output += chunk; const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/); if (match) { clearTimeout(timer); accept(match[1]); } });
      });
      const call = (path, token, body) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) });
      assert.equal((await call('/api/backup', '', {})).status, 401);
      assert.equal((await call('/api/backup', 'synthetic-invalid', {})).status, 401);
      const token = await server.hostToken(), created = await call('/api/backup', token, { note: 'Demo delegated snapshot' });
      assert.equal(created.status, 200); const record = (await created.json()).backup;
      assert.equal((await (await call('/api/backups', token)).json()).backups[0].id, record.id);
      assert.equal((await (await call(`/api/backups/${record.id}/validate`, token, {})).json()).valid, true);
      const health = await (await fetch(base + '/health')).json(); assert.equal(health.dbPath, undefined); assert.equal(health.backupsDir, undefined);
      assert.doesNotMatch(output, /Unexpected runtime request/);
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; }
  });
});
