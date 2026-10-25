import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNarrationPlayback } from '../apps/gm-dashboard/src/ttrpg/narration-playback.ts';

test('narration audio owns its URL and stops/revokes on rejected play, normal end and cleanup', async () => {
  const audio = [], revoked = []; let ended = 0, reject = true, sequence = 0;
  const playback = createNarrationPlayback({ context() { throw new Error('No context'); },
    createUrl: () => `blob:${++sequence}`, revokeUrl: url => revoked.push(url),
    audio() { const item = { pauseCount: 0, pause() { this.pauseCount++; }, removeAttribute() {},
      async play() { if (reject) throw new Error('Synthetic autoplay refusal'); } }; audio.push(item); return item; } });
  assert.equal(await playback.unlock(), false);
  await assert.rejects(playback.play(new Blob(), () => ended++), /autoplay refusal/);
  assert.equal(audio[0].pauseCount, 1); assert.deepEqual(revoked, ['blob:1']);
  reject = false; await playback.play(new Blob(), () => ended++);
  const oldEnded = audio[1].onended;
  audio[1].onended(); assert.equal(ended, 1); assert.equal(audio[1].pauseCount, 1);
  oldEnded(); assert.equal(ended, 1);
  await playback.play(new Blob(), () => ended++);
  const late = audio[2].onended;
  playback.dispose(); playback.dispose(); late();
  assert.equal(ended, 1); assert.deepEqual(revoked, ['blob:1', 'blob:2', 'blob:3']);
});

test('late narration decode cannot start after disposal, and contexts close once', async () => {
  let decoded, sources = 0, closed = 0;
  const context = { state: 'running', async resume() {}, decodeAudioData: () => new Promise(resolve => { decoded = resolve; }),
    createBufferSource() { sources++; }, async close() { closed++; } };
  const playback = createNarrationPlayback({ context: () => context, createUrl: () => assert.fail('Buffer playback needs no object URL') });
  assert.equal(await playback.unlock(), true);
  const pending = playback.play(new Blob(), () => assert.fail('Disposed playback ended'));
  await new Promise(resolve => setImmediate(resolve));
  playback.dispose(); playback.dispose(); decoded({});
  assert.equal(await pending, false); assert.equal(sources, 0); assert.equal(closed, 1);
});

test('decoded narration disconnects/stops its source and ignores old end callbacks', async () => {
  let source, stops = 0, disconnects = 0, ended = 0;
  const context = { state: 'running', destination: {}, async resume() {}, async close() {}, async decodeAudioData() { return {}; },
    createBufferSource() { source = { connect() {}, start() {}, stop() { stops++; }, disconnect() { disconnects++; } }; return source; } };
  const playback = createNarrationPlayback({ context: () => context });
  await playback.unlock(); assert.equal(await playback.play(new Blob(), () => ended++), true);
  const late = source.onended; playback.stop(); late(); playback.dispose();
  assert.equal(ended, 0); assert.equal(stops, 1); assert.equal(disconnects, 1);
});
