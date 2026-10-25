import { hostSnapshot, hostRuntime, mediaJob, assetRecord } from "./helpers/host-fixtures.mjs";
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMediaJobActions } from '../apps/gm-dashboard/src/ttrpg/media-job-actions.ts';
import { MediaJobQueuePanel, GeneratedMediaPanel } from '../apps/gm-dashboard/src/ttrpg/MediaPanels.tsx';
import { AudioLibraryPanel, AudioCuePanel } from '../apps/gm-dashboard/src/ttrpg/AudioPanels.tsx';

function fixture(response) {
  const requests = [], snapshots = [], runtimes = [], statuses = [], pending = [], refreshes = [];
  const actions = createMediaJobActions({
    request: async (path, options) => { requests.push({ path, options }); return response(); },
    setSnapshot: value => snapshots.push(value), setRuntime: value => runtimes.push(value),
    setPendingActionKey: value => pending.push(value), setMediaQueueStatus: value => statuses.push(value),
    loadCleanupReport: async options => { refreshes.push(options); }
  });
  return { actions, requests, snapshots, runtimes, statuses, pending, refreshes };
}

test('host media actions preserve distinct manual endpoints and apply confirmed metadata', async () => {
  const snapshot = hostSnapshot(), runtime = hostRuntime();
  const f = fixture(() => ({ ok: true, json: async () => ({ sessionSnapshot: snapshot, runtimeStatus: runtime,
    job: mediaJob(), asset: assetRecord() }) }));
  await f.actions.queueCharacterVisualCanonJob('hero');
  await f.actions.startMediaJob('demo-job');
  await f.actions.markMediaJobGenerated('demo-job');
  await f.actions.failMediaJob('demo-job');
  assert.deepEqual(f.requests.map(item => item.path), ['/api/characters/hero/visual-canon-job',
    '/api/media-jobs/demo-job/start', '/api/media-jobs/demo-job/mark-generated', '/api/media-jobs/demo-job/fail']);
  assert.ok(f.requests.every(item => item.options.method === 'POST'));
  assert.deepEqual(JSON.parse(f.requests.at(-1).options.body), { error: 'Marked failed from GM dashboard.' });
  assert.deepEqual(f.snapshots, [snapshot, snapshot, snapshot, snapshot]);
  assert.deepEqual(f.runtimes, [runtime]);
  assert.deepEqual(f.statuses, ['queueing-visual-canon', 'visual-canon:demo-job', 'starting', 'started:demo-job',
    'recording', 'generated:demo-asset', 'failing', 'failed-job:demo-job']);
  assert.deepEqual(f.pending, ['visual-canon-hero', '', 'media-start-demo-job', '',
    'media-generated-demo-job', '', 'media-failed-demo-job', '']);
  assert.deepEqual(f.refreshes, Array.from({ length: 4 }, () => ({ silent: true })));
});

test('media admission errors surface pressure without changing snapshot; unavailable requests release busy state', async () => {
  const runtime = hostRuntime();
  const f = fixture(() => ({ ok: false, json: async () => ({ pressure: { summary: 'Synthetic busy GPU' }, runtimeStatus: runtime }) }));
  await f.actions.startMediaJob('demo-job');
  assert.deepEqual(f.runtimes, [runtime]); assert.deepEqual(f.snapshots, []);
  assert.equal(f.statuses.at(-1), 'blocked:Synthetic busy GPU'); assert.equal(f.pending.at(-1), '');
  assert.deepEqual(f.refreshes, []);
  const offline = fixture(() => { throw new Error('Synthetic unavailable'); });
  for (const method of ['queueCharacterVisualCanonJob', 'startMediaJob', 'markMediaJobGenerated', 'failMediaJob']) {
    await offline.actions[method]('demo');
    assert.equal(offline.statuses.at(-1), 'failed'); assert.equal(offline.pending.at(-1), '');
  }
  assert.deepEqual(offline.snapshots, []);
});

