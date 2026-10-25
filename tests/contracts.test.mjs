import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { isPartyState, isPartySnapshot, isCommandMetadata, isRequestId, isChoice, partyChoices, partyStages } from '../packages/contracts/dist/index.js';
import { newPartyState, projectParty } from '../services/game-server/src/party-game.ts';
import { PartyService } from '../services/game-server/src/party-service.ts';
import { CommandStore } from '../services/game-server/src/command-store.ts';

const player = { sessionId: 'contract-demo', actorId: 'player-demo', label: 'Demo', role: 'player' };
function fixture() {
  const state = newPartyState(player.sessionId);
  Object.assign(state, { roundId: 1, stage: 'choosing', roster: [{ actorId: player.actorId, label: player.label, seat: 1, ready: true, score: 0 }],
    participants: [player.actorId], choices: { [player.actorId]: 'guard' }, deadline: 60000 });
  return state;
}

test('one contract validates persisted Party state and audience snapshots; malformed nested data fails closed', () => {
  const state = fixture();
  assert.ok(isPartyState(state));
  for (const role of ['gm', 'player', 'spectator']) assert.ok(isPartySnapshot(projectParty(state, { ...player, role })));
  const malformed = [
    value => { value.roster.push({ ...value.roster[0], seat: 2 }); },
    value => { value.roster[0].score = -1; },
    value => { value.roster[0].seat = 0; },
    value => { value.participants.push(player.actorId); },
    value => { value.participants = ['not-seated']; },
    value => { value.choices['not-participating'] = 'guard'; },
    value => { value.choices[player.actorId] = 'unknown'; },
    value => { value.remainingMs = -1; },
    value => { value.deadline = NaN; },
    value => { value.winners = ['not-seated']; },
    value => { value.outcomes = [{ actorId: player.actorId, seat: 1, choice: 'guard', roll: 7, success: true, points: 1, dangerAfter: 2, text: 'Demo' }]; },
    value => { value.history = [{ roundId: 1, danger: 13, outcomes: [] }]; }
  ];
  for (const mutate of malformed) {
    const value = structuredClone(state); mutate(value);
    assert.equal(isPartyState(value), false);
    assert.equal(isPartySnapshot({ ...value, submittedCount: 1, ownChoice: 'guard', scene: null }), false);
  }
  const snapshot = projectParty(state, player);
  for (const fields of [{ submittedCount: 2 }, { ownChoice: 'unknown' }, { scene: { prompt: 'Incomplete' } }, { history: [{}] }]) assert.equal(isPartySnapshot({ ...snapshot, ...fields }), false);
  assert.equal(isPartySnapshot(state), false, 'Private persisted state lacks the viewer contract fields');
  assert.equal(isChoice({ toString: () => 'mend' }), false, 'Choices must be literal strings');
});

test('invalid persisted nested data stops service projection rather than publishing a partial game', () => {
  const db = new Database(':memory:');
  try {
    const store = new CommandStore(db);
    const state = fixture(); state.history = [{ roundId: 1, danger: 3, outcomes: [{ roll: 99 }] }];
    db.prepare('INSERT INTO command_sessions (session_id, mode, revision, state_json) VALUES (?, ?, ?, ?)').run(player.sessionId, 'party', 0, JSON.stringify(state));
    let published = false;
    const service = new PartyService(store, () => { published = true; });
    assert.throws(() => service.state(player.sessionId), { status: 503 });
    assert.throws(() => service.recover(player.sessionId), { status: 503 });
    assert.equal(published, false);
  } finally { db.close(); }
});

test('shared command metadata rejects invalid versions and identifiers; existing schema IDs/enums remain compatible', async () => {
  const party = { schemaVersion: 1, sessionId: player.sessionId, actorId: player.actorId, mode: 'party', roundId: 1, stage: 'choosing' };
  const table = { ...party, mode: 'ttrpg', roundId: null, stage: 'table' };
  assert.ok(isCommandMetadata(party)); assert.ok(isCommandMetadata(table));
  for (const fields of [{ schemaVersion: 2 }, { actorId: '' }, { sessionId: '' }, { roundId: 6 }, { stage: 'table' }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { unexpected: true }]) assert.equal(isCommandMetadata({ ...party, ...fields }), false);
  for (const value of ['', 'space not allowed', 'x'.repeat(129), null, 123]) assert.equal(isRequestId(value), false);
  assert.ok(isRequestId('demo_request-1'));
  const schema = JSON.parse(await readFile(new URL('../packages/shared-schemas/party-command-v1.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.$id, 'https://black-dice-engine.local/schemas/party-command-v1.schema.json');
  assert.deepEqual(schema.properties.choice.enum, [...partyChoices]);
  assert.deepEqual(schema.properties._command.properties.stage.enum, [...partyStages]);
  for (const value of ['', 'ok-1', 'x'.repeat(129), 'a b']) assert.equal(new RegExp(schema.properties.requestId.pattern).test(value), isRequestId(value));
  const tableSchema = JSON.parse(await readFile(new URL('../packages/shared-schemas/table-protocol-v1.schema.json', import.meta.url), 'utf8'));
  assert.equal(tableSchema.$id, 'https://black-dice-engine.local/schemas/table-protocol-v1.schema.json');
  assert.equal(tableSchema.$defs.metadata.properties.mode.const, table.mode);
  // This is targeted protocol parity, not full JSON Schema validation/generation.
});
