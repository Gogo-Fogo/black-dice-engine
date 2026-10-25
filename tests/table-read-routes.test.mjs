import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir, writeFile, unlink, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const extension = directory === 'dist' ? 'js' : 'ts';
const { buildSessionSummaryMarkdown, sanitizeFilePart } = await import(`../services/game-server/${directory}/session-summary.${extension}`);

test('table reads preserve compact roll compatibility, authenticated projections and host-only export side effects', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const host = await server.hostToken();
    const request = async (path, token = host, body) => fetch(server.base + path, {
      method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000)
    });
    const paths = ['/api/party', '/api/rolls', '/api/session-snapshot', '/api/runtime-status', '/api/session-summary.md'];
    for (const path of paths) assert.equal((await request(path, '')).status, 401);
    const initial = await (await request('/api/session-snapshot')).json();
    const joined = await request('/api/session/join', '', { code: initial.tablePin, label: 'Demo Finch' });
    assert.equal(joined.status, 201); const player = await joined.json();
    const displayResponse = await request('/api/session/display', host, {});
    assert.equal(displayResponse.status, 201); const display = await displayResponse.json();
    const created = await request('/api/characters', host, { requestId: 'demo-private-character', name: 'Demo Locksmith', classLabel: 'Tinker', notes: ['PRIVATE_READ_ROUTE_CANARY'] });
    assert.equal(created.status, 201);
    const rolled = await request('/api/rolls', host, { requestId: 'demo-compact-roll', actorId: initial.party[0].id, actorName: initial.party[0].name, dice: 'd6' });
    assert.equal(rolled.status, 201);
    const snapshot = await (await request('/api/session-snapshot')).json();
    assert.ok(snapshot.rollLog[0]);
    const expected = snapshot.rollLog.slice(0, 20).map(value => ({ name: value.actorName, dice: value.dice, modifier: value.modifier,
      total: value.total, note: value.note, time: value.timestamp }));
    const summaryDirectory = resolve(server.folder, 'exports', 'session-summaries');
    const files = async () => readdir(summaryDirectory).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const beforeFiles = await files();
    for (const token of [host, player.token, display.token]) {
      const history = await request('/api/rolls', token);
      assert.equal(history.status, 200); assert.equal(history.headers.get('cache-control'), 'no-store');
      const body = await history.json(); assert.deepEqual(body, expected);
      assert.deepEqual(Object.keys(body[0]).sort(), ['dice', 'modifier', 'name', 'note', 'time', 'total']);
      const party = await (await request('/api/party', token)).json();
      assert.deepEqual(party, snapshot.party.map(character => ({ name: character.name, classLabel: character.classLabel,
        hp: character.hp, claimedByLabel: character.claimedByLabel || 'unclaimed' })));
      for (const character of party) assert.deepEqual(Object.keys(character).sort(), ['claimedByLabel', 'classLabel', 'hp', 'name']);
      assert.equal((await request('/api/runtime-status', token)).status, 200);
    }
    for (const token of [player.token, display.token]) {
      const projected = await (await request('/api/session-snapshot', token)).json();
      assert.equal(projected.campaignBible, undefined); assert.equal(projected.tablePin, undefined);
      assert.doesNotMatch(JSON.stringify(projected), /PRIVATE_READ_ROUTE_CANARY/);
      const response = await request('/api/session-summary.md', token);
      assert.equal(response.status, 200); assert.equal(response.headers.get('x-export-path'), null);
      assert.equal(response.headers.get('content-disposition'), null);
      const markdown = await response.text();
      assert.doesNotMatch(markdown, /PRIVATE_READ_ROUTE_CANARY|Table PIN|Pending Approval Queue|Presence Snapshot/);
      assert.deepEqual(await files(), beforeFiles);
    }
    // A blocked export path affects only the host export, never a projected non-host summary.
    await mkdir(resolve(server.folder, 'exports'), { recursive: true });
    await writeFile(summaryDirectory, 'synthetic export-path obstruction');
    const failed = await request('/api/session-summary.md');
    assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { error: 'The server could not complete this request.' });
    assert.equal((await request('/api/session-summary.md', player.token)).status, 200);
    await unlink(summaryDirectory);
    const exported = await request('/api/session-summary.md');
    assert.equal(exported.status, 200); assert.match(exported.headers.get('content-type'), /text\/markdown/);
    const exportPath = exported.headers.get('x-export-path');
    assert.ok(resolve(exportPath).startsWith(summaryDirectory + sep));
    assert.match(exported.headers.get('content-disposition'), /^attachment; filename="[a-z0-9-]+\.md"$/);
    const markdown = await exported.text(); assert.match(markdown, /PRIVATE_READ_ROUTE_CANARY/);
    assert.equal(await readFile(exportPath, 'utf8'), markdown);
    assert.match(markdown, new RegExp(`Export file hint: ${exportPath.split(/[\\/]/).at(-1).replaceAll('.', '\\.')}`));
  }, { profile: 'party' });
});

test('summary formatter keeps deterministic host sections and safe filename parts without mutating its inputs', () => {
  const snapshot = { campaignTitle: 'Demo ../../ Brass Bell', currentScene: 'Demo tower', tablePin: 'DEMO1234', joinUrl: 'http://127.0.0.1/demo',
    party: [{ name: 'Finch', classLabel: 'Tinker', hp: { current: 3, max: 5 }, armorClass: 12, conditions: ['tired'], claimedByLabel: 'Seat 1',
      resources: [{ label: 'Sparks', current: 1, max: 2 }], inventory: [{ name: 'Key', quantity: 2, detail: 'brass' }], notes: ['HOST_DEMO_NOTE'] }],
    rollLog: [{ timestamp: '2026-01-01T00:00:00Z', actorName: 'Finch', total: 5, rolled: 4, modifier: 1, note: 'Demo latch' }],
    eventLog: [{ timestamp: '2026-01-01T00:00:00Z', category: 'state', summary: 'Demo setback', actor: { label: 'Host' }, visibility: 'gm_only' }],
    approvalQueue: [{ createdAt: '2026-01-01T00:00:00Z', summary: 'Demo proposal', submittedBy: { label: 'Seat 1' } }] };
  const runtime = { status: 'ok', mode: 'fast', clients: [{ role: 'player', playerLabel: 'Seat 1', clientId: 'demo', status: 'active', lastSeenAt: '2026-01-01T00:00:00Z' }] };
  const before = structuredClone({ snapshot, runtime });
  const text = buildSessionSummaryMarkdown(snapshot, runtime, '2026-01-02T00:00:00Z');
  assert.equal(text, buildSessionSummaryMarkdown(snapshot, runtime, '2026-01-02T00:00:00Z'));
  for (const expected of ['HP: 3/5', 'AC: 12', 'Conditions: tired', 'Sparks 1/2', 'Key x2 (brass)', 'HOST_DEMO_NOTE',
    'Finch rolled 5 (4 + 1)', 'Demo setback', 'Demo proposal', 'Seat 1 - active', 'demo-brass-bell-session-summary-2026-01-02.md']) assert.ok(text.includes(expected), expected);
  assert.deepEqual({ snapshot, runtime }, before);
  const empty = buildSessionSummaryMarkdown({ ...snapshot, party: [], rollLog: [], eventLog: [], approvalQueue: [] }, { ...runtime, clients: [] }, '2026-01-02T00:00:00Z');
  for (const expected of ['No rolls recorded.', 'No table events recorded.', 'No queued state changes.', 'No connected clients.']) assert.ok(empty.includes(expected));
  assert.equal(sanitizeFilePart('../Demo\\/ Brass Bell?'), 'demo-brass-bell');
});
