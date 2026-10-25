import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const built = process.env.BDE_TEST_BUILT === '1';
const { buildAiSceneContext } = await import(`../services/game-server/${built ? 'dist/ai-context.js' : 'src/ai-context.ts'}`);

test('AI context inherits container visibility, retains source labels and excludes private fields before prompting', () => {
  const snapshot = { campaignTitle: 'Demo', currentScene: 'Public square', campaignBible: { visibility: 'gm_only' },
    activeSceneContext: { location: { name: 'PRIVATE_LOCATION', summary: 'PRIVATE_SUMMARY', visibility: 'gm_only' },
      facts: [{ text: 'PRIVATE_FACT', source: 'PRIVATE_SOURCE_PATH' }], tone: ['PRIVATE_TONE'], npcs: [{ motive: 'PRIVATE_MOTIVE' }] },
    eventLog: ['gm_only', 'player_visible', 'public_demo'].map(visibility => ({ visibility, summary: `${visibility}_EVENT`, payload: { private: 'PRIVATE_PAYLOAD' } })),
    party: [{ name: 'Demo hero', classLabel: 'Explorer', hp: { current: 3, max: 5 }, notes: ['PRIVATE_NOTE'], inventory: ['PRIVATE_ITEM'] }] };
  const original = structuredClone(snapshot), publicContext = buildAiSceneContext(snapshot, 'public_demo');
  assert.doesNotMatch(JSON.stringify(publicContext), /PRIVATE|gm_only_EVENT|player_visible_EVENT/);
  assert.deepEqual(publicContext.recentEvents, ['public_demo_EVENT']); assert.equal(publicContext.audience, 'public_demo');
  assert.deepEqual(publicContext.sources, [{ source: 'table_event', visibility: 'public_demo', text: 'public_demo_EVENT' }]);
  const gm = buildAiSceneContext(snapshot, 'gm_only'); assert.equal(gm.audience, 'gm_only'); assert.ok(gm.facts.includes('PRIVATE_FACT'));
  assert.equal(gm.sources.find(source => source.source === 'campaign_bible').visibility, 'gm_only');
  assert.doesNotMatch(JSON.stringify(gm), /PRIVATE_SOURCE_PATH|PRIVATE_PAYLOAD|PRIVATE_NOTE|PRIVATE_ITEM|PRIVATE_MOTIVE/);
  assert.deepEqual(snapshot, original);
  snapshot.campaignBible.visibility = 'public_demo'; snapshot.activeSceneContext.location.visibility = 'public_demo';
  const shared = buildAiSceneContext(snapshot, 'public_demo'); assert.equal(shared.facts[0], 'PRIVATE_FACT'); assert.ok(shared.location);
  assert.deepEqual(original.party, snapshot.party);
  snapshot.activeSceneContext.facts = Array.from({ length: 100 }, () => ({ text: 'x'.repeat(10000) }));
  snapshot.party = Array.from({ length: 100 }, () => original.party[0]);
  const bounded = buildAiSceneContext(snapshot, 'public_demo'); assert.equal(bounded.facts.length, 8); assert.equal(bounded.facts[0].length, 2000); assert.equal(bounded.activeCharacters.length, 20);
});

test('actual public narration excludes stored private/player events while GM guidance preserves labeled context', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    await server.shutdown();
    const database = new Database(resolve(server.folder, 'demo.db'));
    try {
      const insert = database.prepare('INSERT INTO event_log (id, data, timestamp) VALUES (?, ?, ?)');
      for (const [visibility, summary] of [['gm_only', 'PRIVATE_GM_EVENT_CANARY'], ['player_visible', 'PRIVATE_PLAYER_EVENT_CANARY'], ['public_demo', 'PUBLIC_DEMO_EVENT']]) {
        const event = { id: randomUUID(), category: 'state', type: 'initiative_set', actor: { id: 'demo', kind: 'gm', label: 'Demo' },
          visibility, summary, timestamp: new Date().toISOString(), payload: { private: 'PRIVATE_PAYLOAD_CANARY' } };
        insert.run(event.id, JSON.stringify(event), event.timestamp);
      }
    } finally { database.close(); }
    await server.restart();
    const token = (await server.hostToken()).trim();
    const call = path => fetch(server.base + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(4000) });
    assert.equal((await call('/api/local-model/draft')).status, 200);
    assert.equal((await call('/api/director-mode/draft')).status, 200);
    const inputs = (await readFile(resolve(server.folder, 'synthetic-ai-inputs.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(inputs.length, 2);
    assert.doesNotMatch(JSON.stringify(inputs[0]), /PRIVATE_GM_EVENT_CANARY|PRIVATE_PLAYER_EVENT_CANARY|PRIVATE_PAYLOAD_CANARY/);
    assert.match(JSON.stringify(inputs[0]), /PUBLIC_DEMO_EVENT/); assert.match(JSON.stringify(inputs[0]), /Output audience: public_demo/);
    assert.match(JSON.stringify(inputs[1]), /PRIVATE_GM_EVENT_CANARY/); assert.match(JSON.stringify(inputs[1]), /PRIVATE_PLAYER_EVENT_CANARY/);
    assert.match(JSON.stringify(inputs[1]), /Output audience: gm_only/); assert.doesNotMatch(JSON.stringify(inputs[1]), /PRIVATE_PAYLOAD_CANARY/);
    const logs = await (await fetch(server.base + '/api/ai-logs', { headers: { authorization: `Bearer ${token}` } })).json();
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_|PUBLIC_DEMO_EVENT/);
  }, { aiReplies: ['Prepared public demo narration.', 'Prepared GM guidance.'], captureAiInput: true });
});
