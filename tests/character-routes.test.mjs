import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const api = server => async (path, token, body) => {
  const response = await fetch(server.base + path, { method: body ? 'POST' : 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
  return { status: response.status, body: await response.json() };
};
const find = (snapshot, id) => snapshot.party.find(character => character.id === id);

test('character creation preserves validation, atomic rollback, bare response/defaults and exact restart replay', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const request = api(server), host = await server.hostToken();
    const before = (await request('/api/session-snapshot', host)).body;
    const input = { requestId: 'demo-create', name: 'Demo Pendulum', classLabel: 'Clockkeeper', maxHp: 7, armorClass: 14,
      level: 2, notes: ['DEMO_CREATION_NOTE'], image: '/demo-clockkeeper.png' };
    assert.equal((await request('/api/characters', '', input)).status, 401);
    const player = (await request('/api/session/join', '', { code: before.tablePin, label: 'Demo Finch' })).body;
    assert.equal((await request('/api/characters', player.token, input)).status, 403);
    for (const change of [{ maxHp: 0 }, { armorClass: -1 }, { level: 0 }, { notes: [42] }, { classLabel: '' }]) {
      assert.equal((await request('/api/characters', host, { ...input, ...change })).status, 400);
    }
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER fail_character_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic creation failure'); END");
      assert.equal((await request('/api/characters', host, input)).status, 503);
      const after = (await request('/api/session-snapshot', host)).body;
      for (const key of ['party', 'eventLog', 'revision']) assert.deepEqual(after[key], before[key]);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE request_id = ?').get(input.requestId).count, 0);
      db.exec('DROP TRIGGER fail_character_receipt');
    } finally { db.close(); }
    const created = await request('/api/characters', host, input); assert.equal(created.status, 201);
    assert.equal(created.body.name, input.name); assert.equal(created.body.sessionSnapshot, undefined);
    assert.deepEqual(created.body.hp, { current: 7, max: 7 }); assert.equal(created.body.armorClass, 14);
    assert.deepEqual(created.body.notes, input.notes); assert.equal(created.body.image, input.image);
    assert.deepEqual(created.body.resources, []); assert.deepEqual(created.body.conditions, []);
    assert.deepEqual(created.body.inventory, []); assert.equal(created.body.initiative, null);
    assert.equal(created.body.claimedByClientId, null);
    assert.deepEqual(await request('/api/characters', host, input), created);
    assert.equal((await request('/api/characters', host, { ...input, name: 'Changed payload' })).status, 409);
    const defaults = await request('/api/characters', host, { requestId: 'demo-defaults', name: 'Demo Lantern', classLabel: 'Tinker' });
    assert.equal(defaults.status, 201); assert.deepEqual(defaults.body.hp, { current: 10, max: 10 });
    assert.equal(defaults.body.armorClass, 10); assert.deepEqual(defaults.body.notes, ['Created at level 1']);
    assert.equal(defaults.body.image, null);
    await server.restart();
    assert.deepEqual(await request('/api/characters', host, input), created);
    const recovered = (await request('/api/session-snapshot', host)).body;
    assert.equal(recovered.party.filter(character => character.id === created.body.id).length, 1);
    assert.equal(recovered.party.length, before.party.length + 2);
  }, { profile: 'party' });
});

