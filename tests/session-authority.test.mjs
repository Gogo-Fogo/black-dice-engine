import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { SessionAuthority, requestCredential } from '../services/game-server/src/session-authority.ts';

test('server-issued credentials persist, separate authority, revoke and expire', () => {
  const database = new Database(':memory:');
  let time = 1000;
  try {
    const authority = new SessionAuthority(database, () => time, 10000);
    const host = authority.bootstrap();
    assert.equal(host.role, 'gm');
    assert.equal(authority.bootstrap(), null);
    const player = authority.join(authority.room().code, 'Sparrow');
    assert.equal(player.role, 'player');
    assert.notEqual(player.actorId, host.actorId);
    assert.throws(() => authority.display(player.token), /Host access/);
    assert.throws(() => authority.join('BD20', 'Other'), /invalid/);
    assert.throws(() => authority.join(authority.room().code, 'sparrow'), /already in use/);
    assert.throws(() => authority.authenticate('gm'), /credential required/);
    const resumed = new SessionAuthority(database, () => time, 10000);
    assert.deepEqual(resumed.authenticate(player.token), { sessionId: player.sessionId, actorId: player.actorId, role: 'player', label: 'Sparrow' });
    const display = authority.display(host.token);
    assert.equal(authority.authenticate(display.token).role, 'spectator');
    const persisted = JSON.stringify(database.prepare('SELECT * FROM local_members').all());
    for (const credential of [host, player, display]) assert.ok(!persisted.includes(credential.token), 'Only token hashes belong in the database');
    authority.revoke(host.token, player.actorId);
    assert.throws(() => authority.authenticate(player.token), /revoked/);
    time += 10001;
    assert.throws(() => authority.authenticate(host.token), /Room expired/);
    assert.ok(authority.bootstrap());
    assert.throws(() => authority.authenticate(display.token));
  } finally { database.close(); }
});

test('new rooms and host recovery invalidate old authority without deleting history', () => {
  const database = new Database(':memory:');
  try {
    const authority = new SessionAuthority(database);
    const host = authority.bootstrap();
    const player = authority.join(authority.room().code, 'Pigeon');
    const replacement = authority.bootstrap(true);
    assert.throws(() => authority.authenticate(host.token));
    assert.equal(authority.authenticate(player.token).role, 'player');
    const next = authority.newRoom(replacement.token);
    assert.notEqual(next.sessionId, player.sessionId);
    assert.throws(() => authority.authenticate(player.token));
    assert.throws(() => authority.authenticate(replacement.token));
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM local_rooms').get().count, 2);
  } finally { database.close(); }
});

test('HTTP and WebSocket headers resolve the same credential; roles grant nothing', () => {
  const token = 'a'.repeat(43);
  assert.equal(requestCredential({ authorization: `Bearer ${token}` }), token);
  assert.equal(requestCredential({ 'sec-websocket-protocol': `bde.session, bde.auth.${token}` }), token);
  assert.equal(requestCredential({ authorization: 'gm' }), '');
  assert.equal(requestCredential({ 'x-bde-role': 'gm' }), '');
});
