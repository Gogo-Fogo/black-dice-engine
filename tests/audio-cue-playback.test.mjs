import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAudioCuePlayback, AudioTrackNotFound } from '../services/game-server/src/audio-cue-playback.ts';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const cue = () => ({ id: 'demo-cue', kind: 'ambience', status: 'queued', visibility: 'gm_only', trigger: 'manual',
  tags: ['rain'], loop: true, volume: 0.6, fadeInSeconds: 0, fadeOutSeconds: 0, createdAt: 'demo' });
const track = { id: 'demo-track', filename: 'demo.ogg', relativePath: 'demo.ogg', localPath: 'synthetic/demo.ogg', urlPath: '/audio/demo.ogg', kind: 'ambience', tags: ['RAIN'] };
const confirmation = { ok: true, playbackState: { status: 'playing', currentTrackId: track.id, volume: 0.6,
  muted: false, loop: true, startedAt: 'demo', pausedAt: null } };
const base = 'http://127.0.0.1:1';

test('audio playback validates library and matching play confirmation and shares concurrent cue requests', async () => {
  const requests = []; let resolveRead;
  const owner = createAudioCuePlayback(async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/api/library')) return new Promise(resolve => { resolveRead = resolve; });
    return Response.json(confirmation);
  });
  const value = cue();
  const first = owner.play(value, base), second = owner.play(value, base);
  assert.equal(first, second); assert.equal(requests.length, 1);
  resolveRead(Response.json({ tracks: [track] }));
  assert.deepEqual(await first, track); assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].init.body), { trackId: track.id, volume: value.volume, loop: value.loop });
  assert.equal(value.status, 'queued', 'State application belongs to the server caller');
  owner.dispose(); await assert.rejects(owner.play(value, base), /disposed/);
});

test('audio playback rejects malformed, failed, unmatched and mismatched service replies', async () => {
  for (const library of [{}, { tracks: [{}] }, { tracks: [{ ...track, tags: [null] }] }]) {
    let calls = 0;
    const owner = createAudioCuePlayback(async () => { calls++; return Response.json(library); });
    await assert.rejects(owner.play(cue(), base), /Invalid audio library/); assert.equal(calls, 1); owner.dispose();
  }
  const empty = createAudioCuePlayback(async () => Response.json({ tracks: [] }));
  await assert.rejects(empty.play(cue(), base), error => error instanceof AudioTrackNotFound && error.availableTracks === 0); empty.dispose();
  for (const playback of [{}, { ...confirmation, ok: false }, { ...confirmation, playbackState: { ...confirmation.playbackState, currentTrackId: 'wrong' } },
    { ...confirmation, playbackState: { ...confirmation.playbackState, status: 'idle' } },
    { ...confirmation, playbackState: { ...confirmation.playbackState, volume: 1 } },
    { ...confirmation, playbackState: { ...confirmation.playbackState, loop: false } }]) {
    const owner = createAudioCuePlayback(async url => Response.json(url.endsWith('/api/library') ? { tracks: [track] } : playback));
    await assert.rejects(owner.play(cue(), base), /not confirmed/); owner.dispose();
  }
  const unavailable = createAudioCuePlayback(async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(unavailable.play(cue(), base), /Failed to fetch/); unavailable.dispose();
});

test('audio playback deadline and disposal settle ignored aborts and prevent late library reads from playing', async () => {
  for (const dispose of [false, true]) {
    const timers = new Map(); let resolveRead, signal, requests = 0;
    const owner = createAudioCuePlayback((_url, init) => {
      requests++; signal = init.signal; return new Promise(resolve => { resolveRead = resolve; });
    }, { schedule(callback, delay) { assert.equal(delay, 10000); timers.set(1, callback); return 1; }, cancel(timer) { timers.delete(timer); } });
    const pending = owner.play(cue(), base), failed = assert.rejects(pending, /cancelled or timed out/);
    if (dispose) owner.dispose(); else timers.get(1)();
    await failed; assert.equal(signal.aborted, true); assert.equal(timers.size, 0);
    resolveRead(Response.json({ tracks: [track] })); await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 1); owner.dispose();
  }
});

test('real audio cue route preserves queued state on invalid services and marks playing only on matching confirmation', { timeout: 15000 }, async () => {
  const library = { url: base + '/api/library', body: { tracks: [track] } };
  const play = body => ({ url: base + '/api/play', method: 'POST', body });
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const request = (path, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(3000) });
    const scene = await (await request('/api/scene-packet')).json();
    const queued = await (await request('/api/scene-packet/queue-audio', scene.packet)).json();
    const id = queued.cues[0].id;
    for (const status of [502, 502, 200]) {
      const response = await request(`/api/audio-cues/${id}/play`, {});
      assert.equal(response.status, status);
      const data = await response.json(); assert.equal(data.cue.status, status === 200 ? 'playing' : 'queued');
      const snapshot = await (await request('/api/session-snapshot')).json();
      assert.equal(snapshot.audioCueQueue.find(cue => cue.id === id).status, status === 200 ? 'playing' : 'queued');
    }
  }, { mockFetches: [
    { url: base + '/api/library', body: { tracks: [{ id: 'bad' }] } },
    library, play({ ok: true, playbackState: { ...confirmation.playbackState, currentTrackId: 'wrong' } }),
    library, play(confirmation)
  ] });
});
