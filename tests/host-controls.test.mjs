import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HostControls } from '../apps/gm-dashboard/src/ttrpg/HostControls.tsx';
import { CleanupPanel, MemoryPanel } from '../apps/gm-dashboard/src/ttrpg/ReportPanels.tsx';
import { createHostRequests } from '../apps/gm-dashboard/src/ttrpg/host-requests.ts';
import { createMarkdownDownloads } from '../apps/gm-dashboard/src/ttrpg/markdown-download.ts';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

test('host controls read reports, save, change scene, create memory and export through an authenticated server', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    let sequence = 0;
    const client = createHostRequests((path, init) => {
      const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`);
      // The browser credential adapter supplies command IDs; mirror that boundary here.
      const body = path === '/api/set-scene' ? JSON.stringify({ ...JSON.parse(init.body), requestId: `host-scene-${++sequence}` }) : init.body;
      return fetch(server.base + path, { ...init, headers, body });
    });
    try {
      const initial = await client.snapshot(), runtime = await client.runtime();
      assert.ok(initial.party.length); assert.ok(Array.isArray(runtime.services));
      const cleanupReport = await client.cleanup(), aiLogs = await client.aiLogs(), errorEvents = await client.errors();
      assert.ok(cleanupReport.summary); assert.ok(Array.isArray(aiLogs)); assert.ok(Array.isArray(errorEvents));
      const changed = await client.scene('Synthetic forest overlook');
      assert.equal(changed.currentScene, 'Synthetic forest overlook');
      await assert.rejects(client.scene('x'.repeat(257)), /Host request failed/);
      assert.equal((await client.snapshot()).currentScene, changed.currentScene);
      const memory = await client.memory();
      assert.ok(memory.sessionSnapshot.memoryEntries.some(entry => entry.id === memory.entry.id));
      assert.ok(resolve(memory.exportPath).startsWith(resolve(server.folder, 'exports') + sep));
      const saved = await client.save(); assert.equal(saved.currentScene, changed.currentScene);
      const summary = await client.summary();
      assert.match(summary.filename, /\.md$/); assert.match(await summary.blob.text(), /Synthetic forest overlook/);
      assert.ok(resolve(summary.exportPath).startsWith(resolve(server.folder, 'exports') + sep));
      assert.equal(await readFile(summary.exportPath, 'utf8'), await summary.blob.text());
      const reports = { cleanupReport, cleanupReportStatus: 'ready', memoryEntryStatus: `ready:${memory.entry.id}`, memoryEntryExportPath: memory.exportPath };
      assert.match(renderToStaticMarkup(React.createElement(CleanupPanel, { reports })), /Cleanup report refreshed/);
      assert.match(renderToStaticMarkup(React.createElement(MemoryPanel, { reports, snapshot: memory.sessionSnapshot, pendingActionKey: '' })), /Memory entry saved/);
      await server.restart();
      assert.equal((await client.snapshot()).currentScene, changed.currentScene);
    } finally { client.dispose(); }
  });
});

test('host requests reject failed or malformed confirmations and dispose stale reads across reactivation', async () => {
  let resolveRead, signal, requests = 0;
  const client = createHostRequests((_path, init) => { requests++; signal = init.signal; return new Promise(resolve => { resolveRead = resolve; }); });
  const pending = client.cleanup();
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  client.dispose(); assert.equal(signal.aborted, true);
  await assert.rejects(client.cleanup(), error => error.name === 'AbortError'); assert.equal(requests, 1);
  client.activate(); resolveRead(Response.json({ report: { marker: 'old' } })); await rejected;
  const fresh = client.errors(); resolveRead(Response.json({ events: [] })); assert.deepEqual(await fresh, []);
  client.dispose();
  for (const method of ['cleanup', 'aiLogs', 'errors', 'save', 'memory', 'scene', 'summary']) {
    const failed = createHostRequests(async () => new Response('Synthetic error', { status: 503 }));
    try { await assert.rejects(failed[method]('Demo'), /Host request failed/); } finally { failed.dispose(); }
  }
  for (const method of ['cleanup', 'aiLogs', 'errors', 'save', 'memory', 'scene']) {
    const malformed = createHostRequests(async () => Response.json({}));
    try { await assert.rejects(malformed[method]('Demo')); } finally { malformed.dispose(); }
  }
});

test('Markdown downloads own object URLs and release them on dispatch failure or host cleanup', () => {
  const dispatched = [], revoked = [];
  const downloads = createMarkdownDownloads({ createUrl: () => 'blob:synthetic', revokeUrl: value => revoked.push(value),
    dispatch: (url, filename) => dispatched.push({ url, filename }) });
  downloads.download(new Blob(['Demo']), 'demo.md');
  assert.deepEqual(dispatched, [{ url: 'blob:synthetic', filename: 'demo.md' }]);
  downloads.dispose(); downloads.dispose(); assert.deepEqual(revoked, ['blob:synthetic']);
  const failed = createMarkdownDownloads({ createUrl: () => 'blob:rejected', revokeUrl: value => revoked.push(value),
    dispatch() { throw new Error('Synthetic blocked download'); } });
  assert.throws(() => failed.download(new Blob(), 'demo.md'), /blocked download/);
  failed.dispose(); assert.deepEqual(revoked, ['blob:synthetic', 'blob:rejected']);
});

test('host request deadline aborts the request and reports failure rather than silent cancellation', async () => {
  const timers = new Map(); let sequence = 0, signal;
  const client = createHostRequests((_path, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Abort'), { name: 'AbortError' })), { once: true }));
  }, { schedule(callback, delay) { assert.equal(delay, 10000); timers.set(++sequence, callback); return sequence; },
    cancel(timer) { timers.delete(timer); } });
  const request = client.snapshot();
  const failed = assert.rejects(request, error => error.name !== 'AbortError' && /timed out/.test(error.message));
  timers.values().next().value();
  await failed;
  assert.equal(signal.aborted, true); assert.equal(timers.size, 0); client.dispose();
});

test('host controls keep save feedback separate and retain failed scene drafts', () => {
  const controls = { saveStatus: 'saved', exportStatus: '', sceneStatus: 'failed', sceneTitle: 'Retained draft', autoSearch: false };
  const markup = renderToStaticMarkup(React.createElement(HostControls, { controls, snapshot: null,
    narration: { speaking: false, audioUnlocked: false }, connectionLabel: 'Disconnected', connectionError: '', bootstrapError: '' }));
  assert.match(markup, /Session saved/); assert.doesNotMatch(markup, /Export failed/);
  assert.match(markup, /Retained draft/); assert.match(markup, /Your title is retained/);
});
