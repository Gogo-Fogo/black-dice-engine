import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const extension = directory === 'dist' ? 'js' : 'ts';
const load = name => import(`../services/game-server/${directory}/${name}.${extension}`);
const { CommandStore, defaultMaxJournalEntries } = await load('command-store');
const { PartyService } = await load('party-service');
const key = (revision, sessionId = 'demo-room', mode = 'ttrpg') => ({ sessionId, mode, actorId: 'demo-actor', kind: 'roll', requestId: `roll-${revision}` });
const count = (db, table) => db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;

test('journal retention is globally bounded by commit order while receipts and checkpoints remain exact', () => {
  const db = new Database(':memory:');
  try {
    let now = 1000;
    const store = new CommandStore(db, () => --now, { maxJournalEntries: 3 });
    const first = { status: 201, body: { rolled: 4 }, revision: 1 };
    for (let revision = 1; revision <= 8; revision++) {
      store.commit(key(revision), { dice: 'd6' }, revision - 1, { total: revision }, { ...first, revision });
    }
    assert.equal(count(db, 'command_events'), 3);
    assert.deepEqual(store.historyWindow('demo-room', 'ttrpg').events.map(row => row.revision), [6, 7, 8]);
    assert.equal(store.historyWindow('demo-room', 'ttrpg').truncated, true);
    store.commit(key(1, 'another-room', 'party'), {}, 0, { another: true }, first);
    store.commit(key(1, 'third-room'), {}, 0, { third: true }, first);
    assert.equal(count(db, 'command_events'), 3);
    assert.deepEqual(store.historyWindow('demo-room', 'ttrpg'), { currentRevision: 8, maxJournalEntries: 3,
      truncated: true, firstRetainedRevision: 8, lastRetainedRevision: 8,
      events: [{ revision: 8, metadata: { schemaVersion: 1, type: 'command_committed', ...key(8), revision: 8,
        roundId: null, stage: 'table', committedAt: 992 } }] });
    assert.deepEqual(store.replay(key(1), { dice: 'd6' }), first);
    assert.throws(() => store.replay(key(1), { dice: 'd20' }), { status: 409 });
    assert.deepEqual(store.state('demo-room', 'ttrpg'), { total: 8 });
    assert.equal(count(db, 'command_receipts'), 10);
    assert.equal(count(db, 'command_sessions'), 3);
    assert.equal(store.historyWindow('unknown', 'ttrpg').truncated, false);
    const restarted = new CommandStore(db, () => 0, { maxJournalEntries: 1 });
    assert.equal(count(db, 'command_events'), 1);
    assert.deepEqual(restarted.replay(key(1), { dice: 'd6' }), first);
    assert.deepEqual(restarted.historyWindow('demo-room', 'ttrpg'), { currentRevision: 8, maxJournalEntries: 1,
      truncated: true, firstRetainedRevision: null, lastRetainedRevision: null, events: [] });
  } finally { db.close(); }
});

test('failed retention rolls back the new outcome, legacy writes, receipt, revision and previous journal together', () => {
  const db = new Database(':memory:');
  try {
    const store = new CommandStore(db, () => 0, { maxJournalEntries: 1 });
    db.exec('CREATE TABLE demo_legacy (value INTEGER)');
    const first = { status: 200, body: { rolled: 2 }, revision: 1 };
    store.commit(key(1), {}, 0, { rolled: 2 }, first, () => db.exec('INSERT INTO demo_legacy VALUES (2)'));
    const before = store.historyWindow('demo-room', 'ttrpg');
    db.exec("CREATE TRIGGER reject_retention BEFORE DELETE ON command_events BEGIN SELECT RAISE(ABORT, 'synthetic retention failure'); END");
    const commit = () => store.commit(key(2), {}, 1, { rolled: 6 }, { ...first, revision: 2 }, () => db.exec('INSERT INTO demo_legacy VALUES (6)'));
    assert.throws(commit, /synthetic retention failure/);
    assert.equal(store.revision('demo-room', 'ttrpg'), 1);
    assert.deepEqual(store.state('demo-room', 'ttrpg'), { rolled: 2 });
    assert.equal(store.replay(key(2), {}), null);
    assert.deepEqual(store.replay(key(1), {}), first);
    assert.deepEqual(store.historyWindow('demo-room', 'ttrpg'), before);
    assert.deepEqual(db.prepare('SELECT value FROM demo_legacy').all(), [{ value: 2 }]);
    db.exec('DROP TRIGGER reject_retention'); commit();
    assert.equal(store.revision('demo-room', 'ttrpg'), 2);
    assert.equal(count(db, 'command_events'), 1);
  } finally { db.close(); }
});

