import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const extension = directory === 'dist' ? 'js' : 'ts';
const { createStateEvents } = await import(`../services/game-server/${directory}/state-events.${extension}`);
const character = () => ({ id: 'demo-character', name: 'Demo Finch', hp: { current: 4, max: 6 }, initiative: null,
  conditions: [], resources: [{ id: 'sparks', label: 'Sparks', current: 1, max: 2 }] });

test('state event owner preserves clamps, condition no-ops, resource/initiative changes and current character lookup', () => {
  let current = character(), published = 0;
  const log = [];
  const events = createStateEvents({ resolveCharacter: id => id === current.id ? current : null,
    recordTableEvent: event => { const record = { id: `event-${log.length}`, timestamp: '2026-01-01T00:00:00Z', ...event }; log.push(record); return record; },
    publishSessionState: () => { published++; return { party: [current] }; } });
  const apply = fields => events.apply({ characterId: current.id, ...fields }, 'Demo Host');
  assert.equal(apply({ type: 'hp_delta', amount: -10 }).statusCode, 200); assert.equal(current.hp.current, 0);
  assert.equal(log.at(-1).payload.previous, 4); assert.equal(log.at(-1).payload.delta, -10);
  apply({ type: 'hp_delta', amount: 20 }); assert.equal(current.hp.current, 6);
  apply({ type: 'condition_add', condition: ' tired ' }); assert.deepEqual(current.conditions, ['tired']);
  const beforeNoop = log.length, beforePublication = published;
  apply({ type: 'condition_add', condition: 'tired' }); apply({ type: 'condition_remove', condition: 'absent' });
  assert.equal(log.length, beforeNoop); assert.equal(published, beforePublication + 2);
  apply({ type: 'condition_remove', condition: 'tired' }); assert.deepEqual(current.conditions, []);
  assert.equal(log.at(-1).type, 'condition_removed');
  apply({ type: 'resource_set', resourceId: 'sparks', value: 50 }); assert.equal(current.resources[0].current, 2);
  apply({ type: 'resource_set', resourceId: 'sparks', value: -50 }); assert.equal(current.resources[0].current, 0);
  const previous = log.length, publications = published;
  assert.equal(apply({ type: 'resource_set', resourceId: 'missing', value: 1 }).statusCode, 404);
  assert.equal(events.apply({ type: 'hp_delta', characterId: 'missing', amount: 1 }).statusCode, 404);
  assert.equal(log.length, previous); assert.equal(published, publications);
  apply({ type: 'initiative_set', value: 7 }); assert.equal(current.initiative, 7);
  apply({ type: 'initiative_set', value: null }); assert.equal(current.initiative, null);
  assert.ok(log.every(event => event.visibility === 'player_visible' && event.actor.label === 'Demo Host'));
  assert.equal(events.summarize({ type: 'hp_delta', characterId: current.id, amount: 2 }), 'Demo Finch HP +2');
  current = character(); // Rollback can replace collection objects; the owner must resolve anew.
  apply({ type: 'hp_delta', amount: -1 }); assert.equal(current.hp.current, 3);
});

test('malformed queued event data fails before character mutation, logging or publication', () => {
  const current = character(); current.initiative = 17;
  const before = structuredClone(current);
  const events = createStateEvents({ resolveCharacter: () => current,
    recordTableEvent: () => { throw new Error('Invalid event must not log'); },
    publishSessionState: () => { throw new Error('Invalid event must not publish'); } });
  for (const value of [null, {}, { type: 'unknown', characterId: current.id },
    { type: 'hp_delta', characterId: current.id, amount: Infinity },
    { type: 'resource_set', characterId: current.id, resourceId: 'sparks', value: NaN },
    { type: 'initiative_set', characterId: current.id, value: 'malformed' },
    { type: 'condition_add', characterId: current.id, condition: '' }]) {
    assert.equal(events.apply(value).statusCode, 400); assert.deepEqual(current, before);
  }
});