test('media queue preserves manual status controls and generated metadata remains distinct', () => {
  const snapshot = { mediaJobs: [], assetRecords: [] }, media = { mediaQueueStatus: '' };
  const queue = () => renderToStaticMarkup(React.createElement(MediaJobQueuePanel, { snapshot, pendingActionKey: '', media }));
  assert.match(queue(), /No queued media jobs yet/);
  snapshot.mediaJobs = [{ id: 'demo', type: 'image', status: 'failed', createdAt: '2026-10-24T00:00:00Z',
    visibility: 'gm_only', priority: 'low', runWhen: 'manual', campaignId: 'demo', settings: {}, prompt: 'Synthetic landscape', error: 'Synthetic unavailable' }];
  assert.match(queue(), /Retry Job/); assert.match(queue(), /Synthetic unavailable/);
  snapshot.mediaJobs[0].settings.routerSubmissionAttemptedAt = '2026-10-25T00:00:00Z';
  assert.match(queue(), /disabled=""[^>]*>\s*Submission Attempted/);
  assert.match(queue(), /Check ComfyUI before queueing a new job/);
  delete snapshot.mediaJobs[0].settings.routerSubmissionAttemptedAt;
  snapshot.mediaJobs[0].status = 'running';
  assert.match(queue(), /disabled=""[^>]*>\s*Start Job/);
  assert.match(renderToStaticMarkup(React.createElement(GeneratedMediaPanel, { snapshot })), /No generated media metadata recorded yet/);
});

test('local audio views preserve disabled service, playback, track and cue states', () => {
  const audio = { audioServiceUrl: '', audioTracks: [], audioPlayback: null, audioCuePlayStatus: '' };
  const library = () => renderToStaticMarkup(React.createElement(AudioLibraryPanel, { audio }));
  assert.match(library(), /Audio service not configured/);
  audio.audioServiceUrl = 'http://127.0.0.1:4322';
  audio.audioTracks = [{ id: 'demo-track', filename: 'demo.wav', kind: 'music', tags: ['prepared'] }];
  audio.audioPlayback = { currentTrackId: 'demo-track', volume: 0.5, muted: true, loop: true, status: 'playing' };
  assert.match(library(), /demo.wav/); assert.match(library(), /Unmute/); assert.match(library(), /50%/);
  const snapshot = { audioCueQueue: [] };
  const cues = () => renderToStaticMarkup(React.createElement(AudioCuePanel, { audio, snapshot, pendingActionKey: '' }));
  assert.match(cues(), /No audio cues queued/);
  snapshot.audioCueQueue = [{ id: 'demo-cue', kind: 'music', status: 'playing', tags: ['prepared'], loop: true, volume: 0.5 }];
  audio.audioCuePlayStatus = 'failed:Synthetic offline';
  assert.match(cues(), /disabled=""[^>]*>Playing/); assert.match(cues(), /Synthetic offline/);
});

test('malformed media confirmations apply neither snapshot nor runtime and release busy state', async () => {
  for (const body of [null, {},
    { sessionSnapshot: { ...hostSnapshot(), campaignBible: null }, job: mediaJob(), asset: assetRecord() },
    { sessionSnapshot: hostSnapshot(), job: {}, asset: {} }
  ]) {
    const f = fixture(() => Response.json(body));
    for (const method of ['queueCharacterVisualCanonJob', 'startMediaJob', 'markMediaJobGenerated', 'failMediaJob']) {
      await f.actions[method]('demo');
      assert.equal(f.statuses.at(-1), 'failed'); assert.equal(f.pending.at(-1), '');
    }
    assert.deepEqual(f.snapshots, []); assert.deepEqual(f.runtimes, []); assert.deepEqual(f.refreshes, []);
  }
  const malformedRuntime = fixture(() => Response.json({ sessionSnapshot: hostSnapshot(), job: mediaJob(), runtimeStatus: { services: [] } }));
  await malformedRuntime.actions.startMediaJob('demo');
  assert.deepEqual(malformedRuntime.snapshots, []); assert.deepEqual(malformedRuntime.runtimes, []);
  const denied = fixture(() => Response.json({ runtimeStatus: { services: [] }, pressure: { summary: ['invalid'] }, error: {} }, { status: 503 }));
  await denied.actions.startMediaJob('demo');
  assert.deepEqual(denied.runtimes, []); assert.equal(denied.statuses.at(-1), 'failed');
});


test('asset approval applies only validated host confirmation and releases busy state on failure', async () => {
  const snapshot = hostSnapshot(), record = { ...assetRecord(), status: 'approved' };
  const f = fixture(() => Response.json({ ok: true, asset: record, sessionSnapshot: snapshot }));
  await f.actions.approveAsset('demo-asset'); assert.equal(f.requests[0].path, '/api/assets/demo-asset/approve');
  assert.deepEqual(f.snapshots, [snapshot]); assert.equal(f.pending.at(-1), ''); assert.equal(f.statuses.at(-1), 'approved:demo-asset');
  const failed = fixture(() => Response.json({ error: 'Missing file' }, { status: 404 }));
  await failed.actions.approveAsset('demo-asset'); assert.deepEqual(failed.snapshots, []); assert.equal(failed.pending.at(-1), ''); assert.equal(failed.statuses.at(-1), 'failed');
});
