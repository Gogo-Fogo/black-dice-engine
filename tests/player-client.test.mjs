import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerCommandQueue, playerCommandPaths } from '../apps/player-companion/src/ttrpg/commands.ts';
import { PlayerTableModel, abilityModifier } from '../apps/player-companion/src/ttrpg/model.ts';
import { CharacterSheet } from '../apps/player-companion/src/ttrpg/CharacterSheet.tsx';
import { CharacterPicker } from '../apps/player-companion/src/ttrpg/CharacterPicker.tsx';
import { RollControls } from '../apps/player-companion/src/ttrpg/RollControls.tsx';
import { isPlayerSessionSnapshot } from '../packages/contracts/dist/index.js';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const actor = { actorId: 'demo-seat', sessionId: 'demo-room', role: 'player', label: 'Sparrow' };
const character = { id: 'demo-hero', name: 'Demo Hero', classLabel: 'Scout', hp: { current: 9, max: 12 }, armorClass: 13, initiative: null,
  conditions: [], resources: [{ id: 'torch', label: 'Torches', current: 2, max: 3 }], inventory: [{ id: 'rope', name: 'Rope', quantity: 1 }],
  notes: ['Demo private note'], stats: { wis: 14 }, claimedByClientId: actor.actorId, claimedByLabel: actor.label };
const snapshot = () => ({ schemaVersion: 1, sessionId: actor.sessionId, mode: 'ttrpg', roundId: null, stage: 'table', revision: 3,
  campaignId: 'demo', campaignTitle: 'Demo table', currentScene: 'A lantern-lit gate', joinUrl: '', party: [structuredClone(character)], rollLog: [], memoryEntries: [], currentAction: { type: 'Look', description: 'Inspect the gate', ability: 'wis', dc: 12 } });
const roll = (id = 'roll-one') => ({ id, actorId: character.id, actorName: character.name, dice: 'd20', modifier: 2, rolled: 9, total: 11, advantage: null, note: 'Look', timestamp: '2026-10-24T12:00:00.000Z' });
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test('companion model uses current ownership, ignores stale snapshots and deduplicates receipt/socket animation', () => {
  const presented = []; const updates = [];
  const model = new PlayerTableModel(actor, { snapshot: value => updates.push(value), roll: value => presented.push(value) });
  assert.ok(model.receive({ type: 'connected', payload: { sessionSnapshot: snapshot() } }));
  assert.equal(abilityModifier(character, snapshot().currentAction), 2);
  assert.equal(abilityModifier(null, null), 0);
  const skilled = { ...character, classLabel: 'Wizard 5', stats: { int: 19, skills: ['arcana', 'sleight_of_hand'] } };
  assert.equal(abilityModifier(skilled, { type: 'Arcana', description: '', ability: 'int', dc: 13 }), 7);
  assert.equal(abilityModifier(skilled, { type: 'History', description: '', ability: 'int', dc: 13 }), 4);
  assert.equal(abilityModifier({ ...skilled, build: { proficiencyBonus: 4, features: [] } }, { type: 'Sleight of Hand', description: '', ability: 'int', dc: 13 }), 8);
  const rogue = { ...character, classLabel: 'Rogue 5', stats: { dex: 19, skills: ['stealth', 'acrobatics'] }, build: { proficiencyBonus: 3, features: ["Expertise (stealth and thieves' tools)", 'Sneak Attack'] } };
  assert.equal(abilityModifier(rogue, { type: 'stealth', description: '', ability: 'dex', dc: 12 }), 10);
  assert.equal(abilityModifier(rogue, { type: 'Acrobatics', description: '', ability: 'dex', dc: 12 }), 7);
  assert.ok(model.receive({ type: 'roll_recorded', payload: roll() }));
  model.acceptRoll(roll(), 4);
  assert.equal(presented.length, 1); assert.equal(model.current().rollLog.length, 1);
  assert.equal(model.acceptSnapshot({ ...snapshot(), revision: 2 }), false);
  assert.equal(model.acceptSnapshot({ ...snapshot(), sessionId: 'another-room' }), false);
  for (const bad of [{ party: [null] }, { party: [{ ...character, stats: { wis: '14' } }] }, { rollLog: [null] }, { revision: -1 }]) assert.equal(isPlayerSessionSnapshot({ ...snapshot(), ...bad }), false);
  model.acceptSnapshot({ ...snapshot(), revision: 5, party: [{ ...character, claimedByClientId: null }] });
  model.acceptRoll(roll('other')); model.acceptRoll(roll('stale-receipt'), 4);
  assert.equal(presented.length, 1); assert.equal(model.current().rollLog.length, 1);
});

