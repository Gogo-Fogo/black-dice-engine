import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { applyPartyAction, newPartyState, projectParty } from '../services/game-server/src/party-game.ts';
import { CommandStore } from '../services/game-server/src/command-store.ts';
import { PartyService } from '../services/game-server/src/party-service.ts';

const host = { sessionId: 'demo', actorId: 'host', role: 'gm', label: 'Host' };
const players = Array.from({ length: 7 }, (_, i) => ({ ...host, actorId: `seat-${i + 1}`, role: 'player', label: `Demo ${i + 1}` }));
const display = { ...host, actorId: 'display', role: 'spectator' };
function lobby(count = 7) {
  let state = newPartyState('demo');
  for (const player of players.slice(0, count)) {
    state = applyPartyAction(state, player, 'enter', {}, 1000, () => 4);
    state = applyPartyAction(state, player, 'ready', { ready: true }, 1000, () => 4);
  }
  return state;
}
test('five complete original rounds, fixed-seat resolution, score, ending and shared ties', () => {
  let state = lobby();
  state = applyPartyAction(state, host, 'start', {}, 1000, () => 4);
  for (let round = 1; round <= 5; round++) {
    state = applyPartyAction(state, host, 'advance', {}, 1000, () => 4);
    const before = structuredClone(state);
    // Reverse arrival order must not control outcome order or clamping.
    for (const player of players.toReversed()) state = applyPartyAction(state, player, 'choose', { choice: 'mend' }, 2000, () => 4);
    assert.equal(state.stage, 'locked');
    assert.deepEqual(before.choices, {});
    assert.equal(projectParty(state, display).submittedCount, 7);
    assert.deepEqual(projectParty(state, display).choices, {});
    state = applyPartyAction(state, host, 'advance', {}, 2000, () => 4);
    assert.equal(Object.keys(projectParty(state, display).choices).length, 7);
    state = applyPartyAction(state, host, 'advance', {}, 2000, () => 4);
    assert.deepEqual(state.outcomes.map(outcome => outcome.seat), [1,2,3,4,5,6,7]);
    assert.ok(state.outcomes.every(outcome => outcome.roll === 4 && outcome.points === 2));
    state = applyPartyAction(state, host, 'advance', {}, 2000, () => 4);
    state = applyPartyAction(state, host, 'advance', {}, 2000, () => 4);
  }
  assert.equal(state.stage, 'ending');
  assert.equal(state.history.length, 5);
  assert.equal(state.danger, 0);
  assert.ok(state.roster.every(seat => seat.score === 10));
  assert.equal(state.winners.length, 7);
  assert.match(state.ending, /rainbow/);
  assert.throws(() => applyPartyAction(state, host, 'advance', {}, 0, () => 1), { status: 409 });
});

test('private replacements, late arrival freeze, deadline/pass, pause and authorization', () => {
  assert.throws(() => applyPartyAction(lobby(5), host, 'start', {}, 0, () => 1), { status: 409 });
  let state = applyPartyAction(lobby(6), host, 'start', {}, 0, () => 1);
  state = applyPartyAction(state, host, 'advance', {}, 0, () => 1);
  state = applyPartyAction(state, players[0], 'choose', { choice: 'mend' }, 1, () => 1);
  state = applyPartyAction(state, players[0], 'choose', { choice: 'dare' }, 2, () => 1);
  assert.equal(projectParty(state, players[0]).ownChoice, 'dare');
  for (const viewer of [host, display, players[1]]) {
    const view = projectParty(state, viewer);
    assert.deepEqual(view.choices, {});
    assert.equal(view.ownChoice, null);
    assert.deepEqual(view.outcomes, []);
  }
  state = applyPartyAction(state, players[6], 'enter', {}, 3, () => 1);
  state = applyPartyAction(state, players[6], 'ready', { ready: true }, 3, () => 1);
  assert.equal(state.participants.length, 6);
  assert.throws(() => applyPartyAction(state, players[6], 'choose', { choice: 'mend' }, 3, () => 1), { status: 403 });
  assert.throws(() => applyPartyAction(state, display, 'choose', { choice: 'mend' }, 3, () => 1), { status: 403 });
  assert.throws(() => applyPartyAction(state, players[0], 'lock', {}, 3, () => 1), { status: 403 });
  state = applyPartyAction(state, host, 'pause', {}, 5000, () => 1);
  assert.equal(state.remainingMs, 55000);
  assert.throws(() => applyPartyAction(state, host, 'deadline', {}, 999999, () => 1), { status: 409 });
  state = applyPartyAction(state, host, 'extend', { seconds: 30 }, 999999, () => 1);
  state = applyPartyAction(state, host, 'resume', {}, 1000000, () => 1);
  assert.equal(state.deadline, 1085000);
  assert.throws(() => applyPartyAction(state, players[1], 'choose', { choice: 'guard' }, 1085000, () => 1), { status: 409 });
  state = applyPartyAction(state, host, 'deadline', {}, 1085000, () => 1);
  assert.equal(state.choices[players[0].actorId], 'dare');
  assert.ok(state.participants.slice(1).every(id => state.choices[id] === 'pass'));
  assert.throws(() => applyPartyAction(state, host, 'lock', {}, 1085000, () => 1), { status: 409 });
  for (let i = 0; i < 5; i++) state = applyPartyAction(state, host, 'advance', {}, 1085000, () => 1);
  assert.equal(state.stage, 'choosing');
  assert.equal(state.participants.length, 7);
});

