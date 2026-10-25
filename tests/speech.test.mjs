import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const { createSpeech } = await import(`../services/game-server/${directory}/speech.${directory === 'dist' ? 'js' : 'ts'}`);
const scope = () => ({ sessionId: 'demo', mode: 'ttrpg', roundId: null, stage: 'table', revision: 1 });
const wav = new Uint8Array(44); wav.set(new TextEncoder().encode('RIFF')); wav.set(new TextEncoder().encode('WAVE'), 8); new DataView(wav.buffer).setUint32(4, wav.length - 8, true);
const response = () => new Response(wav.slice(), { headers: { 'content-type': 'audio/wav', 'content-length': '44' } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const create = (request, extra = {}) => createSpeech({ request, endpoint: 'http://127.0.0.1:1', current: scope, active: () => true, ...extra });

test('speech deduplicates concurrent requests, caches bounded current audio and isolates caller buffers', async () => {
  const pending = deferred(); let calls = 0;
  const speech = create(async (url, init) => { calls++; assert.equal(url, 'http://127.0.0.1:1/speak'); assert.equal(init.redirect, 'error'); assert.equal(JSON.parse(init.body).text, 'Demo'); return pending.promise; });
  const first = speech.synthesize(' Demo '), second = speech.synthesize('Demo');
  assert.equal(calls, 1); pending.resolve(response());
  const [a, b] = await Promise.all([first, second]); assert.deepEqual(a, wav); a[0] = 0; assert.deepEqual(b, wav);
  assert.deepEqual(await speech.synthesize('Demo'), wav); assert.equal(calls, 1); speech.dispose();
  let now = 0, cacheCalls = 0;
  const bounded = create(async () => { cacheCalls++; return response(); }, { now: () => now });
  for (let i = 0; i < 9; i++) await bounded.synthesize(`Demo ${i}`);
  await bounded.synthesize('Demo 0'); assert.equal(cacheCalls, 10, 'Oldest item expires at the eight-item bound');
  now = 300001; await bounded.synthesize('Demo 0'); assert.equal(cacheCalls, 11, 'Audio expires after five minutes'); bounded.dispose();
});
test('speech admits one active and two queued jobs, then advances in order', async () => {
  const pending = [], texts = [];
  const speech = create(async (_url, init) => { texts.push(JSON.parse(init.body).text); const item = deferred(); pending.push(item); return item.promise; });
  const first = speech.synthesize('First'), second = speech.synthesize('Second'), third = speech.synthesize('Third');
  await assert.rejects(speech.synthesize('Fourth'), error => error.status === 503);
  assert.deepEqual(texts, ['First']); pending[0].resolve(response()); await first;
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(texts, ['First', 'Second']); pending[1].resolve(response()); await second;
  await new Promise(resolve => setImmediate(resolve)); pending[2].resolve(response()); await third; speech.dispose();
});
test('speech timeout frees ignored transport and discards late replies without poisoning the cache', async () => {
  const late = deferred(); let calls = 0;
  const speech = create(async () => ++calls === 1 ? late.promise : response(), { deadlineMs: 15 });
  await assert.rejects(speech.synthesize('Demo'), error => error.status === 504);
  assert.deepEqual(await speech.synthesize('Demo'), wav); assert.equal(calls, 2);
  late.resolve(response()); await Promise.resolve(); assert.deepEqual(await speech.synthesize('Demo'), wav); assert.equal(calls, 2); speech.dispose();
});
test('speech cancellation is caller-owned; revision changes and shutdown cancel outstanding jobs', async () => {
  const late = deferred(); let current = scope(), signal;
  const speech = create(async (_url, init) => { signal = init.signal; return late.promise; }, { current: () => current });
  const controller = new AbortController();
  const cancelled = speech.synthesize('Demo', controller.signal), shared = speech.synthesize('Demo'); controller.abort();
  await assert.rejects(cancelled, error => error.status === 409); assert.equal(signal.aborted, false);
  current = { ...current, revision: 2 }; speech.cancelStale(); await assert.rejects(shared, error => error.status === 409); assert.equal(signal.aborted, true);
  const shutdown = speech.synthesize('Shutdown'); speech.dispose(); await assert.rejects(shutdown, error => error.status === 503);
  await assert.rejects(speech.synthesize('After'), error => error.status === 503); late.resolve(response());
});
test('speech validates inputs, content type, signature and bounded streamed bytes; failures remain generic', async () => {
  for (const result of [new Response('PRIVATE_SERVICE_BODY', { status: 500 }), new Response('html'), new Response('not a wav file', { headers: { 'content-type': 'audio/wav' } }),
    new Response(wav, { headers: { 'content-type': 'audio/wav', 'content-length': '999999999' } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65)); controller.close(); } }), { headers: { 'content-type': 'audio/wav' } })]) {
    const speech = create(async () => result, { maxBytes: 64 });
    await assert.rejects(speech.synthesize('Demo'), error => error.status === 502 && !/PRIVATE/.test(error.message)); speech.dispose();
  }
  const speech = create(async () => { assert.fail('Invalid input contacted service'); });
  for (const text of ['', ' ', 'x'.repeat(4001), undefined]) await assert.rejects(speech.synthesize(text), error => error.status === 400); speech.dispose();
  const disabled = create(async () => { assert.fail('Missing endpoint contacted'); }, { endpoint: '' });
  await assert.rejects(disabled.synthesize('Demo'), error => error.status === 503); disabled.dispose();
});
test('host speech route returns checked audio, reuses current cache and denies players or malformed responses', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const host = await server.hostToken();
    const call = (token, body) => fetch(server.base + '/api/speak', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    const snapshot = await (await fetch(server.base + '/api/session-snapshot', { headers: { authorization: `Bearer ${host}` } })).json();
    const player = await (await fetch(server.base + '/api/session/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: snapshot.tablePin, label: 'Demo Finch' }) })).json();
    assert.equal((await call(player.token, { text: 'Demo' })).status, 403);
    assert.equal((await call(host, { text: '' })).status, 400);
    for (let i = 0; i < 2; i++) {
      const result = await call(host, { text: 'Demo' }); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.deepEqual(new Uint8Array(await result.arrayBuffer()), wav);
    }
    const failed = await call(host, { text: 'Different demo' }); assert.equal(failed.status, 502); assert.doesNotMatch(JSON.stringify(await failed.json()), /PRIVATE/);
    assert.equal((await (await fetch(server.base + '/api/session-snapshot', { headers: { authorization: `Bearer ${host}` } })).json()).revision, snapshot.revision);
  }, { mockFetches: [{ url: 'http://127.0.0.1:1/speak', method: 'POST', bytes: [...wav], headers: { 'content-type': 'audio/wav' } },
    { url: 'http://127.0.0.1:1/speak', method: 'POST', raw: 'PRIVATE_PROVIDER_BODY' }] });
});
