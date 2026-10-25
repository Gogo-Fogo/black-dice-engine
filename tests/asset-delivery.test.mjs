import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile, rm, symlink, open } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const built = process.env.BDE_TEST_BUILT === '1';
const { createAssetDelivery } = await import(`../services/game-server/${built ? 'dist/asset-delivery.js' : 'src/asset-delivery.ts'}`);
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]); // Envelope only; never decoded.
const asset = (id, visibility = 'public_demo') => ({ id, campaignId: 'demo', kind: 'image', visibility, status: 'generated', metadata: {} });

test('asset delivery reads only matching typed records inside configured roots', async () => {
  const root = resolve('tmp'); await mkdir(root, { recursive: true }); const folder = await mkdtemp(resolve(root, 'assets-'));
  try {
    const media = resolve(folder, 'media'); await mkdir(media);
    const file = resolve(media, 'demo.png'); await writeFile(file, png);
    const read = createAssetDelivery([media]); assert.equal((await read({ ...asset('demo'), localPath: file })).type, 'image/png');
    for (const [name, bytes, kind] of [['evil.svg', Buffer.from('<svg>private</svg>'), 'image'], ['bad.png', Buffer.from('PRIVATE_BAD_BYTES'), 'image'], ['wrong.png', png, 'audio']]) {
      const path = resolve(media, name); await writeFile(path, bytes);
      await assert.rejects(read({ ...asset('demo'), localPath: path, kind }), error => error.status === 404 && !error.message.includes('PRIVATE'));
    }
    const outside = resolve(folder, 'outside.png'); await writeFile(outside, png);
    for (const localPath of [outside, 'relative.png', resolve(media, 'missing.png')]) await assert.rejects(read({ ...asset('demo'), localPath }), error => error.status === 404);
    await assert.rejects(createAssetDelivery([])({ ...asset('demo'), localPath: file }), error => error.status === 404);
    const outsideDir = resolve(folder, 'outside'); await mkdir(outsideDir); await writeFile(resolve(outsideDir, 'demo.png'), png);
    await symlink(outsideDir, resolve(media, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(read({ ...asset('demo'), localPath: resolve(media, 'escape', 'demo.png') }), error => error.status === 404);
    const huge = resolve(media, 'huge.png'), handle = await open(huge, 'w'); await handle.truncate(64 * 1024 * 1024 + 1); await handle.close();
    await assert.rejects(read({ ...asset('demo'), localPath: huge }), error => error.status === 404);
  } finally { assert.ok(folder.startsWith(root + sep)); await rm(folder, { recursive: true, force: true }); }
});

test('actual approval and content routes enforce durable approval, visibility, credentials and no raw directory access', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken(), path = resolve(server.folder, 'media', 'demo.png'); await writeFile(path, png);
    const rows = [asset('public'), asset('players', 'player_visible'), asset('private', 'gm_only')];
    const db = new Database(resolve(server.folder, 'demo.db'));
    for (const row of rows) { row.localPath = path; db.prepare('INSERT INTO asset_records(id,data,status) VALUES(?,?,?)').run(row.id, JSON.stringify(row), row.status); }
    await server.restart();
    const api = (path, credential = token, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(credential ? { authorization: `Bearer ${credential}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(3000) });
    try {
      const initial = await (await api('/api/session-snapshot')).json();
      const player = await (await api('/api/session/join', '', { code: initial.tablePin, label: 'Demo asset viewer' })).json();
      const display = await (await api('/api/session/display', token, {})).json();
      assert.equal((await api('/api/assets/public/content')).status, 404);
      assert.equal((await api('/api/assets/public/approve', player.token, {})).status, 403);
      db.exec("CREATE TRIGGER fail_asset_approval BEFORE INSERT ON asset_records BEGIN SELECT RAISE(ABORT, 'synthetic approval failure'); END");
      assert.equal((await api('/api/assets/public/approve', token, {})).status, 503);
      assert.equal((await api('/api/assets/public/content')).status, 404);
      db.exec('DROP TRIGGER fail_asset_approval');
      for (const row of rows) assert.equal((await api(`/api/assets/${row.id}/approve`, token, {})).status, 200);
      for (const [id, credential, expected] of [['public', player.token, 200], ['players', player.token, 200], ['private', player.token, 404], ['public', display.token, 200], ['players', display.token, 404], ['private', token, 200], ['public', '', 401]]) {
        const response = await api(`/api/assets/${id}/content`, credential); assert.equal(response.status, expected);
        if (expected === 200) { assert.equal(response.headers.get('content-type'), 'image/png'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png); }
      }
      assert.equal((await api('/images/demo.png')).status, 404);
      const gallery = await (await api('/api/images')).json(); assert.equal(gallery.images.length, 3); assert.ok(gallery.images.every(value => value.url.startsWith('/api/assets/')));
      const visible = await (await api('/api/assets', player.token)).json(); assert.equal(visible.assets.length, 2); assert.doesNotMatch(JSON.stringify(visible), /localPath|metadata|prompt|media\\/);
      assert.equal((await api('/api/assets/private/preview', player.token)).status,403);
      assert.equal((await api('/api/assets/private/preview', token)).status,200);
      assert.equal((await api('/api/assets/private/approve',token,{share:true})).status,200);
      assert.equal((await api('/api/assets/private/content',player.token)).status,200);
      const shared=await (await api('/api/images',player.token)).json(); assert.equal(shared.images.length,3);
      await server.restart(); assert.equal((await api('/api/assets/public/content', player.token)).status, 200);
    } finally { db.close(); }
  }, { mediaFixture: true });
});
