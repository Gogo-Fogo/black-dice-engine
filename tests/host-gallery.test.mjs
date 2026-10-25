import { loadAssetImage } from '../apps/gm-dashboard/src/ttrpg/asset-image.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startGalleryPolling } from '../apps/gm-dashboard/src/ttrpg/gallery-poller.ts';
import { LatestScenePanel, GalleryPanel, GalleryPreview } from '../apps/gm-dashboard/src/ttrpg/GalleryPanels.tsx';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const timers = new Map(), requests = [], updates = [];
  let id = 0;
  const stop = startGalleryPolling({
    read(signal) { return new Promise((resolve, reject) => requests.push({ signal, resolve, reject })); },
    update(images) { updates.push(images); },
    clock: { schedule(callback, delay) { assert.equal(delay, 5000); timers.set(++id, callback); return id; },
      cancel(timer) { timers.delete(timer); } }
  });
  const tick = () => { const [key, callback] = timers.entries().next().value; timers.delete(key); callback(); };
  return { stop, timers, requests, updates, tick };
}

test('gallery reads do not overlap, stop aborts and late completion cannot update or restart', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  assert.equal(f.timers.size, 1); // Only the request deadline, no repeating poll.
  f.tick();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ images: [{ filename: 'late', url: '/images/late' }] });
  await flush();
  assert.deepEqual(f.updates, []);
  f.tick();
  assert.equal(f.requests.length, 2);
  f.stop(); f.stop();
  assert.equal(f.requests[1].signal.aborted, true);
  assert.equal(f.timers.size, 0);
  f.requests[1].resolve({ images: [] });
  await flush();
  assert.deepEqual(f.updates, []);
  assert.equal(f.timers.size, 0);
});

test('gallery retains its last valid result across failures and malformed responses', async () => {
  const f = fixture();
  const image = { filename: 'demo.svg', url: '/images/demo.svg' };
  f.requests[0].resolve({ images: [{ ...image, internal: 'ignored' }] });
  await flush();
  assert.deepEqual(f.updates, [[image]]);
  for (const invalid of [null, { images: 'wrong' }, { images: [{ url: '/broken' }] }]) {
    f.tick(); f.requests.at(-1).resolve(invalid); await flush();
    assert.deepEqual(f.updates, [[image]]);
  }
  f.tick(); f.requests.at(-1).reject(new Error('synthetic unavailable')); await flush();
  assert.deepEqual(f.updates, [[image]]);
  f.tick(); f.requests.at(-1).resolve({ images: [] }); await flush();
  assert.deepEqual(f.updates, [[image], []]);
  f.stop(); assert.equal(f.timers.size, 0);
});

test('gallery views preserve empty, latest, thumbnail and expanded states', () => {
  const gallery = { galleryImages: [], galleryFull: null };
  const render = component => renderToStaticMarkup(React.createElement(component, { gallery, scene: 'Demo scene' }));
  assert.equal(render(LatestScenePanel), ''); assert.equal(render(GalleryPanel), ''); assert.equal(render(GalleryPreview), '');
  gallery.galleryImages = [{ filename: 'demo.svg', url: '/images/demo.svg' }];
  assert.match(render(LatestScenePanel), /Demo scene/);
  assert.match(render(GalleryPanel), /alt="demo.svg"/);
  gallery.galleryFull = '/images/demo.svg';
  assert.match(render(GalleryPreview), /alt="Expanded scene"/);
});


test('authenticated gallery image owns its URL, aborts on cleanup and ignores late blobs and external paths', async () => {
  const created = [], revoked = [], updates = []; let signal;
  const urls = { createObjectURL: blob => { created.push(blob); return 'blob:demo'; }, revokeObjectURL: value => revoked.push(value) };
  const stop = loadAssetImage('/api/assets/demo/content', async (_url, init) => { signal = init.signal; return new Response('demo', { headers: { 'content-type': 'image/png' } }); }, value => updates.push(value), urls);
  await flush(); assert.deepEqual(updates, ['blob:demo']); stop(); stop(); assert.equal(signal.aborted, true); assert.deepEqual(revoked, ['blob:demo']);
  let resolveRead;
  const late = loadAssetImage('/api/assets/demo/content', async () => new Promise(done => { resolveRead = done; }), () => assert.fail('Stale image applied'), urls);
  late(); resolveRead(new Response('demo', { headers: { 'content-type': 'image/png' } })); await flush(); assert.equal(created.length, 1);
  loadAssetImage('https://example.invalid/private', async () => assert.fail('External image fetched'), () => assert.fail(), urls)();
});