test('claim switching/release preserve ownership privacy, rollback, stale races and replay without reclaiming', { timeout: 20000 }, async () => {
  await withIsolatedServer(async server => {
    const request = api(server), host = await server.hostToken();
    const snapshot = (await request('/api/session-snapshot', host)).body;
    const player = (await request('/api/session/join', '', { code: snapshot.tablePin, label: 'Demo Finch' })).body;
    const other = (await request('/api/session/join', '', { code: snapshot.tablePin, label: 'Demo Wren' })).body;
    const display = (await request('/api/session/display', host, {})).body;
    const sheets = [];
    for (let index = 0; index < 2; index++) {
      const created = await request('/api/characters', host, { requestId: `demo-create-${index}`, name: `Demo Tinker ${index}`,
        classLabel: 'Tinker', notes: [`PRIVATE_SHEET_${index}_CANARY`] });
      assert.equal(created.status, 201); sheets.push(created.body);
    }
    const claim = { requestId: 'demo-claim', characterId: sheets[0].id, playerLabel: 'Forged label' };
    assert.equal((await request('/api/claim-character', player.token, { ...claim, clientId: other.actorId })).status, 403);
    const claimed = await request('/api/claim-character', player.token, claim); assert.equal(claimed.status, 200);
    assert.equal(find(claimed.body.sessionSnapshot, sheets[0].id).claimedByLabel, player.label);
    assert.deepEqual(find(claimed.body.sessionSnapshot, sheets[0].id).notes, ['PRIVATE_SHEET_0_CANARY']);
    assert.deepEqual(find(claimed.body.sessionSnapshot, sheets[1].id).notes, []);
    for (const token of [other.token, display.token]) {
      const projected = (await request('/api/session-snapshot', token)).body;
      assert.doesNotMatch(JSON.stringify(projected), /PRIVATE_SHEET_[01]_CANARY/);
    }
    assert.equal((await request('/api/claim-character', other.token, { requestId: 'demo-conflict', characterId: sheets[0].id })).status, 409);
    assert.equal((await request('/api/claim-character', display.token, claim)).status, 403);
    const switchedBody = { requestId: 'demo-switch', characterId: sheets[1].id };
    const beforeSwitch = (await request('/api/session-snapshot', host)).body;
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER fail_claim_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic switch failure'); END");
      assert.equal((await request('/api/claim-character', player.token, switchedBody)).status, 503);
      const failed = (await request('/api/session-snapshot', host)).body;
      for (const key of ['party', 'eventLog', 'revision']) assert.deepEqual(failed[key], beforeSwitch[key]);
      db.exec('DROP TRIGGER fail_claim_receipt');
      assert.equal((await request('/api/claim-character', player.token, switchedBody)).status, 200);
      const switched = (await request('/api/session-snapshot', host)).body;
      assert.equal(find(switched, sheets[0].id).claimedByClientId, null);
      assert.equal(find(switched, sheets[1].id).claimedByClientId, player.actorId);
      const metadata = { schemaVersion: 1, sessionId: player.sessionId, mode: 'ttrpg', actorId: player.actorId,
        roundId: null, stage: 'table', expectedRevision: switched.revision };
      const raced = await Promise.all(sheets.map((sheet, index) => request('/api/claim-character', player.token,
        { requestId: `demo-race-${index}`, characterId: sheet.id, _command: metadata })));
      assert.deepEqual(raced.map(result => result.status).sort(), [200, 409]);
      const beforeRelease = (await request('/api/session-snapshot', host)).body;
      assert.equal(beforeRelease.party.filter(character => character.claimedByClientId === player.actorId).length, 1);
      const release = { requestId: 'demo-release' };
      assert.equal((await request('/api/release-character', other.token, { ...release, clientId: player.actorId })).status, 403);
      db.exec("CREATE TRIGGER fail_release_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic release failure'); END");
      assert.equal((await request('/api/release-character', player.token, release)).status, 503);
      const failedRelease = (await request('/api/session-snapshot', host)).body;
      for (const key of ['party', 'eventLog', 'revision']) assert.deepEqual(failedRelease[key], beforeRelease[key]);
      db.exec('DROP TRIGGER fail_release_receipt');
      const released = await request('/api/release-character', player.token, release); assert.equal(released.status, 200);
      assert.ok(sheets.every(sheet => find(released.body.sessionSnapshot, sheet.id).claimedByClientId === null));
      assert.doesNotMatch(JSON.stringify(released.body.sessionSnapshot), /PRIVATE_SHEET_[01]_CANARY/);
    } finally { db.close(); }
    assert.equal((await request('/api/claim-character', other.token, { requestId: 'demo-other-claim', characterId: sheets[0].id })).status, 200);
    await server.restart();
    const beforeReplay = (await request('/api/session-snapshot', host)).body;
    assert.deepEqual(await request('/api/claim-character', player.token, claim), claimed);
    const afterReplay = (await request('/api/session-snapshot', host)).body;
    for (const key of ['party', 'eventLog', 'revision']) assert.deepEqual(afterReplay[key], beforeReplay[key]);
    assert.equal(find(afterReplay, sheets[0].id).claimedByClientId, other.actorId);
    assert.equal(afterReplay.party.filter(character => character.claimedByClientId === player.actorId).length, 0);
  }, { profile: 'party' });
});
