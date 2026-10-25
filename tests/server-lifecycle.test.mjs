import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const extension = directory === 'dist' ? 'js' : 'ts';
const { createServerWork, createServerShutdown } = await import(`../services/game-server/${directory}/server-lifecycle.${extension}`);
const { parseDiceNotation, rollDice } = await import(`../services/game-server/${directory}/dice.${extension}`);

test('extracted dice preserve totals and advantage semantics with injected authoritative outcomes', () => {
  for (const [notation, values, expected] of [
    ['2d6+3', [1, 6], { rolls: [1, 6], total: 10 }],
    ['2d20-2 adv', [1, 20, 7, 3], { rolls: [20, 7], total: 25 }],
    ['2d20+1 dis', [1, 20, 7, 3], { rolls: [1, 3], total: 5 }]
  ]) {
    const parsed = parseDiceNotation(notation), remaining = [...values];
    assert.deepEqual(rollDice(parsed, sides => { assert.ok(sides >= Math.max(...remaining)); return remaining.shift(); }), expected);
    assert.equal(remaining.length, 0);
  }
  assert.equal(parseDiceNotation(' d20 ').count, 1);
  assert.equal(parseDiceNotation('100d1000-1000').error, undefined);
});

test('dice reject invalid notation and invalid injected samples before an outcome exists', () => {
  for (const notation of ['0d20', '101d6', 'd1', 'd1001', 'd20+1001', 'd20-1001', 'not-dice', '1.5d20']) assert.ok(parseDiceNotation(notation).error, notation);
  for (const sample of [0, 21, NaN, 1.5]) assert.throws(() => rollDice(parseDiceNotation('d20'), () => sample), /Invalid die result/);
});

test('server work owns timer callbacks, injected clock and cancellation even when transport ignores abort', async () => {
  let scheduled, resolveRequest, requestSignal, calls = 0, errors = 0;
  const timers = new Set();
  const work = createServerWork({ now: () => 1234, onError: () => errors++,
    timers: { every(callback, delay) { assert.equal(delay, 1000); scheduled = callback; timers.add(1); return 1; }, cancel(timer) { timers.delete(timer); } },
    request: async (_input, init) => { calls++; requestSignal = init.signal; return new Promise(resolve => { resolveRequest = resolve; }); }
  });
  assert.equal(work.now(), 1234);
  let ticks = 0; work.every(() => { ticks++; throw new Error('synthetic scheduled failure'); }, 1000);
  scheduled(); assert.equal(ticks, 1); assert.equal(errors, 1);
  const pending = work.request('http://127.0.0.1:1/demo');
  const rejected = assert.rejects(pending, /Server is stopping/);
  work.stop(); work.stop(); await rejected;
  assert.equal(requestSignal.aborted, true); assert.equal(work.active, false); assert.equal(timers.size, 0);
  scheduled(); assert.equal(ticks, 1);
  resolveRequest(Response.json({ late: true }));
  await assert.rejects(work.request('http://127.0.0.1:1/demo'), /Server is stopping/); assert.equal(calls, 1);
  assert.throws(() => work.every(() => {}, 1000), /stopped/);
});

test('caller cancellation remains effective through server request ownership', async () => {
  const caller = new AbortController(); let signal;
  const work = createServerWork({ request: async (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  const pending = work.request(new Request('http://127.0.0.1:1/demo', { signal: caller.signal }));
  const rejected = assert.rejects(pending, /synthetic cancel/);
  caller.abort(new Error('synthetic cancel')); await rejected;
  assert.equal(signal.aborted, true); assert.equal(work.active, true); work.stop();
});

test('shutdown closes actual WebSockets and drains HTTP before persistence/store close exactly once', { timeout: 5000 }, async () => {
  const server = createServer((_request, response) => response.end('demo'));
  const sockets = new WebSocketServer({ server });
  const work = createServerWork();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const socket = new WebSocket(base.replace('http:', 'ws:')); await once(socket, 'open');
  const closed = once(socket, 'close'), steps = [];
  const shutdown = createServerShutdown({ work, server, sockets, graceMs: 20,
    stopAudio: () => steps.push('audio'),
    flush: async () => { assert.equal(server.listening, false); assert.equal(work.active, false); await new Promise(done => setImmediate(done)); steps.push('save'); },
    closeStore: () => steps.push('close') });
  try {
    const first = shutdown(); assert.equal(shutdown(), first); await first; await closed;
    assert.deepEqual(steps, ['audio', 'save', 'close']); assert.equal(sockets.clients.size, 0);
    await assert.rejects(fetch(base, { signal: AbortSignal.timeout(500) }));
  } finally { socket.terminate(); server.closeAllConnections(); server.close(); sockets.close(); work.stop(); }
});

test('shutdown bounds a stalled HTTP response and closes store even when final persistence fails', { timeout: 5000 }, async () => {
  let admit;
  const admitted = new Promise(resolve => { admit = resolve; });
  const server = createServer(() => admit());
  const sockets = new WebSocketServer({ server }), work = createServerWork();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const pending = fetch(`http://127.0.0.1:${server.address().port}`);
  const disconnected = assert.rejects(pending);
  await admitted; let closes = 0;
  const shutdown = createServerShutdown({ work, server, sockets, graceMs: 20, stopAudio() {},
    flush() { throw new Error('synthetic disk failure'); }, closeStore() { closes++; } });
  try {
    await assert.rejects(shutdown(), /synthetic disk failure/); await disconnected;
    await assert.rejects(shutdown(), /synthetic disk failure/); assert.equal(closes, 1);
  } finally { server.closeAllConnections(); server.close(); sockets.close(); work.stop(); }
});

test('actual game server stops with an authenticated socket and stalled synthetic audio request, persisting before exit', { timeout: 12000 }, async () => {
  await withIsolatedServer(async server => {
    const token = (await server.hostToken()).trim();
    const request = (path, body) => fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    const socket = new WebSocket(server.base.replace('http:', 'ws:') + '/ws', ['bde.session', `bde.auth.${token}`]);
    await once(socket, 'open'); const closed = once(socket, 'close');
    try {
      const scene = await (await request('/api/scene-packet')).json();
      const queued = await (await request('/api/scene-packet/queue-audio', scene.packet)).json();
      const pending = request(`/api/audio-cues/${queued.cues[0].id}/play`, {});
      for (let tries = 0; !server.diagnostics().includes('SYNTHETIC_FETCH_PENDING') && tries < 100; tries++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.match(server.diagnostics(), /SYNTHETIC_FETCH_PENDING/);
      await server.shutdown(); await closed;
      assert.equal((await pending).status, 502);
      const database = new Database(resolve(server.folder, 'demo.db'), { readonly: true });
      try { assert.ok(database.prepare('SELECT COUNT(*) AS count FROM audio_cues').get().count > 0); }
      finally { database.close(); }
      assert.doesNotMatch(server.diagnostics(), /Shutdown could not save|database connection is not open/);
    } finally { socket.terminate(); }
  }, { gracefulStop: true, mockFetches: [{ url: 'http://127.0.0.1:1/api/library', hang: true }] });
});