test('Party transaction failure, exact receipt replay, single deadline and paused recovery', () => {
  const db = new Database(':memory:');
  try {
    const store = new CommandStore(db);
    let now = 1000;
    let rolls = 0;
    const publications = [];
    let service = new PartyService(store, state => publications.push(state), () => now, () => { rolls++; return 6; });
    let number = 0;
    const envelope = (actor, extra = {}) => {
      const state = service.state('demo');
      return { requestId: `command-${++number}`, _command: { schemaVersion: 1, sessionId: 'demo', actorId: actor.actorId, mode: 'party', roundId: state.roundId, stage: state.stage }, ...extra };
    };
    const send = (actor, action, extra) => service.command(actor, action, envelope(actor, extra));
    for (const player of players) { send(player, 'enter'); send(player, 'ready', { ready: true }); }
    send(host, 'start'); send(host, 'advance');
    const command = envelope(players[0], { choice: 'mend' });
    const before = service.state('demo');
    const count = publications.length;
    db.exec("CREATE TRIGGER fail_party BEFORE INSERT ON command_events BEGIN SELECT RAISE(ABORT, 'failure'); END");
    assert.throws(() => service.command(players[0], 'choose', command), { status: 503 });
    assert.deepEqual(service.state('demo'), before);
    assert.equal(publications.length, count);
    db.exec('DROP TRIGGER fail_party');
    const accepted = service.command(players[0], 'choose', command);
    assert.deepEqual(service.command(players[0], 'choose', command), accepted);
    assert.throws(() => service.command(players[0], 'choose', { ...command, choice: 'dare' }), { status: 409 });
    service.recover('demo');
    service = new PartyService(store, state => publications.push(state), () => now, () => { rolls++; return 6; });
    assert.equal(service.state('demo').paused, true);
    now = 900000;
    service.tick('demo');
    assert.equal(service.state('demo').stage, 'choosing');
    send(host, 'resume');
    now += 60001;
    service.tick('demo');
    const locked = service.state('demo');
    service.tick('demo');
    assert.deepEqual(service.state('demo'), locked);
    send(host, 'advance');
    const resolve = envelope(host);
    const resolved = service.command(host, 'advance', resolve);
    assert.equal(rolls, 1, 'Only submitted non-pass seat rolls');
    assert.deepEqual(service.command(host, 'advance', resolve), resolved);
    assert.equal(rolls, 1, 'Receipt replay cannot reroll');
  } finally { db.close(); }
});

test('choice thresholds, danger bounds and host skip apply explicit prepared rules', () => {
  for (const [choice, roll, points, delta] of [
    ['mend', 2, 0, 1], ['mend', 3, 2, -1], ['dare', 4, 0, 2], ['dare', 5, 4, 0], ['guard', 1, 0, 0], ['guard', 2, 1, -1],
  ]) {
    let state = applyPartyAction(lobby(6), host, 'start', {}, 0, () => roll);
    state = applyPartyAction(state, host, 'advance', {}, 0, () => roll);
    for (const player of players.slice(0,6)) state = applyPartyAction(state, player, 'choose', { choice }, 1, () => roll);
    state = applyPartyAction(state, host, 'advance', {}, 1, () => roll);
    state = applyPartyAction(state, host, 'advance', {}, 1, () => roll);
    assert.ok(state.outcomes.every(outcome => outcome.points === points));
    assert.equal(state.danger, Math.max(0, Math.min(12, 3 + 6 * delta)));
  }
  let state = applyPartyAction(lobby(), host, 'start', {}, 0, () => { throw new Error('Pass must not roll'); });
  state = applyPartyAction(state, host, 'advance', {}, 0, () => 1);
  state = applyPartyAction(state, players[0], 'choose', { choice: 'mend' }, 1, () => 1);
  state = applyPartyAction(state, host, 'skip', {}, 2, () => 1);
  for (let i = 0; i < 2; i++) state = applyPartyAction(state, host, 'advance', {}, 2, () => { throw new Error('Pass must not roll'); });
  assert.ok(state.outcomes.every(outcome => outcome.choice === 'pass' && outcome.roll === null && outcome.points === 0));
  assert.equal(state.danger, 3);
  assert.throws(() => applyPartyAction(state, host, 'skip', {}, 2, () => 1), { status: 409 });
});
