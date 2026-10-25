import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

// Exercise the real command boundary: the final roll also clears the action and
// creates fallback narration. All three effects must commit or roll back together.
test('group action completion rolls back atomically, replays once and survives restart', { timeout: 20000 }, async () => {
  await withIsolatedServer(async server => {
    const host = await server.hostToken();
    const api = async (path, body, token = host) => {
      const response = await fetch(server.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000)
      });
      return { status: response.status, body: await response.json() };
    };
    const initial = (await api('/api/session-snapshot')).body;
    const characters = [];
    for (let index = 0; index < 2; index++) {
      const sheet = await api('/api/characters', { requestId: `action-create-${index}`, name: `Demo Bellkeeper ${index}`, classLabel: 'Tinker' });
      assert.equal(sheet.status, 201);
      const player = (await api('/api/session/join', { code: initial.tablePin, label: `Demo Finch ${index}` }, '')).body;
      assert.equal((await api('/api/claim-character', { requestId: `action-claim-${index}`, characterId: sheet.body.id }, player.token)).status, 200);
      characters.push(sheet.body);
    }
    assert.equal((await api('/api/ai/narration-toggle', { requestId: 'action-silence', enabled: false })).status, 200);
    const action = { requestId: 'action-start', type: 'ability', description: 'Demo bells ring together.', ability: 'wis', dc: 10 };
    assert.equal((await api('/api/set-action', action)).status, 200);
    const roll = index => ({ requestId: `action-roll-${index}`, actorId: characters[index].id,
      actorName: characters[index].name, dice: '1d2+100', note: 'ability' });
    assert.equal((await api('/api/rolls', roll(0))).status, 201);
    // A pending group result survives restart and eviction from the short roll feed.
    await server.restart();
    for (let i = 0; i < 13; i++) assert.equal((await api('/api/rolls', {
      requestId: `unrelated-roll-${i}`, actorId: characters[0].id, actorName: characters[0].name,
      dice: '1d2', note: 'Unrelated free roll'
    })).status, 201);
    const before = (await api('/api/session-snapshot')).body;
    assert.equal(before.rollLog.some(r => r.action), false);
    assert.equal(before.currentAction.rolls.length, 1);
    const narrationBefore = await api('/api/pending-narration');
    assert.equal(before.currentAction.description, action.description);
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER fail_group_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic final roll failure'); END");
      assert.equal((await api('/api/rolls', roll(1))).status, 503);
      const after = (await api('/api/session-snapshot')).body;
      for (const key of ['currentAction', 'rollLog', 'eventLog', 'revision', 'campaignProgress']) assert.deepEqual(after[key], before[key]);
      assert.deepEqual(await api('/api/pending-narration'), narrationBefore);
      assert.doesNotMatch(server.diagnostics(), /SYNTHETIC_IMAGE_SUBMITTED/);
      db.exec('DROP TRIGGER fail_group_receipt');
    } finally { db.close(); }
    const accepted = await api('/api/rolls', roll(1));
    assert.equal(accepted.status, 201);
    assert.ok(accepted.body.total >= 101 && accepted.body.total <= 102);
    const completed = (await api('/api/session-snapshot')).body;
    assert.equal(completed.currentAction, null);
    const narration = await api('/api/pending-narration');
    assert.ok(narration.body.text.startsWith(action.description));
    for (const character of characters) assert.ok(narration.body.text.includes(character.name));
    assert.deepEqual(await api('/api/rolls', roll(1)), accepted);
    assert.deepEqual((await api('/api/session-snapshot')).body, completed);
    for (let i = 0; i < 40 && !server.diagnostics().includes('SYNTHETIC_IMAGE_SUBMITTED'); i++) await new Promise(done => setTimeout(done, 10));
    assert.equal(server.diagnostics().match(/SYNTHETIC_IMAGE_SUBMITTED/g)?.length, 1);
    await server.restart();
    assert.deepEqual(await api('/api/rolls', roll(1)), accepted);
    assert.deepEqual(await api('/api/pending-narration'), narration);
    assert.equal((await api('/api/session-snapshot')).body.currentAction, null);
    assert.equal((await api('/api/ai/narration-toggle')).body.enabled, false);
    assert.equal(server.diagnostics().match(/SYNTHETIC_IMAGE_SUBMITTED/g)?.length, 1);
  }, { mockFetches: [{ url: 'http://127.0.0.1:1/prompt', method: 'POST', body: { prompt_id: 'demo-roll-image' } }] });
});
