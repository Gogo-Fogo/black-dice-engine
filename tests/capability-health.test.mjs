import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RuntimePanel } from '../apps/gm-dashboard/src/ttrpg/DiagnosticPanels.tsx';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { isRuntimeStatus, capabilityStates } from '../packages/contracts/dist/index.js';
import { hostRuntime } from './helpers/host-fixtures.mjs';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
const directory = process.env.BDE_TEST_BUILT === '1' ? 'dist' : 'src';
const { createCapabilityHealth, probeService } = await import(`../services/game-server/${directory}/capability-health.${directory === 'dist' ? 'js' : 'ts'}`);

test('capability state distinguishes policy/configuration, observed readiness, busy and expired observations', async () => {
  let now = 100000, busy = false, calls = 0;
  const health = createCapabilityHealth([
    { name: 'disabled', enabled: false, configured: true, probe: async () => { assert.fail('Disabled capability contacted'); } },
    { name: 'missing', enabled: true, configured: false, probe: async () => { assert.fail('Unconfigured capability contacted'); } },
    { name: 'worker', enabled: true, configured: true, busy: () => busy, probe: async () => { calls++; return 'ready'; } },
    { name: 'reachable', enabled: true, configured: true, probe: async () => 'reachable' }
  ], { now: () => now });
  assert.deepEqual(health.status().map(item => item.capability.state), ['disabled', 'unconfigured', 'configured', 'configured']);
  const first = health.refresh(); assert.equal(health.refresh(), first); await first;
  assert.equal(calls, 1); assert.deepEqual(health.status().map(item => item.capability.state), ['disabled', 'unconfigured', 'ready', 'reachable']);
  assert.equal(health.status()[2].status, 'ok'); busy = true;
  assert.equal(health.status()[2].capability.state, 'busy'); busy = false; now += 30001;
  assert.equal(health.status()[2].capability.state, 'configured');
  health.dispose(); await health.refresh(); assert.equal(calls, 1);
});
test('probe deadline and disposal settle ignored abort without late state or private errors', async () => {
  let resolveLate, signal;
  const health = createCapabilityHealth([{ name: 'demo', enabled: true, configured: true, probe: async supplied => { signal = supplied; return new Promise(resolve => { resolveLate = resolve; }); } }], { deadlineMs: 10 });
  await health.refresh(); assert.equal(signal.aborted, true);
  assert.equal(health.status()[0].capability.state, 'failed');
  resolveLate('ready'); await Promise.resolve(); assert.equal(health.status()[0].capability.state, 'failed');
  const stopped = createCapabilityHealth([{ name: 'demo', enabled: true, configured: true, probe: async () => new Promise(() => {}) }]);
  const pending = stopped.refresh(); await Promise.resolve(); stopped.dispose(); await pending;
  assert.equal(stopped.status()[0].capability.state, 'configured');
  const failed = createCapabilityHealth([{ name: 'demo', enabled: true, configured: true, probe: async () => { throw new Error('PRIVATE_ENDPOINT_BODY'); } }]);
  await failed.refresh(); assert.doesNotMatch(JSON.stringify(failed.status()), /PRIVATE_ENDPOINT_BODY/);
});
test('service probes require identity and readiness evidence rather than HTTP 200 or router configuration', async () => {
  const signal = new AbortController().signal;
  const probe = (service, body) => probeService(async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:1/health'); assert.equal(init.redirect, 'error'); assert.equal(init.signal, signal);
    return Response.json(body);
  }, 'http://127.0.0.1:1', service, signal);
  assert.equal(await probe('tts', { ok: true, service: 'tts', status: 'ready' }), 'ready');
  assert.equal(await probe('audio-service', { ok: true, service: 'audio-service', configured: true, trackCount: 2 }), 'ready');
  assert.equal(await probe('audio-service', { ok: true, service: 'audio-service', configured: false, trackCount: 0 }), 'reachable');
  assert.equal(await probe('comfy-router', { ok: true, service: 'comfy-router', mode: 'configured' }), 'reachable');
  await assert.rejects(probe('tts', { ok: true, service: 'wrong' })); await assert.rejects(probe('tts', {}));
});
test('capability contract is additive, validates observations and retains schema enum parity', async () => {
  const schema = JSON.parse(await readFile(new URL('../packages/shared-schemas/capability-state-v1.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.properties.state.enum, [...capabilityStates]);
  const runtimeSchema = JSON.parse(await readFile(new URL('../packages/shared-schemas/runtime-status.schema.json', import.meta.url), 'utf8'));
  assert.equal(runtimeSchema.properties.services.items.properties.capability.$ref, 'capability-state-v1.schema.json');
  for (const state of capabilityStates) {
    const runtime = hostRuntime(); runtime.services = [{ name: 'demo', status: 'unknown', capability: { enabled: true, configured: true, state, checkedAt: null } }];
    assert.equal(isRuntimeStatus(runtime), true);
    assert.ok(renderToStaticMarkup(React.createElement(RuntimePanel, { runtime })).includes(`>${state}</span>`));
    runtime.services[0].capability.state = 'pretend-ready'; assert.equal(isRuntimeStatus(runtime), false);
  }
  const legacy = hostRuntime(); assert.equal(isRuntimeStatus(legacy), true);
});
test('host refresh reports real probe failure without URLs, player refresh is denied and Party makes no probes', { timeout: 15000 }, async () => {
  for (const profile of ['party', 'full']) await withIsolatedServer(async server => {
    const host = await server.hostToken();
    const api = async (path, token, body) => {
      const response = await fetch(server.base + path, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
      return { status: response.status, body: await response.json() };
    };
    const before = (await api('/api/runtime-status', host)).body;
    const selected = before.services.filter(service => service.capability);
    assert.equal(selected.length, 4);
    if (profile === 'party') assert.ok(selected.every(service => service.capability.state === 'disabled'));
    else assert.equal(selected.find(service => service.name === 'comfy-router').capability.state, 'configured');
    const snapshot = (await api('/api/session-snapshot', host)).body;
    const player = (await api('/api/session/join', '', { code: snapshot.tablePin, label: 'Demo Finch' })).body;
    assert.equal((await api('/api/capabilities/refresh', player.token, {})).status, 403);
    const refreshed = await api('/api/capabilities/refresh', host, {}); assert.equal(refreshed.status, 200);
    assert.doesNotMatch(JSON.stringify(refreshed.body), /127\.0\.0\.1|synthetic-never-send|PRIVATE/);
    assert.ok(refreshed.body.services.every(service => service.capability.state === (profile === 'party' ? 'disabled' : service.capability.enabled ? 'failed' : 'disabled')));
    assert.deepEqual((await api('/api/runtime-status', player.token)).body.services, []);
    assert.equal((await api('/api/session-snapshot', host)).body.revision, snapshot.revision);
  }, { profile, configuredProviders: true });
});
