import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectSnapshot, projectRuntime, publicSummary, projectRoll } from '../services/game-server/src/projections.ts';

test('allowlist projections exclude other sheets, GM context, unknown fields and private events', () => {
  const source = { campaignId: 'demo', campaignTitle: 'Clocktower', currentScene: 'Entry', joinUrl: '/player/',
    campaignBible: { secret: 'GM_SECRET' }, unknown: 'UNKNOWN_SECRET', approvalQueue: ['APPROVAL_SECRET'],
    party: ['one', 'two'].map(actorId => ({ id: actorId, name: actorId, classLabel: 'Tinker', hp: { current: 4, max: 4 },
      claimedByClientId: actorId, notes: [`NOTE_${actorId}`], inventory: [{ id: 'tool', name: `ITEM_${actorId}` }], resources: [], stats: { str: 9 }, secret: 'SHEET_SECRET',
      build: { review: 'quick_start', subclass: `BUILD_${actorId}`, attacks: [{ name: 'Demo', bonus: '+1', damage: '1d4', secret: 'BUILD_SECRET' }], spellcasting: { spells: [], cantrips: [], hidden: 'SPELL_SECRET' } } })),
    eventLog: [{ visibility: 'gm_only', summary: 'EVENT_SECRET' }, { visibility: 'player_visible', summary: 'Table event', payload: 'PAYLOAD_SECRET' }],
    memoryEntries: [{ visibility: 'gm_only', summary: 'MEMORY_SECRET' }], rollLog: [], currentAction: null };
  const player = { role: 'player', actorId: 'one', sessionId: 'room', label: 'one' };
  const serialized = JSON.stringify(projectSnapshot(source, player));
  for (const hidden of ['GM_SECRET', 'UNKNOWN_SECRET', 'APPROVAL_SECRET', 'NOTE_two', 'ITEM_two', 'SHEET_SECRET', 'EVENT_SECRET', 'PAYLOAD_SECRET', 'MEMORY_SECRET', 'BUILD_two', 'BUILD_SECRET', 'SPELL_SECRET']) {
    assert.ok(!serialized.includes(hidden), hidden);
    assert.ok(!publicSummary(source, player).includes(hidden), `summary: ${hidden}`);
  }
  assert.ok(serialized.includes('NOTE_one'));
  assert.ok(serialized.includes('ITEM_one'));
  const display = JSON.stringify(projectSnapshot(source, { ...player, role: 'spectator' }));
  assert.ok(!display.includes('NOTE_one'));
  assert.ok(!display.includes('ITEM_one'));
  assert.ok(serialized.includes('BUILD_one'));
  assert.ok(!display.includes('BUILD_one'));
  assert.ok(!display.includes('Table event'));
  assert.equal(projectSnapshot(source, { ...player, role: 'gm' }), source);
  assert.ok(!JSON.stringify(projectRuntime({ id: 'runtime', services: ['PRIVATE_ENDPOINT'], clients: ['PRIVATE_ID'], warnings: ['PRIVATE_PATH'] }, player)).includes('PRIVATE'));
});

test('player roll projection keeps the public DC outcome and drops unknown roll fields', () => {
  const roll = { id: 'r1', actorId: 'a', actorName: 'Demo', dice: '1d20+7', modifier: 7, rolled: 10, total: 17, advantage: null, note: 'arcana',
    timestamp: '2026-10-25T12:00:00.000Z', secret: 'ROLL_SECRET', action: { id: 'x', description: 'Read runes', dc: 13, success: true, hidden: 'ACTION_SECRET' } };
  const projected = projectRoll(roll);
  assert.deepEqual(projected.action, { id: 'x', description: 'Read runes', dc: 13, success: true });
  assert.ok(!JSON.stringify(projected).includes('SECRET'));
  assert.equal(projectRoll({ ...roll, action: undefined }).action, undefined);
});
