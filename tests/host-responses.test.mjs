import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { sceneBeatKinds, isCharacter, isSessionSnapshot, isSnapshotResponse, isScenePacketResponse, isSceneQueueResponse,
  isLocalDraftResponse, isDirectorDraftResponse, isAudioLibraryResponse, isAudioPlaybackResponse, isAudioCueResponse } from '../packages/contracts/dist/index.js';
import { readHostResponse } from '../apps/gm-dashboard/src/ttrpg/read-host-response.ts';
import { createMediaJobActions } from '../apps/gm-dashboard/src/ttrpg/media-job-actions.ts';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
import { hostSnapshot } from './helpers/host-fixtures.mjs';
import {png} from './helpers/portrait-fixture.mjs';

test('shared host response guards accept actual scene queues, character creation and manual media producers', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const request = (path, init) => fetch(server.base + path, { ...init,
      headers: { ...init?.headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    const post = async (path, body) => {
      const response = await request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.ok(response.ok, `${path}: ${response.status} ${response.ok ? "" : await response.text()}`); return response;
    };
    const scene = await readHostResponse(await request('/api/scene-packet'), isScenePacketResponse);
    assert.equal(scene.validation.ok, true);
    assert.ok(scene.packet.beats.some(beat => beat.kind === 'memory'));
    const schema = JSON.parse(await readFile(new URL('../packages/shared-schemas/scene-packet.schema.json', import.meta.url), 'utf8'));
    assert.deepEqual(schema.properties.beats.items.properties.kind.enum, [...sceneBeatKinds]);
    for (const queue of ['queue-proposals', 'queue-media', 'queue-audio']) {
      const result = await readHostResponse(await post('/api/scene-packet/' + queue, scene.packet), isSceneQueueResponse);
      assert.ok(result.queuedCount >= 0); assert.equal(result.validation.ok, true);
    }
    const character = await readHostResponse(await post('/api/characters', { name: 'Demo courier', classLabel: 'Explorer', requestId: 'response-character' }), isCharacter);
    assert.equal(character.name, 'Demo courier');
    const uploaded=await (await post(`/api/characters/${character.id}/portrait`,{requestId:'response-portrait',image:'data:image/png;base64,'+png().toString('base64'),description:'Original demo courier'})).json();
    const referenceId=uploaded.sessionSnapshot.party.find(c=>c.id===character.id).portrait.pendingId;
    await post(`/api/characters/${character.id}/portrait/review`,{requestId:'response-portrait-approve',referenceId,approve:true});
    const snapshots = [], statuses = [];
    const actions = createMediaJobActions({ request, setSnapshot: value => snapshots.push(value),
      setRuntime: () => {}, setPendingActionKey: () => {}, setMediaQueueStatus: value => statuses.push(value), loadCleanupReport: async () => {} });
    await actions.queueCharacterVisualCanonJob(character.id);
    assert.match(statuses.at(-1), /^visual-canon:/);
    const id = snapshots.at(-1).mediaJobs[0].id;
    await actions.markMediaJobGenerated(id); assert.match(statuses.at(-1), /^generated:/);
    await actions.failMediaJob(id); assert.match(statuses.at(-1), /^failed-job:/);
    assert.equal(snapshots.length, 3);
    assert.ok(snapshots.at(-1).eventLog.some(event => event.type === 'character_created'));
    const assets = snapshots.at(-1).assetRecords;
    assert.ok(assets.some(asset => asset.metadata.mediaJobId === id));
    await post('/api/save-now', {});
    await server.restart();
    const restored = await readHostResponse(await request('/api/session-snapshot'), isSessionSnapshot);
    assert.deepEqual(restored.assetRecords, assets, 'Asset metadata and its required SQL status survive explicit save and restart');
  });
});

test('host JSON boundary rejects malformed scene, draft, audio and character responses before returning data', async () => {
  const snapshot = hostSnapshot(), validation = { ok: true, errors: [] };
  const cases = [
    [isSnapshotResponse, { sessionSnapshot: { ...snapshot, rollLog: [{}] } }],
    [isScenePacketResponse, { packet: { id: 'incomplete' }, validation }],
    [isSceneQueueResponse, { sessionSnapshot: snapshot, queuedCount: -1, validation }],
    [isSceneQueueResponse, { sessionSnapshot: snapshot, queuedCount: 0, validation: { ok: true, errors: [false] } }],
    [isLocalDraftResponse, { draft: {}, validation }], [isDirectorDraftResponse, { draft: {}, validation }],
    [isAudioLibraryResponse, { tracks: [{ id: 'incomplete-track' }] }],
    [isAudioPlaybackResponse, { playbackState: { status: 'playing' } }],
    [isAudioCueResponse, { cue: {}, matchedTrack: { filename: 'incomplete.ogg' } }],
    [isCharacter, { name: 'incomplete-character' }]
  ];
  for (const [guard, body] of cases) {
    for (const malformed of [null, [], body]) await assert.rejects(readHostResponse(Response.json(malformed), guard), /Invalid host response/);
  }
  await assert.rejects(readHostResponse(new Response('not JSON'), isSnapshotResponse), SyntaxError);
  assert.deepEqual(await readHostResponse(Response.json({ tracks: [] }), isAudioLibraryResponse), { tracks: [] });
});
