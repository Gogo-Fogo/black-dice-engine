import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSessionSnapshot, isRuntimeStatus, isMemoryEntry, isCleanupReport, isAiLogEntry,
  isErrorEvent, isAudioTrack, isPlaybackState, isLocalModelAdapterDraft, isDirectorModeAdapterDraft
} from '../packages/contracts/dist/index.js';
import { HostUpdates } from '../apps/gm-dashboard/src/ttrpg/host-updates.ts';
import { createHostRequests } from '../apps/gm-dashboard/src/ttrpg/host-requests.ts';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

test('real host contracts reject nested corruption over HTTP and connected frames without partial updates', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const request = (path, init) => fetch(server.base + path, { ...init,
      headers: { ...init?.headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    const client = createHostRequests(request);
    try {
      const memory = await client.memory();
      const snapshot = memory.sessionSnapshot, runtime = await client.runtime(), report = await client.cleanup();
      assert.equal(isSessionSnapshot(snapshot), true); assert.equal(isRuntimeStatus(runtime), true);
      assert.equal(isMemoryEntry(memory.entry), true); assert.equal(isCleanupReport(report), true);
      assert.equal(isSessionSnapshot({ ...snapshot, futureExtension: 'compatible' }), true);
      const mutations = [
        value => { value.revision = -1; },
        value => { value.mode = 'party'; },
        value => { delete value.sessionId; },
        value => { value.party[0].hp.current = 'invalid'; },
        value => { value.campaignBible.safety.lines = [42]; },
        value => { value.activeSceneContext.npcs = [{ name: 'Incomplete' }]; },
        value => { value.memoryEntries[0].source.kind = 'unknown'; },
        value => { value.approvalQueue = [{ id: 'missing-event' }]; },
        value => { value.mediaJobs = [{ id: 'missing-settings' }]; },
        value => { value.assetRecords = [{ id: 'missing-metadata' }]; },
        value => { value.audioCueQueue = [{ id: 'incomplete-cue' }]; },
        value => { value.currentAction = { type: 'check', description: 'Demo', ability: 'wis', dc: 'hard' }; },
        value => { value.eventLog = [{ id: 'incomplete-event' }]; }
      ];
      for (const mutate of mutations) {
        const bad = structuredClone(snapshot); mutate(bad);
        assert.equal(isSessionSnapshot(bad), false);
        const calls = [];
        const updates = new HostUpdates(Object.fromEntries(['runtime', 'snapshot', 'roll', 'changed'].map(key => [key, value => calls.push(value)])));
        assert.equal(updates.receive({ type: 'connected', payload: { runtimeStatus: runtime, sessionSnapshot: bad } }), false);
        assert.equal(updates.receive({ type: 'session_snapshot', payload: bad }), false);
        assert.deepEqual(calls, [], 'Rejected connected frame must not apply its valid runtime half');
        const malformed = createHostRequests(async () => Response.json(bad));
        try { await assert.rejects(malformed.snapshot(), /Invalid session snapshot/); } finally { malformed.dispose(); }
      }
      const malformedResponses = [
        ['runtime', { ...runtime, services: [{ name: 'Demo', status: 'invented' }] }],
        ['cleanup', { report: { ...report, summary: { ...report.summary, trackedAssets: -1 } } }],
        ['aiLogs', { logs: [{ id: 'incomplete-log' }] }],
        ['errors', { events: [{ id: 'incomplete-error' }] }],
        ['save', { ok: true, sessionSnapshot: { ...snapshot, party: [{}] } }],
        ['scene', { sessionSnapshot: { ...snapshot, campaignBible: null } }],
        ['memory', { ...memory, entry: { ...memory.entry, entities: 'invalid' } }]
      ];
      for (const [method, body] of malformedResponses) {
        const malformed = createHostRequests(async () => Response.json(body));
        try { await assert.rejects(malformed[method]('Demo')); } finally { malformed.dispose(); }
      }
    } finally { client.dispose(); }
  });
});

test('shared diagnostic and audio contracts distinguish complete records from malformed nested values', () => {
  const log = { id: 'demo', kind: 'input_packet', adapter: 'scene_packet', createdAt: 'demo', summary: 'Demo', correlationId: 'demo', details: {} };
  const error = { id: 'demo', severity: 'warning', service: 'demo', summary: 'Demo', message: 'Demo', recoveryHint: 'Retry', visibility: 'gm_only', createdAt: 'demo' };
  const track = { id: 'demo', filename: 'demo.ogg', relativePath: 'demo.ogg', localPath: 'synthetic/demo.ogg', urlPath: '/demo.ogg', kind: 'music', tags: ['demo'] };
  const playback = { status: 'idle', currentTrackId: null, volume: 0.5, muted: false, loop: false, startedAt: null, pausedAt: null };
  for (const [guard, good, bad] of [
    [isAiLogEntry, log, { ...log, details: [] }], [isErrorEvent, error, { ...error, visibility: 'everyone' }],
    [isAudioTrack, track, { ...track, tags: [false] }], [isPlaybackState, playback, { ...playback, volume: NaN }]
  ]) { assert.equal(guard(good), true); assert.equal(guard(bad), false); assert.equal(guard(null), false); }
});

test('shared adapter contracts retain live producer variants missing from the former dashboard copies', () => {
  const local = { adapter: { mode: 'live', provider: 'ollama', endpointConfigured: true, endpoint: 'http://127.0.0.1:1' },
    request: { scenePacketId: 'demo', sceneTitle: 'Demo', promptPreview: 'Demo', contextSummary: 'Demo', proposedStateEventCount: 0, mediaRequestCount: 0, audioCueCount: 0 },
    response: { narration: 'Demo', gmNotes: [], suggestedNextBeat: 'Demo', riskyStateChangeWarning: null } };
  const director = { adapter: { mode: 'live', provider: 'openai', enabled: false, model: null },
    request: { scenePacketId: 'demo', sceneTitle: 'Demo', promptPreview: 'Demo', contextSummary: 'Demo', memoryEntryCount: 0, pendingApprovalCount: 0 },
    response: { directorGuidance: 'Demo', revealPlan: [], canonizationNotes: [], escalationWarning: null } };
  assert.equal(isLocalModelAdapterDraft(local), true); assert.equal(isDirectorModeAdapterDraft(director), true);
  assert.equal(isLocalModelAdapterDraft({ ...local, response: { ...local.response, gmNotes: 'invalid' } }), false);
  assert.equal(isDirectorModeAdapterDraft({ ...director, request: { ...director.request, pendingApprovalCount: -1 } }), false);
});
