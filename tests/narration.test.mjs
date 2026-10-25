import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const { createNarration } = await import(`../services/game-server/${directory}/narration.${directory === 'dist' ? 'js' : 'ts'}`);
const scope = () => ({ sessionId: 'demo', mode: 'ttrpg', roundId: null, stage: 'table', revision: 1 });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(generate) {
  let current = scope(), active = true;
  const timers = new Set();
  const owner = createNarration({ current: () => current, active: () => active, generate,
    timers: { after(callback) { timers.add(callback); return callback; }, clear(timer) { timers.delete(timer); } } });
  return { owner, timers, set: value => { current = value; }, stop: () => { active = false; } };
}
test('narration validates completions and preserves prepared fallback on errors or unusable text', async () => {
  for (const output of [{ text: '  Demo narration  ' }, { text: '', error: 'PRIVATE_PROVIDER_ERROR' }, { text: ' ' }, { text: 'x'.repeat(12001) }, null]) {
    const f = fixture(async () => output);
    const result = await f.owner.run('roll', {}, 'Prepared fallback');
    assert.equal(result.text, output?.text === '  Demo narration  ' ? 'Demo narration' : 'Prepared fallback');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_ERROR/);
    assert.equal(f.timers.size, 0);
  }
  const f = fixture(async () => { throw new Error('PRIVATE_PROVIDER_BODY'); });
  assert.deepEqual(await f.owner.run('draft', {}, 'Prepared fallback'), { status: 'fallback', text: 'Prepared fallback' });
  for (const deadlineMs of [0, -1, 1.5, 30001]) assert.throws(() => createNarration({ current: scope, active: () => true, generate: async () => ({ text: '' }), deadlineMs }));
});
test('deadline settles ignored abort and late body completion without retaining work', async () => {
  const completion = deferred(); let signal;
  const f = fixture(async (_input, supplied) => { signal = supplied; return completion.promise; });
  const pending = f.owner.run('roll', {}, 'Prepared');
  await Promise.resolve();
  [...f.timers][0]();
  assert.deepEqual(await pending, { status: 'fallback', text: 'Prepared' });
  assert.equal(signal.aborted, true); assert.equal(f.timers.size, 0);
  completion.resolve({ text: 'LATE_BODY' }); await Promise.resolve();
  assert.equal(f.timers.size, 0);
});
test('session, mode, round, stage and revision changes discard completions and abort stale work', async () => {
  for (const change of [{ sessionId: 'new-room' }, { mode: 'party' }, { roundId: 2 }, { stage: 'ending' }, { revision: 2 }]) {
    const completion = deferred(); let signal;
    const f = fixture(async (_input, supplied) => { signal = supplied; return completion.promise; });
    const pending = f.owner.run('roll', {}, 'Old fallback'); await Promise.resolve();
    f.set({ ...scope(), ...change }); f.owner.cancelStale();
    assert.deepEqual(await pending, { status: 'stale' }); assert.equal(signal.aborted, true);
    completion.resolve({ text: 'OLD_GENERATION' }); assert.equal(f.timers.size, 0);
  }
  const completion = deferred(), f = fixture(async () => completion.promise);
  const pending = f.owner.run('draft', {}, 'Old fallback'); await Promise.resolve();
  f.set({ ...scope(), revision: 9 }); completion.resolve({ text: 'OLD_GENERATION' });
  assert.deepEqual(await pending, { status: 'stale' }, 'Completion checks scope even without a broadcast cancellation');
});
test('replacement, caller cancellation and shutdown settle both slots and refuse late results', async () => {
  const completion = deferred(), f = fixture(async () => completion.promise);
  const first = f.owner.run('draft', {}, 'First');
  const replacement = f.owner.run('draft', {}, 'Second');
  assert.deepEqual(await first, { status: 'stale' });
  const controller = new AbortController();
  const other = f.owner.run('roll', {}, 'Other', controller.signal); controller.abort();
  assert.deepEqual(await other, { status: 'stale' });
  f.owner.dispose(); assert.deepEqual(await replacement, { status: 'stale' });
  assert.deepEqual(await f.owner.run('draft', {}, 'After stop'), { status: 'stale' });
  assert.equal(f.timers.size, 0); completion.resolve({ text: 'Late' });
});
test('actual drafts and automatic narration reject delayed results after commands and room reset', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    let token = await server.hostToken();
    const api = async (path, body) => {
      const response = await fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
      return { status: response.status, body: await response.json() };
    };
    const waitPending = async count => {
      for (let i = 0; i < 150; i++) {
        if (server.diagnostics().split('SYNTHETIC_NARRATION_PENDING').length - 1 >= count) return;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.fail('Synthetic narration was not requested');
    };
    const draft = api('/api/local-model/draft', {}); await waitPending(1);
    assert.equal((await api('/api/set-action', { requestId: 'draft-advance', type: 'ability', description: 'New demo action', ability: 'wis' })).status, 200);
    assert.equal((await draft).status, 409);
    const resetDraft = api('/api/local-model/draft', {}); await waitPending(2);
    const room = await api('/api/session/new-room', {}); assert.equal(room.status, 201); token = room.body.token;
    assert.equal((await resetDraft).status, 409);
    const sheet = (await api('/api/characters', { requestId: 'narration-sheet', name: 'Demo Bellkeeper', classLabel: 'Tinker' })).body;
    const own = (await api('/api/session/me')).body;
    assert.equal((await api('/api/claim-character', { requestId: 'narration-claim', clientId: own.actorId, characterId: sheet.id })).status, 200);
    assert.equal((await api('/api/set-action', { requestId: 'narration-action', type: 'ability', description: 'Prepared demo beat.', ability: 'wis' })).status, 200);
    assert.equal((await api('/api/rolls', { requestId: 'narration-roll', actorId: sheet.id, actorName: sheet.name, note: 'ability', dice: 'd2' })).status, 201);
    await waitPending(3);
    const prepared = await api('/api/pending-narration'); assert.ok(prepared.body.text.startsWith('Prepared demo beat.'));
    assert.equal((await api('/api/set-action', { requestId: 'narration-next', type: 'ability', description: 'Next demo beat.', ability: 'dex' })).status, 200);
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.deepEqual(await api('/api/pending-narration'), prepared);
    assert.equal((await api('/api/session-snapshot')).body.currentAction.description, 'Next demo beat.');
    const logs = await api('/api/ai-logs'); assert.doesNotMatch(JSON.stringify(logs.body), /STALE_PROVIDER_CANARY/);
    const currentDraft = await api('/api/local-model/draft', {});
    assert.equal(currentDraft.status, 200); assert.equal(currentDraft.body.draft.adapter.mode, 'live');
    assert.equal(currentDraft.body.draft.response.narration, 'CURRENT_DEMO_DRAFT');
    const accepted = await api('/api/rolls', { requestId: 'narration-current-roll', actorId: sheet.id, actorName: sheet.name, note: 'ability', dice: 'd2' });
    assert.equal(accepted.status, 201); await waitPending(5);
    const revision = (await api('/api/session-snapshot')).body.revision;
    for (let i = 0; i < 100; i++) {
      if ((await api('/api/pending-narration')).body.text === 'CURRENT_DEMO_ROLL') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal((await api('/api/pending-narration')).body.text, 'CURRENT_DEMO_ROLL');
    assert.equal((await api('/api/session-snapshot')).body.revision, revision, 'Optional prose cannot apply another authoritative command');
    assert.deepEqual(await api('/api/rolls', { requestId: 'narration-current-roll', actorId: sheet.id, actorName: sheet.name, note: 'ability', dice: 'd2' }), accepted);
    assert.equal(server.diagnostics().split('SYNTHETIC_NARRATION_PENDING').length - 1, 5, 'Receipt replay cannot submit narration again');
  }, { aiReplies: ['STALE_PROVIDER_CANARY_1', 'STALE_PROVIDER_CANARY_2', 'STALE_PROVIDER_CANARY_3', 'CURRENT_DEMO_DRAFT', 'CURRENT_DEMO_ROLL'], aiDelayMs: 500 });
});
