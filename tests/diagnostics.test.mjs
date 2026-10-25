import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const built = process.env.BDE_TEST_BUILT === '1';
const { createDiagnostics } = await import(`../services/game-server/${built ? 'dist/diagnostics.js' : 'src/diagnostics.ts'}`);
const { requestAiJson } = await import(`../services/game-server/${built ? 'dist/ai-transport.js' : 'src/ai-transport.ts'}`);

test('diagnostics retain only bounded operational metadata and never fail commands on export errors', () => {
  let exported = '', failures = 0, blocked = false;
  const owner = createDiagnostics({ now: () => 1000, exportAi(value) { if (blocked) throw new Error('PRIVATE_STORAGE_CANARY'); exported = value; }, onExportFailure() { failures++; } });
  for (let index = 0; index < 100; index++) {
    owner.recordAiLog({ kind: 'output_packet', adapter: 'local_model', correlationId: 'PRIVATE_TOKEN_CANARY', summary: 'PRIVATE_PROMPT_CANARY'.repeat(10000),
      details: { sceneTitle: 'PRIVATE_SCENE_CANARY', localPath: 'C:\\PRIVATE_PATH_CANARY', error: 'PRIVATE_PROVIDER_CANARY', proposedStateEventCount: index,
        mediaRequestCount: Infinity, audioCueCount: -1, warningPresent: true, arbitrary: { deep: 'PRIVATE_CANARY' } } });
    owner.recordErrorEvent({ severity: 'error', service: 'PRIVATE_URL_CANARY', summary: 'PRIVATE_CANARY', message: 'PRIVATE_CANARY',
      recoveryHint: 'PRIVATE_CANARY', visibility: 'player_visible', correlationId: 'PRIVATE_CANARY' });
  }
  assert.equal(owner.aiLogs.length, 24); assert.equal(owner.errorEvents.length, 24);
  assert.doesNotMatch(JSON.stringify(owner.aiLogs) + JSON.stringify(owner.errorEvents) + exported, /PRIVATE|C:\\/);
  assert.equal(owner.aiLogs[0].details.proposedStateEventCount, 99); assert.equal(owner.aiLogs[0].details.errorPresent, true);
  assert.equal(owner.aiLogs[0].details.mediaRequestCount, undefined); assert.equal(owner.errorEvents[0].visibility, 'gm_only');
  assert.ok(Buffer.byteLength(exported) < 16000);
  const entry = { kind: 'tool_call', adapter: 'scene_packet', correlationId: 'redacted', summary: '', details: {} };
  blocked = true; owner.recordAiLog(entry); owner.recordAiLog(entry); assert.equal(failures, 1);
  blocked = false; owner.recordAiLog(entry); blocked = true; owner.recordAiLog(entry); assert.equal(failures, 2);
});

test('AI JSON transport bounds bodies and never reads provider error bodies', async () => {
  const signal = new AbortController().signal;
  const call = reply => requestAiJson(async () => reply, 'http://127.0.0.1:1/demo', {}, signal);
  assert.deepEqual(await call(Response.json({ message: { content: 'Demo' } })), { message: { content: 'Demo' } });
  let pulled = 0;
  const response = new Response(new ReadableStream({ pull() { pulled++; throw new Error('PRIVATE_PROVIDER_CANARY'); } }, { highWaterMark: 0 }), { status: 500 });
  await assert.rejects(call(response), /AI provider HTTP 500/); assert.equal(pulled, 0);
  await assert.rejects(call(new Response('PRIVATE_HTML_CANARY')), /must be JSON/);
  await assert.rejects(call(new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '262145' } })), /size limit/);
  await assert.rejects(call(new Response('x'.repeat(262145), { headers: { 'content-type': 'application/json' } })), /size limit/);
  assert.equal(await call(Response.json(null)), null);
});

test('AI transport cancels ignored fetch/body deadlines and discards late replies', async () => {
  const controller = new AbortController(); let release, canceled = 0;
  const pending = requestAiJson(() => new Promise(done => { release = done; }), 'http://127.0.0.1:1/demo', {}, controller.signal);
  const rejected = assert.rejects(pending, /canceled or timed out/); controller.abort(); await rejected;
  release(new Response(new ReadableStream({ cancel() { canceled++; } }), { headers: { 'content-type': 'application/json' } }));
  await new Promise(done => setImmediate(done)); assert.equal(canceled, 1);
  const second = new AbortController();
  const reading = requestAiJson(async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { canceled++; } }),
    { headers: { 'content-type': 'application/json' } }), 'http://127.0.0.1:1/demo', {}, second.signal);
  const stopped = assert.rejects(reading, /canceled or timed out/);
  await new Promise(done => setImmediate(done)); second.abort(); await stopped;
  assert.equal(canceled, 2);
});

test('actual diagnostic export failure leaves scene reads and core play available', { timeout: 12000 }, async () => {
  await withIsolatedServer(async server => {
    const token = (await server.hostToken()).trim();
    const api = path => fetch(server.base + path, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    const root = resolve(server.folder, 'exports'); await mkdir(root, { recursive: true });
    await writeFile(resolve(root, 'ai-logs'), 'Synthetic blocked export destination');
    for (let index = 0; index < 3; index++) assert.equal((await api('/api/scene-packet')).status, 200);
    assert.equal((await api('/api/session-snapshot')).status, 200);
    const logs = (await (await api('/api/ai-logs')).json()).logs;
    assert.equal(logs.length, 3); assert.equal(logs[0].summary, 'Prepared AI input metadata.');
    assert.equal(server.diagnostics().match(/Diagnostic export unavailable/g).length, 1);
    assert.equal(await readFile(resolve(root, 'ai-logs'), 'utf8'), 'Synthetic blocked export destination');
  });
});
