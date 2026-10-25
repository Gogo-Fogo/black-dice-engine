import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
import * as commandModule from '../apps/party-commands.ts';
const { PartyCommandQueue } = commandModule;

test('seven phone sockets, private simultaneous choices, four recovery phases and a complete offline Party game', { timeout: 30000 }, async () => {
  await withIsolatedServer(async server => {
    const sockets = [];
    const frames = [];
    const request = async (path, body, token) => {
      const response = await fetch(server.base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000) });
      return { status: response.status, body: await response.json() };
    };
    const hostToken = await server.hostToken();
    const health = await request('/health');
    assert.equal(health.body.profile, 'party');
    assert.equal(health.body.optionalServices, 'disabled');
    assert.equal(health.body.port, Number(new URL(server.base).port));
    for (const path of ['/api/speak', '/api/ai/propose-action', '/api/ai/narration-toggle', '/api/local-model/draft',
      '/api/director-mode/draft', '/api/scene-packet/queue-media', '/api/scene-packet/queue-audio',
      '/api/audio-cues/demo/play', '/api/media-jobs/demo/start', '/api/characters/demo/visual-canon-job']) {
      const disabled = await request(path, {}, hostToken);
      assert.equal(disabled.status, 503, path);
      assert.equal(disabled.body.code, 'CAPABILITY_DISABLED', path);
    }
    for (const path of ['/api/media-jobs', '/api/audio-cues', '/api/images', '/api/ai/narration-toggle']) {
      assert.equal((await request(path, undefined, hostToken)).status, 503, path);
    }
    const host = (await request('/api/session/me', undefined, hostToken)).body;
    host.token = hostToken;
    const snapshot = (await request('/api/session-snapshot', undefined, hostToken)).body;
    assert.equal(new URL(snapshot.joinUrl).origin, server.base);
    assert.equal(new URL(snapshot.joinUrl).searchParams.get('mode'), 'ttrpg', 'Existing TTRPG QR links must still open character sheets');
    const players = [];
    for (let i = 1; i <= 7; i++) {
      const joined = await request('/api/session/join', { code: snapshot.tablePin, label: i === 7 ? 'Host seat' : `Demo ${i}` });
      assert.equal(joined.status, 201);
      players.push(joined.body);
    }
    assert.equal((await request('/api/session/join', { code: snapshot.tablePin, label: 'Eighth' })).status, 409);
    const display = (await request('/api/session/display', {}, hostToken)).body;
    assert.equal((await request('/api/session/join-info', undefined, players[0].token)).status, 403);
    const joinInfo = await request('/api/session/join-info', undefined, display.token);
    assert.equal(joinInfo.status, 200);
    assert.equal(joinInfo.body.code, snapshot.tablePin);
    assert.equal(new URL(joinInfo.body.url).origin, server.base, 'Ephemeral test port must appear in the join address');
    assert.equal(new URL(joinInfo.body.url).searchParams.get('mode'), 'party');
    assert.ok(!JSON.stringify(joinInfo.body).includes(hostToken));
    for (const path of ['/host/', '/display/', '/player/']) {
      const response = await fetch(server.base + path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map(match => match[1]);
      assert.ok(assets.some(asset => asset.endsWith('.js')), `${path} needs a built module script`);
      for (const asset of assets) assert.equal((await fetch(new URL(asset, server.base + path))).status, 200, `${path}${asset}`);
    }
    // Metadata only: verify presentation paths without reading bundled media/model bodies.
    for (const prefix of ['/host/', '/player/']) {
      for (const asset of ['dice/d4_low_003.glb', 'dice/d6_low_003.glb', 'dice/d8_low_003.glb', 'dice/d10_low_003.glb', 'dice/d20_low_003.glb', 'dice/d100_low_003.glb', 'audio/dice-roll.mp3']) {
        const response = await fetch(server.base + prefix + asset, { method: 'HEAD' });
        assert.equal(response.status, 200, prefix + asset);
        assert.ok(Number(response.headers.get('content-length')) > 0);
        assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/, 'SPA fallback is not a presentation asset');
      }
    }
    const view = async actor => (await request('/api/party-game', undefined, actor.token)).body;
    const command = async (actor, action, extra = {}, fixed) => {
      const state = await view(actor);
      const body = fixed ?? { requestId: randomUUID(), _command: { schemaVersion: 1, sessionId: actor.sessionId, mode: 'party', actorId: actor.actorId,
        roundId: state.roundId, stage: state.stage }, ...extra };
      return { ...(await request(`/api/party-game/${action}`, body, actor.token)), input: body };
    };
    const accept = async (actor, action, extra = {}) => {
      const result = await command(actor, action, extra);
      assert.equal(result.status, 200, `${action}: ${JSON.stringify(result.body)}`);
      return result;
    };
    const connect = async actor => {
      const socket = new WebSocket(server.base.replace('http:', 'ws:') + '/ws', ['bde.session', `bde.auth.${actor.token}`]);
      sockets.push(socket);
      socket.on('message', raw => {
        const message = JSON.parse(String(raw));
        const party = message.type === 'party_snapshot' ? message.payload : message.type === 'connected' ? message.payload.party : null;
        if (party) frames.push({ actor, party });
      });
      await once(socket, 'message', { signal: AbortSignal.timeout(3000) });
    };
    const disconnect = () => {
      for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) { socket.on('error', () => {}); socket.terminate(); }
    };
    try {
      for (const actor of [...players, host, display]) await connect(actor);
      assert.equal((await command(host, 'enter')).status, 403, 'Host participates through a separate normal seat');
      assert.equal((await command(display, 'start')).status, 403);
      for (const actor of players.slice(0, 6)) { await accept(actor, 'enter'); await accept(actor, 'ready', { ready: true }); }
      assert.equal((await command(players[0], 'start')).status, 403);
      await accept(host, 'start');
      await accept(host, 'advance');
      await accept(players[6], 'enter'); await accept(players[6], 'ready', { ready: true });
      assert.equal((await command(players[6], 'choose', { choice: 'guard' })).status, 403, 'Late arrival waits for next round');
      const pendingStorage = new Map();
      const storage = { getItem: key => pendingStorage.get(key) ?? null, setItem: (key, value) => pendingStorage.set(key, value), removeItem: key => pendingStorage.delete(key) };
      let first;
      const uncertain = new PartyCommandQueue(players[0], storage, async (action, body) => {
        const accepted = await request(`/api/party-game/${action}`, body, players[0].token);
        assert.equal(accepted.status, 200);
        first = { ...accepted, input: structuredClone(body) };
        throw new Error('Synthetic response loss after commit');
      }, randomUUID);
      const beforeChoice = await view(players[0]);
      uncertain.prepare('choose', beforeChoice, { choice: 'mend' });
      await assert.rejects(uncertain.run(), /response loss/);
      assert.equal((await view(players[0])).ownChoice, 'mend');
      const resumedQueue = new PartyCommandQueue(players[0], storage, async (action, body) => {
        assert.deepEqual(body, first.input, 'Refresh retry preserves the exact request ID and metadata');
        const reply = await request(`/api/party-game/${action}`, body, players[0].token);
        return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
      }, () => { throw new Error('Retry must not issue a fresh ID'); });
      await resumedQueue.run();
      assert.equal(resumedQueue.pending(), null);
      assert.equal((await view(players[0])).revision, beforeChoice.revision + 1);
      await accept(players[0], 'choose', { choice: 'dare' });
      await accept(players[1], 'choose', { choice: 'guard' });
      for (const actor of [host, display, players[2]]) {
        const publicView = await view(actor);
        assert.deepEqual(publicView.choices, {});
        assert.equal(publicView.ownChoice, null);
        assert.equal(publicView.submittedCount, 2);
      }
      assert.equal((await view(players[0])).ownChoice, 'dare');
      disconnect();
      await server.restart();
      const recovered = await view(host);
      assert.equal(recovered.paused, true);
      assert.equal(recovered.stage, 'choosing');
      assert.equal((await view(players[0])).ownChoice, 'dare');
      const replay = await command(players[0], 'choose', {}, first.input);
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.body, first.body);
      assert.equal((await view(players[0])).ownChoice, 'dare', 'Replaying an old choice receipt does not replace the newer choice');
      for (const actor of [...players, host, display]) await connect(actor);
      await accept(host, 'resume');
      for (let round = 1; round <= 5; round++) {
        if (round > 1) await accept(host, 'advance');
        const open = await view(host);
        assert.equal(open.roundId, round);
        const submitters = round === 1 ? players.slice(2, 6) : players;
        const concurrent = await Promise.all(submitters.map(actor => command(actor, 'choose', { choice: round % 2 ? 'mend' : 'guard' })));
        assert.ok(concurrent.every(result => result.status === 200), JSON.stringify(concurrent));
        assert.equal((await view(display)).stage, 'locked');
        assert.deepEqual((await view(display)).choices, {}, 'Locked choices remain hidden until reveal');
        assert.equal((await command(players[0], 'choose', { choice: 'dare' })).status, 409);
        assert.equal((await command(host, 'lock')).status, 409, 'Another lock trigger cannot repeat the transition');
        if (round === 2) {
          const lockedChoices = (await view(players[0])).ownChoice;
          disconnect(); await server.restart();
          assert.equal((await view(host)).stage, 'locked');
          assert.equal((await view(host)).paused, true);
          assert.equal((await view(players[0])).ownChoice, lockedChoices);
          assert.deepEqual((await view(display)).choices, {});
          for (const actor of [...players, host, display]) await connect(actor);
          await accept(host, 'resume');
        }
        await accept(host, 'advance');
        if (round === 3) {
          const revealed = await view(display);
          disconnect(); await server.restart();
          assert.equal((await view(host)).stage, 'reveal');
          assert.equal((await view(host)).paused, true);
          assert.deepEqual((await view(display)).choices, revealed.choices);
          for (const actor of [...players, host, display]) await connect(actor);
          await accept(host, 'resume');
        }
        const resolution = await accept(host, 'advance');
        assert.equal(resolution.body.party.stage, 'resolving');
        assert.equal(resolution.body.party.outcomes.length, round === 1 ? 6 : 7);
        assert.deepEqual(resolution.body.party.outcomes.map(outcome => outcome.seat), Array.from({ length: round === 1 ? 6 : 7 }, (_, i) => i + 1));
        assert.ok(resolution.body.party.outcomes.every(outcome => Number.isInteger(outcome.roll) && outcome.roll >= 1 && outcome.roll <= 6));
        if (round === 1) {
          disconnect();
          await server.restart();
          assert.equal((await view(host)).paused, true);
          const exact = await command(host, 'advance', {}, resolution.input);
          assert.deepEqual(exact.body, resolution.body, 'Restart returns exact outcomes instead of rerolling');
          assert.deepEqual((await view(display)).outcomes, resolution.body.party.outcomes);
          for (const actor of [...players, host, display]) await connect(actor);
          await accept(host, 'resume');
        }
        assert.deepEqual((await command(host, 'advance', {}, resolution.input)).body, resolution.body);
        await accept(host, 'advance'); // round summary
        await accept(host, 'advance'); // next briefing or ending
      }
      const ending = await view(display);
      assert.equal(ending.stage, 'ending');
      assert.equal(ending.history.length, 5);
      assert.equal(ending.roundId, 5);
      assert.ok(ending.ending && ending.winners.length > 0);
      for (const seat of ending.roster) {
        const score = ending.history.flatMap(round => round.outcomes).filter(outcome => outcome.actorId === seat.actorId).reduce((sum, outcome) => sum + outcome.points, 0);
        assert.equal(seat.score, score);
      }
      for (const { actor, party } of frames) {
        if (['lobby', 'briefing', 'choosing', 'locked'].includes(party.stage)) {
          assert.deepEqual(party.choices, {});
          assert.deepEqual(party.outcomes, []);
        }
        if (actor.role !== 'player') assert.equal(party.ownChoice, null);
        assert.equal(party._command, undefined);
        for (const credential of [...players, host, display]) assert.ok(!JSON.stringify(party).includes(credential.token));
      }
      const nextRoom = await request('/api/session/new-room', {}, hostToken);
      assert.equal(nextRoom.status, 201);
      assert.equal((await request('/api/party-game', undefined, players[0].token)).status, 401);
      assert.equal((await request('/api/party-game', undefined, nextRoom.body.token)).body.stage, 'lobby');
      assert.doesNotMatch(server.diagnostics(), /UNEXPECTED_OUTGOING_FETCH/);
      for (const actor of [...players, host, display]) assert.ok(!server.diagnostics().includes(actor.token));
    } finally { disconnect(); }
  }, { profile: 'party', configuredProviders: true });
});
