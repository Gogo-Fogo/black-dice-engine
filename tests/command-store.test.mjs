import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { CommandStore, fingerprint } from '../services/game-server/src/command-store.ts';
import { validateTableCommand } from '../services/game-server/src/table-commands.ts';

test('command receipt scope, canonical payloads, optimistic revision and atomic rollback', () => {
  const db = new Database(':memory:');
  try {
    const store = new CommandStore(db, () => 1234);
    const key = { sessionId: 'room', mode: 'ttrpg', actorId: 'actor', kind: 'roll', requestId: 'request' };
    const payload = { dice: 'd6', nested: { b: 2, a: 1 } };
    assert.equal(fingerprint(payload), fingerprint({ nested: { a: 1, b: 2 }, dice: 'd6' }));
    const result = { status: 201, body: { rolled: 4 }, revision: 1 };
    db.exec('CREATE TABLE legacy (value INTEGER)');
    store.commit(key, payload, 0, { rolls: [4] }, result, () => db.prepare('INSERT INTO legacy VALUES (?)').run(4));
    assert.deepEqual(new CommandStore(db).replay(key, payload), result);
    assert.deepEqual(store.state('room', 'ttrpg'), { rolls: [4] });
    assert.throws(() => store.replay(key, { dice: 'd20' }), { status: 409 });
    for (const field of ['sessionId', 'actorId', 'kind', 'mode']) assert.equal(store.replay({ ...key, [field]: 'other' }, payload), null);
    assert.throws(() => store.commit({ ...key, requestId: 'stale' }, payload, 0, {}, result), { status: 409 });
    db.exec("CREATE TRIGGER reject_event BEFORE INSERT ON command_events BEGIN SELECT RAISE(ABORT, 'failure'); END");
    assert.throws(() => store.commit({ ...key, requestId: 'failed' }, payload, 1, { rolls: [5] }, { ...result, revision: 2 },
      () => db.prepare('INSERT INTO legacy VALUES (?)').run(5)));
    assert.equal(store.revision('room', 'ttrpg'), 1);
    assert.equal(store.replay({ ...key, requestId: 'failed' }, payload), null);
    assert.deepEqual(store.state('room', 'ttrpg'), { rolls: [4] });
    assert.deepEqual(db.prepare('SELECT value FROM legacy').all(), [{ value: 4 }]);
  } finally { db.close(); }
});

test('table commands validate versions, identity, finite bounds and request identifiers', () => {
  const actor = { sessionId: 'room', actorId: 'actor', role: 'player', label: 'Demo' };
  const metadata = { schemaVersion: 1, sessionId: 'room', mode: 'ttrpg', actorId: 'actor', roundId: null, stage: 'table', expectedRevision: 2 };
  const command = { requestId: 'roll-1', actorId: 'sheet', dice: 'd6', _command: metadata };
  assert.equal(validateTableCommand('/rolls', command, actor).kind, 'roll');
  for (const change of [{ schemaVersion: 2 }, { mode: 'party' }, { stage: 'reveal' }, { expectedRevision: -1 }, { extra: true }]) {
    assert.throws(() => validateTableCommand('/rolls', { ...command, _command: { ...metadata, ...change } }, actor), { status: 400 });
  }
  assert.throws(() => validateTableCommand('/rolls', { ...command, _command: { ...metadata, actorId: 'forged' } }, actor), { status: 409 });
  for (const change of [{ requestId: '' }, { requestId: 'a'.repeat(129) }, { modifier: Infinity }, { modifier: 0.5 }, { actorId: '' }]) {
    assert.throws(() => validateTableCommand('/rolls', { ...command, ...change }, actor), { status: 400 });
  }
});
