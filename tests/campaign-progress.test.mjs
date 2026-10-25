import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
import { isCampaignProgress, isProgressCommand, progressKinds, progressStatuses } from '../packages/contracts/dist/index.js';
import { loadCampaignProgress, applyProgressCommand, recordActionResolution } from '../services/game-server/src/campaign-progress.ts';
import { buildAiSceneContext } from '../services/game-server/src/ai-context.ts';

const record = { operation: 'record', kind: 'objective', title: 'Obtain the demo archive key', detail: 'The key opens the archive.',
  status: 'completed', resolution: 'The party has the key and can open the archive.', visibility: 'player_visible' };

test('progress validates inputs, keeps a correction audit, and refuses to silently discard corrupt storage', async () => {
  assert.ok(isProgressCommand(record));
  for (const change of [{ status: 'invented' }, { visibility: 'everyone' }, { title: ' ' }, { resolution: '' }, { detail: 123 },
    { title: 'x'.repeat(161) }, { extra: 'untrusted' }, { kind: 'scene', detail: '' }]) assert.equal(isProgressCommand({ ...record, ...change }), false);
  const state = loadCampaignProgress(null, 'demo');
  applyProgressCommand(state, record, '2026-10-25T00:00:00Z');
  assert.ok(isCampaignProgress(state));
  const entry = state.entries[0];
  assert.throws(() => applyProgressCommand(state, { ...record, id: entry.id, status: 'active' }, entry.updatedAt), /requires a reason/);
  applyProgressCommand(state, { ...record, id: entry.id, status: 'active', reason: 'GM correction: this was a copy, not the key.' }, entry.updatedAt);
  assert.equal(state.history[0].entry.status, 'completed');
  assert.match(state.history[0].reason, /GM correction/);
  assert.deepEqual(loadCampaignProgress(JSON.stringify(state), 'demo'), state);
  assert.throws(() => loadCampaignProgress('{}', 'demo'), /Invalid campaign progress/);
  assert.throws(() => loadCampaignProgress(JSON.stringify(state), 'other-campaign'), /Invalid campaign progress/);
  const schema = JSON.parse(await readFile(new URL('../packages/shared-schemas/campaign-progress-command.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.oneOf[0].properties.kind.enum, [...progressKinds]);
  assert.deepEqual(schema.oneOf[0].properties.status.enum, [...progressStatuses]);
});

test('unknown DC stays unresolved, duplicate actions do not count twice, and pacing flags after three actions', () => {
  const state = loadCampaignProgress(null, 'demo');
  const roll = { id: 'roll', actorId: 'demo', actorName: 'Demo', total: 19 };
  const action = { id: 'action-0', type: 'ability', description: 'Demo attempt', ability: 'wis', dc: null };
  for (let i = 0; i < 3; i++) recordActionResolution(state, { ...action, id: `action-${i}` }, [roll], '2026-10-25');
  recordActionResolution(state, action, [roll], '2026-10-25');
  assert.equal(state.actionsSinceProgress, 3); assert.equal(state.actions.length, 3);
  assert.equal(state.actions[0].participants[0].success, null);
  applyProgressCommand(state, { operation: 'consequence', actionId: action.id, consequence: 'The route opens at a cost.', visibility: 'gm_only' }, '2026-10-25');
  assert.equal(state.actionsSinceProgress, 0);
});

test('AI context includes confirmed memory and old resolved gates without leaking private sources', () => {
  const state = loadCampaignProgress(null, 'demo');
  applyProgressCommand(state, { ...record, visibility: 'public_demo' }, '2026-10-25');
  for (let i = 0; i < 25; i++) applyProgressCommand(state, { ...record, title: `PRIVATE_LEDGER_${i}`, visibility: 'gm_only' }, '2026-10-25');
  const snapshot = { campaignId: 'demo', campaignTitle: 'Demo', currentScene: 'Archive', campaignBible: { visibility: 'gm_only' },
    activeSceneContext: { facts: [], tone: [], location: null }, party: [], eventLog: [], campaignProgress: state,
    memoryEntries: ['confirmed', 'proposed', 'rejected', 'superseded'].map(status => ({ id: status, campaignId: 'demo', kind: 'campaign_fact', status,
      visibility: 'public_demo', summary: `${status}_MEMORY`, source: { sourcePath: 'PRIVATE_PATH' } })) };
  const pub = buildAiSceneContext(snapshot, 'public_demo');
  assert.match(JSON.stringify(pub), /confirmed_MEMORY/);
  assert.match(JSON.stringify(pub), /party has the key/);
  assert.doesNotMatch(JSON.stringify(pub), /PRIVATE|proposed_MEMORY|rejected_MEMORY|superseded_MEMORY/);
  const gm = buildAiSceneContext(snapshot, 'gm_only');
  assert.match(JSON.stringify(gm), /PRIVATE_LEDGER_24/);
  assert.equal(gm.sources.filter(s => s.source === 'progress').length, 26);
});

test('real commands persist goals, group outcomes and approved consequences with rollback, replay and audience filtering', { timeout: 25000 }, async () => {
  const proposal = { action: 'Open the demo archive', skill: 'Investigation', difficulty: 'easy', description: 'Use the earned key.', consequences: 'Reach the archive.' };
  await withIsolatedServer(async server => {
    const host = await server.hostToken(); let sequence = 0;
    const api = async (path, body, token = host) => {
      const res = await fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
      return { status: res.status, body: await res.json() };
    };
    const snap = async token => (await api('/api/session-snapshot', undefined, token)).body;
    const initial = await snap();
    const players = [], characters = [];
    for (let i = 0; i < 2; i++) {
      players.push((await api('/api/session/join', { code: initial.tablePin, label: `Demo Finch ${i}` }, '')).body);
      characters.push((await api('/api/characters', { requestId: `progress-create-${i}`, name: `Demo Tinker ${i}`, classLabel: 'Tinker' })).body);
      assert.equal((await api('/api/claim-character', { requestId: `progress-claim-${i}`, characterId: characters[i].id }, players[i].token)).status, 200);
    }
    const command = { ...record, requestId: 'progress-key' };
    assert.equal((await api('/api/campaign-progress', command, players[0].token)).status, 403);
    assert.equal((await api('/api/campaign-progress', { ...command, resolution: '' })).status, 400);
    const before = await snap();
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER fail_progress BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic progress failure'); END");
      assert.equal((await api('/api/campaign-progress', command)).status, 503);
      assert.deepEqual(await snap(), before);
      db.exec('DROP TRIGGER fail_progress');
    } finally { db.close(); }
    const accepted = await api('/api/campaign-progress', command);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await api('/api/campaign-progress', command), accepted);
    const goalId = accepted.body.sessionSnapshot.campaignProgress.entries[0].id;
    assert.equal((await api('/api/campaign-progress', { ...record, id: goalId, status: 'active', requestId: 'bad-reopen' })).status, 409);
    assert.equal((await api('/api/campaign-progress', { ...record, title: 'PRIVATE_PROGRESS_CANARY', visibility: 'gm_only', requestId: 'private-goal' })).status, 200);
    assert.equal((await api('/api/campaign-progress', { ...record, title: 'PUBLIC_PROGRESS_CANARY', visibility: 'public_demo', requestId: 'public-goal' })).status, 200);
    const display = (await api('/api/session/display', {})).body;
    const playerView = await snap(players[0].token), displayView = await snap(display.token);
    assert.match(JSON.stringify(playerView.campaignProgress), /archive key/);
    assert.doesNotMatch(JSON.stringify(playerView), /PRIVATE_PROGRESS_CANARY/);
    assert.match(JSON.stringify(displayView.campaignProgress), /PUBLIC_PROGRESS_CANARY/);
    assert.doesNotMatch(JSON.stringify(displayView.campaignProgress), /archive key|PRIVATE_PROGRESS_CANARY/);
    assert.ok(isCampaignProgress(playerView.campaignProgress));
    assert.ok(isCampaignProgress(displayView.campaignProgress));

    assert.equal((await api('/api/set-action', { requestId: 'progress-action', type: 'ability', description: 'Cross the demo bridge', ability: 'dex', dc: 20 })).status, 200);
    for (let i = 0; i < 2; i++) {
      const result = await api('/api/rolls', { requestId: `progress-roll-${i}`, actorId: characters[i].id, actorName: characters[i].name,
        dice: i === 0 ? '1d2+10' : '1d2+25', note: 'ability' }, players[i].token);
      assert.equal(result.status, 201); assert.equal(result.body.action.dc, 20); assert.equal(result.body.action.success, i === 1);
    }
    let inputs;
    for (let i = 0; i < 100; i++) {
      try { inputs = (await readFile(resolve(server.folder, 'synthetic-ai-inputs.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse); if (inputs.length) break; } catch {}
      await new Promise(done => setTimeout(done, 20));
    }
    assert.equal(inputs.length, 1);
    const narrationPrompt = JSON.stringify(inputs[0]);
    assert.match(narrationPrompt, /Demo Tinker 0/); assert.match(narrationPrompt, /Demo Tinker 1/);
    assert.match(narrationPrompt, /Complete group results/); assert.match(narrationPrompt, /success\\\":false/);
    const action = (await snap()).campaignProgress.actions.at(-1);
    assert.deepEqual(action.participants.map(p => p.success), [false, true]);
    assert.equal(action.consequence, '');
    assert.equal((await api('/api/ai/propose-action', {})).status, 200);
    inputs = (await readFile(resolve(server.folder, 'synthetic-ai-inputs.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.match(JSON.stringify(inputs[1]), /Demo Tinker 0: Cross the demo bridge -> failure/);
    assert.match(JSON.stringify(inputs[1]), /DC 20/); assert.match(JSON.stringify(inputs[1]), /party has the key/);
    const approve = { operation: 'consequence', actionId: action.id, consequence: 'The party crosses; the first tinker loses time helping recover a tool.', visibility: 'player_visible', requestId: 'approve-crossing' };
    assert.equal((await api('/api/campaign-progress', approve)).status, 200);
    assert.equal((await api('/api/campaign-progress', { ...approve, requestId: 'overwrite-crossing' })).status, 409);
    assert.match(JSON.stringify((await snap(players[0].token)).campaignProgress), /loses time/);
    assert.equal((await snap()).campaignProgress.actionsSinceProgress, 0);
    const scene = { ...record, kind: 'scene', title: 'Demo bridge', detail: 'Close when everyone reaches the far bank.', resolution: 'Everyone reached the far bank.', requestId: 'close-bridge' };
    assert.equal((await api('/api/campaign-progress', scene)).status, 200);
    assert.equal((await api('/api/set-action', { requestId: 'closed-scene-check', type: 'ability', dc: 20 })).status, 409);
    const saved = (await snap()).campaignProgress;
    await server.restart();
    assert.deepEqual((await snap()).campaignProgress, saved);
    assert.deepEqual(await api('/api/campaign-progress', command), accepted);
    assert.equal((await api('/api/set-scene', { title: 'Demo archive', requestId: `scene-${++sequence}` })).status, 200);
    assert.notEqual((await snap()).campaignProgress.sceneId, saved.sceneId);
    assert.equal((await snap()).campaignProgress.entries.find(e => e.id === goalId).status, 'completed');
    assert.equal((await api('/api/ai/narration-toggle', { requestId: 'unknown-no-ai', enabled: false })).status, 200);
    assert.equal((await api('/api/set-action', { requestId: 'unknown-dc', type: 'ability', description: 'Inspect the demo shelves', ability: 'int' })).status, 200);
    for (let i = 0; i < 2; i++) assert.equal((await api('/api/rolls', { requestId: `unknown-roll-${i}`, actorId: characters[i].id,
      actorName: characters[i].name, dice: '1d2+10', note: 'ability' }, players[i].token)).status, 201);
    assert.deepEqual((await snap()).campaignProgress.actions.at(-1).participants.map(p => p.success), [null, null]);
    assert.match((await api('/api/pending-narration')).body.text, /no DC set/);

  }, { aiReplies: ['The tinkers reach the far bank with mixed fortunes.', JSON.stringify(proposal)], aiDelayMs: 1, captureAiInput: true });
});

test('a selected campaign folder sets the opening scene, starts without demo heroes and seeds its ledger once', { timeout: 20000 }, async () => {
  const { withIsolatedServer } = await import('./helpers/isolated-server.mjs');
  const { fileURLToPath } = await import('node:url');
  const campaignDir = fileURLToPath(new URL('./fixtures/demo-campaign/', import.meta.url));
  await withIsolatedServer(async server => {
    const host = await server.hostToken();
    const get = async (path, token = host) => (await fetch(server.base + path, { headers: { authorization: `Bearer ${token}` } })).json();
    const snapshot = await get('/api/session-snapshot');
    assert.equal(snapshot.campaignTitle, 'Demo Fixture Campaign');
    assert.equal(snapshot.currentScene, 'Demo Mill Courtyard');
    assert.deepEqual(snapshot.party, []);
    assert.deepEqual(snapshot.campaignProgress.entries.map(entry => entry.title), ['Demo objective', 'Demo GM secret']);
    const player = await (await fetch(server.base + '/api/session/join', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: snapshot.tablePin, label: 'Demo Seeder' }) })).json();
    assert.ok(!JSON.stringify(await get('/api/session-snapshot', player.token)).includes('DEMO_GM_SECRET_CANARY'));
    await server.restart();
    assert.equal((await get('/api/session-snapshot')).campaignProgress.entries.length, 2, 'seed applies to a new ledger only');
  }, { campaignDir });
});