test('invalid retention policies fail before schema initialization', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, 50001]) {
    const db = new Database(':memory:');
    try {
      assert.throws(() => new CommandStore(db, Date.now, { maxJournalEntries: value }), /retention/);
      assert.equal(count(db, 'sqlite_master'), 0);
    } finally { db.close(); }
  }
});

test('Party resolution replay survives journal eviction and recovery without new dice or publication', () => {
  const db = new Database(':memory:');
  try {
    const store = new CommandStore(db, () => 0, { maxJournalEntries: 2 });
    let samples = 0, publications = 0, sequence = 0;
    const host = { sessionId: 'demo-party', actorId: 'host', role: 'gm', label: 'Host' };
    const players = Array.from({ length: 7 }, (_, index) => ({ ...host, actorId: `seat-${index}`, role: 'player', label: `Seat ${index}` }));
    const service = new PartyService(store, () => publications++, () => 0, () => { samples++; return 4; });
    const input = (actor, fields = {}) => {
      const state = service.state(host.sessionId);
      return { requestId: `demo-${++sequence}`, _command: { schemaVersion: 1, sessionId: host.sessionId, mode: 'party',
        actorId: actor.actorId, roundId: state.roundId, stage: state.stage, expectedRevision: state.revision }, ...fields };
    };
    const act = (actor, action, fields) => service.command(actor, action, input(actor, fields));
    for (const player of players) { act(player, 'enter'); act(player, 'ready', { ready: true }); }
    act(host, 'start'); act(host, 'advance');
    for (const player of players) act(player, 'choose', { choice: 'mend' });
    assert.equal(service.state(host.sessionId).stage, 'locked'); act(host, 'advance');
    const originalInput = input(host), resolved = service.command(host, 'advance', originalInput);
    assert.equal(samples, 7);
    act(host, 'advance'); act(host, 'advance');
    const restarted = new PartyService(new CommandStore(db, () => 10, { maxJournalEntries: 2 }), () => publications++, () => 10,
      () => { throw new Error('Recovery must not reroll'); });
    restarted.recover(host.sessionId);
    const before = restarted.state(host.sessionId), published = publications;
    assert.equal(before.paused, true);
    assert.equal(store.historyWindow(host.sessionId, 'party').truncated, true);
    assert.deepEqual(restarted.command(host, 'advance', originalInput), resolved);
    assert.deepEqual(restarted.state(host.sessionId), before);
    assert.equal(publications, published); assert.equal(samples, 7);
  } finally { db.close(); }
});

test('actual server startup trims old metadata but replays an evicted roll receipt after process restart', { timeout: 20000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const request = async (path, body) => {
      const response = await fetch(server.base + path, { method: body ? 'POST' : 'GET',
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) });
      return { status: response.status, body: await response.json() };
    };
    const snapshot = (await request('/api/session-snapshot')).body;
    const input = { requestId: 'demo-durable-roll', actorId: snapshot.party[0].id, actorName: snapshot.party[0].name, dice: 'd6' };
    const rolled = await request('/api/rolls', input); assert.equal(rolled.status, 201);
    const before = (await request('/api/session-snapshot')).body;
    await server.shutdown();
    const db = new Database(resolve(server.folder, 'demo.db'));
    try {
      const insert = db.prepare('INSERT INTO command_events (session_id, mode, revision, event_json) VALUES (?, ?, ?, ?)');
      db.transaction(() => {
        for (let revision = 1; revision <= defaultMaxJournalEntries + 1; revision++) insert.run('synthetic-history', 'ttrpg', revision,
          JSON.stringify({ schemaVersion: 1, type: 'command_committed', sessionId: 'synthetic-history', mode: 'ttrpg', revision }));
      })();
    } finally { db.close(); }
    await server.restart();
    assert.deepEqual(await request('/api/rolls', input), rolled);
    assert.equal((await request('/api/rolls', { ...input, dice: 'd20' })).status, 409);
    const after = (await request('/api/session-snapshot')).body;
    assert.equal(after.revision, before.revision); assert.deepEqual(after.rollLog, before.rollLog);
    const read = new Database(resolve(server.folder, 'demo.db'), { readonly: true });
    try {
      assert.equal(count(read, 'command_events'), defaultMaxJournalEntries);
      assert.equal(read.prepare('SELECT COUNT(*) AS count FROM command_events WHERE session_id = ?').get(before.sessionId).count, 0);
      assert.equal(read.prepare('SELECT COUNT(*) AS count FROM command_receipts WHERE session_id = ?').get(before.sessionId).count, 1);
    } finally { read.close(); }
  }, { profile: 'party' });
});
