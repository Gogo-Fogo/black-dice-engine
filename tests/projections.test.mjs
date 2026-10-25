import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectSnapshot, projectRuntime, publicSummary } from '../services/game-server/src/projections.ts';

test('allowlist projections exclude other sheets, GM context, unknown fields and private events', () => {
  const source = { campaignId: 'demo', campaignTitle: 'Clocktower', currentScene: 'Entry', joinUrl: '/player/',
    campaignBible: { secret: 'GM_SECRET' }, unknown: 'UNKNOWN_SECRET', approvalQueue: ['APPROVAL_SECRET'],
    party: ['one', 'two'].map(actorId => ({ id: actorId, name: actorId, classLabel: 'Tinker', hp: { current: 4, max: 4 },
      claimedByClientId: actorId, notes: [`NOTE_${actorId}`], inventory: [{ id: 'tool', name: `ITEM_${actorId}` }], resources: [], stats: { str: 9 }, secret: 'SHEET_SECRET' })),
    eventLog: [{ visibility: 'gm_only', summary: 'EVENT_SECRET' }, { visibility: 'player_visible', summary: 'Table event', payload: 'PAYLOAD_SECRET' }],
    memoryEntries: [{ visibility: 'gm_only', summary: 'MEMORY_SECRET' }], rollLog: [], currentAction: null };
  const player = { role: 'player', actorId: 'one', sessionId: 'room', label: 'one' };
  const serialized = JSON.stringify(projectSnapshot(source, player));
  for (const hidden of ['GM_SECRET', 'UNKNOWN_SECRET', 'APPROVAL_SECRET', 'NOTE_two', 'ITEM_two', 'SHEET_SECRET', 'EVENT_SECRET', 'PAYLOAD_SECRET', 'MEMORY_SECRET']) {
    assert.ok(!serialized.includes(hidden), hidden);
    assert.ok(!publicSummary(source, player).includes(hidden), `summary: ${hidden}`);
  }
  assert.ok(serialized.includes('NOTE_one'));
  assert.ok(serialized.includes('ITEM_one'));
  const display = JSON.stringify(projectSnapshot(source, { ...player, role: 'spectator' }));
  assert.ok(!display.includes('NOTE_one'));
  assert.ok(!display.includes('ITEM_one'));
  assert.ok(!display.includes('Table event'));
  assert.equal(projectSnapshot(source, { ...player, role: 'gm' }), source);
  assert.ok(!JSON.stringify(projectRuntime({ id: 'runtime', services: ['PRIVATE_ENDPOINT'], clients: ['PRIVATE_ID'], warnings: ['PRIVATE_PATH'] }, player)).includes('PRIVATE'));
});
