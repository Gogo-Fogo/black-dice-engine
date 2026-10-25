import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
import { isRuntimeStatus } from '../packages/contracts/dist/index.js';
const built = process.env.BDE_TEST_BUILT === '1';
const { createResourceMonitor, resourcePressure } = await import(`../services/game-server/${built ? 'dist/resource-monitor.js' : 'src/resource-monitor.ts'}`);
const gib = 1024 ** 3;

test('resource owner caches real measurement windows, disposes and makes no GPU claim', () => {
  let now = 1000, reads = 0;
  const values = { rssBytes: 100, heapUsedBytes: 50, hostFreeMemoryBytes: 8 * gib, hostTotalMemoryBytes: 16 * gib, eventLoopDelayP95Ms: null };
  const owner = createResourceMonitor({ now: () => now, read() { reads++; return { ...values }; } });
  const first = owner.sample(); assert.equal(first.gpu, 'unmeasured'); assert.equal(first.eventLoopDelayP95Ms, null);
  assert.equal(resourcePressure(first).level, 'low'); assert.equal(owner.sample(), first); assert.equal(reads, 1);
  now += 1000; values.hostFreeMemoryBytes = gib; const next = owner.sample(); assert.notEqual(next, first);
  assert.equal(resourcePressure(next).level, 'elevated');
  values.hostFreeMemoryBytes = 200 * 1024 ** 2; now += 1000; assert.equal(resourcePressure(owner.sample()).level, 'high');
  values.hostFreeMemoryBytes = 8 * gib; values.eventLoopDelayP95Ms = 60; now += 1000; assert.equal(resourcePressure(owner.sample()).level, 'elevated');
  values.eventLoopDelayP95Ms = 201; now += 1000; assert.equal(resourcePressure(owner.sample()).level, 'high');
  const last = owner.sample(); owner.dispose(); owner.dispose(); now += 1000; assert.equal(owner.sample(), last);
  const actual = createResourceMonitor();
  try { assert.ok(actual.sample().rssBytes > 0); assert.ok(actual.sample().hostTotalMemoryBytes > 0); } finally { actual.dispose(); }
});

test('actual host runtime has measured resources, matching schema fields and no invented service latencies', { timeout: 10000 }, async () => {
  await withIsolatedServer(async server => {
    const token = (await server.hostToken()).trim();
    const runtime = await (await fetch(server.base + '/api/runtime-status', { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) })).json();
    assert.equal(isRuntimeStatus(runtime), true);
    assert.ok(runtime.resources.rssBytes > 0); assert.ok(runtime.resources.heapUsedBytes > 0);
    assert.ok(runtime.resources.hostFreeMemoryBytes <= runtime.resources.hostTotalMemoryBytes); assert.equal(runtime.resources.gpu, 'unmeasured');
    for (const name of ['game-server', 'websocket', 'dice-service']) assert.equal(runtime.services.find(item => item.name === name).latencyMs, undefined);
    for (const resources of [{ ...runtime.resources, rssBytes: -1 }, { ...runtime.resources, gpu: 'ready' }, { ...runtime.resources, eventLoopDelayP95Ms: Infinity }]) assert.equal(isRuntimeStatus({ ...runtime, resources }), false);
    const schema = JSON.parse(await readFile(new URL('../packages/shared-schemas/runtime-status.schema.json', import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(schema.properties.resources.properties).sort(), Object.keys(runtime.resources).sort());
    const display = await (await fetch(server.base + '/api/session/display', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' })).json();
    const publicRuntime = await (await fetch(server.base + '/api/runtime-status', { headers: { authorization: `Bearer ${display.token}` } })).json();
    assert.equal(publicRuntime.resources, undefined);
  });
});