test('companion command adapter retains unverified receipts and scopes recovered pending actions', async () => {
  for (const wrong of [{ actorId: 'other' }, { sessionId: 'other' }, { kind: 'claim' }, { requestId: 'other' }, { revision: -1 }]) {
    const saved = storage();
    const queue = new PlayerCommandQueue(actor, saved, async (_action, body) => ({ ok: true, status: 201, json: async () => ({ ...roll(), command: { ...body._command, kind: 'roll', requestId: body.requestId, revision: 4, ...wrong } }) }), () => 'fixed-id');
    queue.prepare('roll', { actorId: character.id });
    await assert.rejects(queue.run(), /could not be confirmed/); assert.ok(queue.pending());
    assert.equal(new PlayerCommandQueue({ ...actor, actorId: 'other' }, saved, async () => {}, () => '').pending(), null);
  }
});

test('companion components expose own sheet, explicit claims and correctly disabled roll controls', () => {
  const table = { identity: actor, snapshot: snapshot(), claimed: character, claim: async () => {}, release: async () => {}, roll: async () => {} };
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  const sheet = render(CharacterSheet, { character, advanced: true });
  for (const text of ['9/12', 'Torches', 'Rope', 'Demo private note', 'WIS']) assert.ok(sheet.includes(text), text);
  assert.match(render(CharacterPicker, { table, disabled: false }), /Release character/);
  const picker = render(CharacterPicker, { table: { ...table, claimed: null, snapshot: { ...snapshot(), party: [{ ...character, claimedByClientId: null }] } }, disabled: false });
  assert.match(picker, /Choose your character/); assert.match(picker, /Claim/); assert.doesNotMatch(picker, /Demo private note/);
  assert.match(render(RollControls, { table, advanced: false, disabled: false }), /Roll d20 \+ 2/);
  assert.match(render(RollControls, { table: { ...table, snapshot: { ...snapshot(), currentAction: null } }, advanced: false, disabled: false }), /button[^>]*disabled=""/);
  assert.match(render(RollControls, { table, advanced: true, disabled: true }), /custom-modifier/);
});

test('companion actual server receipts survive lost reply, refresh and restart; next identical roll has a new ID', { timeout: 20000 }, async () => {
  await withIsolatedServer(async server => {
    const request = (path, token, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    const host = await server.hostToken();
    const initial = await (await request('/api/session-snapshot', host)).json();
    const joined = await (await request('/api/session/join', null, { code: initial.tablePin, label: 'Sparrow' })).json();
    let ids = 0; let loseReply = false; let wire;
    const saved = storage();
    const transport = async (action, body) => {
      const response = await request(playerCommandPaths[action], joined.token, body);
      if (loseReply) { loseReply = false; wire = structuredClone(body); await response.json(); throw new Error('Reply lost after commit'); }
      return response;
    };
    let queue = new PlayerCommandQueue(joined, saved, transport, () => `client-request-${++ids}`);
    queue.prepare('claim', { characterId: initial.party[0].id, clientId: joined.actorId, playerLabel: joined.label });
    const claimed = await queue.run();
    assert.ok(isPlayerSessionSnapshot(claimed.snapshot));
    assert.equal(claimed.snapshot.party[0].claimedByClientId, joined.actorId);
    const fields = { actorId: initial.party[0].id, actorName: initial.party[0].name, dice: 'd20', modifier: 2, note: 'Look' };
    queue.prepare('roll', fields); loseReply = true;
    await assert.rejects(queue.run(), /Reply lost/);
    await server.restart();
    queue = new PlayerCommandQueue(joined, saved, transport, () => `client-request-${++ids}`);
    assert.deepEqual(queue.pending().body, wire);
    const first = await queue.run(); assert.equal(queue.pending(), null);
    queue.prepare('roll', fields); assert.notEqual(queue.pending().body.requestId, wire.requestId);
    const second = await queue.run(); assert.notEqual(first.roll.id, second.roll.id); assert.equal(second.revision, first.revision + 1);
    const current = await (await request('/api/session-snapshot', joined.token)).json();
    assert.ok(isPlayerSessionSnapshot(current)); assert.equal(current.rollLog.length, initial.rollLog.length + 2);
    queue.prepare('release', { clientId: joined.actorId });
    const released = await queue.run(); assert.equal(released.snapshot.party[0].claimedByClientId, null);
    assert.equal(released.snapshot.party[0].notes.length, 0);
  });
});
