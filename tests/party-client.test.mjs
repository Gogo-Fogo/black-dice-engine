import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as commandModule from '../apps/party-commands.ts';
import * as clientModule from '../apps/party-client.tsx';
import { newPartyState, projectParty } from '../services/game-server/src/party-game.ts';

const actor = { actorId: 'demo-player', sessionId: 'demo-room', role: 'player', label: 'Moth' };
const { PartyCommandQueue } = commandModule;
const { PartyView } = clientModule;
function fixture() {
  const state = newPartyState(actor.sessionId);
  Object.assign(state, { revision: 1, roundId: 1, stage: 'choosing', deadline: Date.now() + 60000,
    roster: [{ actorId: actor.actorId, label: actor.label, seat: 1, ready: true, score: 0 }], participants: [actor.actorId] });
  return projectParty(state, actor);
}
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function receipt(body, snapshot = fixture()) {
  return { ok: true, status: 200, json: async () => ({ party: snapshot, command: { ...body._command, kind: 'choose', requestId: body.requestId, revision: snapshot.revision } }) };
}
test('ambiguous command survives refresh, reuses exact ID/body, and single-flights repeated retries', async () => {
  const storage = memoryStorage();
  let wireBody;
  let calls = 0;
  const uncertain = new PartyCommandQueue(actor, storage, async (_action, body) => { wireBody = structuredClone(body); throw new Error('Response lost after commit'); }, () => 'fixed-request');
  uncertain.prepare('choose', fixture(), { choice: 'mend' });
  await assert.rejects(uncertain.run(), /Response lost/);
  assert.ok(uncertain.pending());
  let finish;
  const resumed = new PartyCommandQueue(actor, storage, (_action, body) => {
    calls++; assert.deepEqual(body, wireBody);
    return new Promise(resolve => { finish = () => resolve(receipt(body)); });
  }, () => 'must-not-generate-another-id');
  const first = resumed.run();
  const second = resumed.run();
  assert.equal(first, second);
  assert.equal(calls, 1);
  finish();
  assert.equal((await first).sessionId, actor.sessionId);
  assert.equal(resumed.pending(), null);
  assert.equal(new PartyCommandQueue(actor, storage, async () => { throw new Error(); }, () => '').pending(), null);
});

test('definitive stale commands clear; storage/network/server ambiguity retains the pending action', async () => {
  for (const status of [400, 403, 409, 408, 429, 503]) {
    const storage = memoryStorage();
    const queue = new PartyCommandQueue(actor, storage, async () => ({ ok: false, status, json: async () => ({ error: 'Host message' }) }), () => `request-${status}`);
    queue.prepare('choose', fixture(), { choice: 'guard' });
    assert.throws(() => queue.prepare('choose', fixture(), { choice: 'dare' }), /pending/);
    await assert.rejects(queue.run(), /Host message/);
    assert.equal(!!queue.pending(), [408,429,503].includes(status));
  }
  const storage = memoryStorage();
  const malformed = new PartyCommandQueue(actor, storage, async (_action, body) => ({ ok: true, status: 200,
    json: async () => ({ party: { ...fixture(), outcomes: [null] }, command: { ...body._command, requestId: body.requestId } }) }), () => 'bad-reply');
  malformed.prepare('choose', fixture(), { choice: 'pass' });
  await assert.rejects(malformed.run(), /could not be confirmed/);
  assert.ok(malformed.pending());
  assert.equal(new PartyCommandQueue({ ...actor, actorId: 'another-member' }, storage, async () => {}, () => '').pending(), null);
  const unavailable = { getItem: () => { throw new Error('Storage unavailable'); }, setItem: () => { throw new Error('Storage unavailable'); }, removeItem: () => {} };
  const inMemory = new PartyCommandQueue(actor, unavailable, async (_action, body) => receipt(body), () => 'memory-only');
  inMemory.prepare('choose', fixture(), { choice: 'pass' });
  assert.equal(inMemory.storageAvailable, false);
  await inMemory.run();
  assert.equal(inMemory.pending(), null);
});

test('static React markup separates TV, host controls and the phone private choice form', () => {
  const state = fixture();
  const room = { identity: actor, snapshot: state, connection: 'Connected', connectionError: '', commandMessage: '', commandError: '',
    busy: false, pending: null, storageAvailable: true, send: async () => {}, retry: async () => {}, refresh: async () => {} };
  const render = (role, snapshot = state) => renderToStaticMarkup(React.createElement(PartyView, { role, room: { ...room, snapshot } }));
  const tv = render('display');
  assert.match(tv, /Public display/);
  assert.match(tv, /Join on your phone/);
  assert.doesNotMatch(tv, /Host controls|Create new room|Your private choice|TTRPG mode|Pass for everyone/);
  const host = render('host');
  assert.match(host, /Lock now/);
  assert.match(host, /Create read-only display key/);
  assert.match(host, /End this room/);
  assert.match(host, /<button disabled=""[^>]*>Create new room/);
  assert.match(host, /<button disabled=""[^>]*>Skip this round/);
  assert.doesNotMatch(host, /Your private choice/);
  const phone = render('player');
  assert.match(phone, /Your private choice/);
  assert.match(phone, /name="choice"/);
  assert.match(phone, /Save choice/);
  assert.doesNotMatch(phone, /Host controls|Create new room|Display key/);
  const saved = render('player', { ...state, ownChoice: 'guard', paused: true });
  assert.match(saved, /Saved: guard/);
  assert.match(saved, /Game paused/);
  assert.match(saved, /fieldset[^>]*disabled/);
  assert.match(saved, /checked=""[^>]*value="guard"|value="guard"[^>]*checked=""/);
  for (const [stage, action] of [['briefing', 'Open choices'], ['locked', 'Reveal choices'], ['reveal', 'Resolve saved choices'], ['resolving', 'Show round summary'], ['summary', 'Next round']]) {
    assert.match(render('host', { ...state, stage }), new RegExp(action));
  }
  const lobby = render('host', { ...state, stage: 'lobby', roundId: 0 });
  assert.match(lobby, /<button[^>]*disabled=""[^>]*>Start five-round game/);
  assert.match(render('host', { ...state, paused: true }), /Resume game/);
});