const api = server => async (path, token, body) => {
  const response = await fetch(server.base + path, { method: body ? 'POST' : 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
  return { status: response.status, body: await response.json() };
};

test('extracted approvals preserve ownership, rollback/deferred exports, exact restart replay and rejection', { timeout: 20000 }, async () => {
  await withIsolatedServer(async server => {
    const host = await server.hostToken(), request = api(server);
    const snapshot = (await request('/api/session-snapshot', host)).body;
    const player = (await request('/api/session/join', '', { code: snapshot.tablePin, label: 'Demo Finch' })).body;
    const created = await request('/api/characters', host, { requestId: 'create-demo', name: 'Demo Tinker', classLabel: 'Tinker', maxHp: 10 });
    assert.equal(created.status, 201); const id = created.body.id;
    assert.equal((await request('/api/claim-character', player.token, { requestId: 'claim-demo', characterId: id })).status, 200);
    assert.equal((await request('/api/state-event-queue', player.token)).status, 403);
    assert.equal((await request('/api/state-events', player.token, { requestId: 'denied-direct', type: 'hp_delta', characterId: id, amount: -1 })).status, 403);
    const proposed = await request('/api/state-events/propose', player.token, { requestId: 'proposal-demo', type: 'hp_delta', characterId: id, amount: -1,
      submittedBy: { id: 'forged', kind: 'gm', label: 'forged' } });
    assert.equal(proposed.status, 201); const proposal = proposed.body.proposal;
    assert.equal(proposal.submittedBy.id, player.actorId);
    assert.equal(proposal.submittedBy.label, 'Demo Finch');
    const path = `/api/state-events/${proposal.id}/approve`, command = { requestId: 'approve-demo' };
    assert.equal((await request(path, player.token, command)).status, 403);
    const before = (await request('/api/session-snapshot', host)).body;
    const memoryFiles = () => readdir(resolve(server.folder, 'exports', 'memory-entries')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const originalFiles = await memoryFiles();
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      db.exec("CREATE TRIGGER reject_approval_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic approval failure'); END");
      const failed = await request(path, host, command); assert.equal(failed.status, 503);
      const after = (await request('/api/session-snapshot', host)).body;
      for (const key of ['party', 'eventLog', 'approvalQueue', 'memoryEntries', 'revision']) assert.deepEqual(after[key], before[key], key);
      assert.deepEqual(await memoryFiles(), originalFiles);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE request_id = ?').get(command.requestId).count, 0);
      db.exec('DROP TRIGGER reject_approval_receipt');
    } finally { db.close(); }
    const accepted = await request(path, host, command); assert.equal(accepted.status, 200);
    assert.equal(accepted.body.sessionSnapshot.party.find(character => character.id === id).hp.current, 9);
    assert.equal(accepted.body.sessionSnapshot.approvalQueue.length, 0);
    const files = await memoryFiles(); assert.equal(files.length, originalFiles.length + 1);
    assert.deepEqual(await request(path, host, command), accepted);
    const rejectedProposal = await request('/api/state-events/propose', player.token, { requestId: 'rejectable', type: 'condition_add', characterId: id, condition: 'demo-tired' });
    const rejected = await request(`/api/state-events/${rejectedProposal.body.proposal.id}/reject`, host, { requestId: 'reject-demo' });
    assert.equal(rejected.status, 200);
    const latestRevision = rejected.body.sessionSnapshot.revision;
    await server.restart();
    assert.deepEqual(await request(path, host, command), accepted);
    const recovered = (await request('/api/session-snapshot', host)).body;
    assert.equal(recovered.revision, latestRevision);
    const recoveredCharacter = recovered.party.find(character => character.id === id);
    assert.equal(recoveredCharacter.hp.current, 9); assert.deepEqual(recoveredCharacter.conditions, []);
    assert.deepEqual(await memoryFiles(), files);
  }, { profile: 'party' });
});

test('malformed persisted proposal cannot clear initiative or disappear on approval', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const host = await server.hostToken(), request = api(server);
    const created = await request('/api/characters', host, { requestId: 'create-demo', name: 'Demo Clockkeeper', classLabel: 'Tinker' });
    const id = created.body.id;
    assert.equal((await request('/api/state-events', host, { requestId: 'initiative-demo', type: 'initiative_set', characterId: id, value: 17 })).status, 200);
    const proposal = (await request('/api/state-events/propose', host, { requestId: 'proposal-demo', type: 'initiative_set', characterId: id, value: 4 })).body.proposal;
    await server.shutdown();
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      proposal.event.value = 'malformed legacy canary';
      db.prepare('UPDATE approval_queue SET data = ? WHERE id = ?').run(JSON.stringify(proposal), proposal.id);
    } finally { db.close(); }
    await server.restart();
    const before = (await request('/api/session-snapshot', host)).body;
    const rejected = await request(`/api/state-events/${proposal.id}/approve`, host, { requestId: 'invalid-approval' });
    assert.equal(rejected.status, 400); assert.deepEqual(rejected.body, { error: 'Invalid state event.' });
    const after = (await request('/api/session-snapshot', host)).body;
    for (const key of ['party', 'approvalQueue', 'eventLog', 'revision']) assert.deepEqual(after[key], before[key], key);
    assert.equal(after.party.find(character => character.id === id).initiative, 17);
    assert.equal(after.approvalQueue[0].id, proposal.id);
  }, { profile: 'party' });
});
