import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { WebSocket } from 'ws';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

test('seven concurrent clients measure persisted acknowledgement and public socket delivery through five rounds', { timeout: 20000 }, async t => {
  await withIsolatedServer(async server => {
    const sockets = [], deliveries = new Map(), acknowledgements = [], updates = [];
    const request = async (path, token, body) => {
      const response = await fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(4000) });
      const result = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`); return result;
    };
    const token = (await server.hostToken()).trim(), host = { ...await request('/api/session/me', token), token };
    const { tablePin } = await request('/api/session-snapshot', token);
    const players = await Promise.all(Array.from({ length: 7 }, (_, index) => request('/api/session/join', '', { code: tablePin, label: `Load seat ${index + 1}` })));
    const display = await request('/api/session/display', token, {});
    const actors = [...players, host, display];
    const connect = async actor => {
      const socket = new WebSocket(server.base.replace('http:', 'ws:') + '/ws', ['bde.session', `bde.auth.${actor.token}`]);
      sockets.push(socket);
      socket.on('message', raw => {
        const message = JSON.parse(String(raw));
        const state = message.type === 'party_snapshot' ? message.payload : message.type === 'connected' ? message.payload.party : null;
        if (!state) return;
        const key = `${actor.actorId}:${state.revision}`;
        if (!deliveries.has(key)) deliveries.set(key, performance.now());
        if (['lobby', 'briefing', 'choosing', 'locked'].includes(state.stage)) assert.deepEqual(state.choices, {});
      });
      await once(socket, 'message', { signal: AbortSignal.timeout(4000) });
    };
    const command = async (actor, action, extra = {}, state) => {
      state ??= await request('/api/party-game', actor.token);
      const start = performance.now();
      const result = await request(`/api/party-game/${action}`, actor.token, { requestId: randomUUID(),
        _command: { schemaVersion: 1, sessionId: actor.sessionId, mode: 'party', actorId: actor.actorId, roundId: state.roundId, stage: state.stage }, ...extra });
      acknowledgements.push(performance.now() - start);
      const revision = result.party.revision;
      // Measure the same committed revision on all nine independent connections.
      const keys = actors.map(viewer => `${viewer.actorId}:${revision}`);
      const deadline = performance.now() + 4000;
      while (!keys.every(key => deliveries.has(key)) && performance.now() < deadline) await new Promise(done => setTimeout(done, 2));
      assert.ok(keys.every(key => deliveries.has(key)), `Missing socket delivery for revision ${revision}`);
      updates.push(Math.max(...keys.map(key => deliveries.get(key))) - start);
      return result.party;
    };
    try {
      await Promise.all(actors.map(connect));
      for (const player of players) { await command(player, 'enter'); await command(player, 'ready', { ready: true }); }
      let state = await command(host, 'start');
      for (let round = 1; round <= 5; round++) {
        state = await command(host, 'advance', {}, state);
        // All seven submit against one choosing revision. Server seat ordering decides resolution.
        await Promise.all(players.map((player, index) => command(player, 'choose', { choice: ['mend', 'dare', 'guard'][index % 3] }, state)));
        state = await request('/api/party-game', token); assert.equal(state.stage, 'locked');
        for (let step = 0; step < 4; step++) state = await command(host, 'advance', {}, state);
      }
      assert.equal(state.stage, 'ending'); assert.equal(state.history.length, 5);
      const stats = values => {
        const sorted = values.toSorted((a, b) => a - b);
        return { samples: sorted.length, p95Ms: Number(sorted[Math.ceil(sorted.length * .95) - 1].toFixed(2)), maxMs: Number(sorted.at(-1).toFixed(2)) };
      };
      t.diagnostic(JSON.stringify({ transport: 'loopback HTTP/WebSocket; 7 players + host + display; synthetic data; optional services disabled',
        runtime: process.version, platform: `${platform()} ${arch()}`, cpu: cpus()[0]?.model, source: process.env.BDE_TEST_BUILT !== '1',
        acknowledgement: stats(acknowledgements), allAudienceDelivery: stats(updates) }));
      assert.doesNotMatch(server.diagnostics(), /UNEXPECTED_OUTGOING_FETCH/);
    } finally {
      for (const socket of sockets) { socket.on('error', () => {}); socket.terminate(); }
    }
  }, { profile: 'party', gracefulStop: true });
});
