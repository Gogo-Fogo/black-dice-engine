import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

test('authenticated TTRPG flow, audience payloads, revoke, restart and room isolation', { timeout: 20000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporaryRoot = resolve(root, 'tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(resolve(temporaryRoot, 'legacy-api-'));
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key])
    .map(key => [key, process.env[key]]));
  Object.assign(env, { BDE_AUTO_BACKUP: '0', BDE_HOST: '127.0.0.1', BDE_GAME_SERVER_PORT: '0',
    BDE_DB_PATH: resolve(folder, 'demo.db'), BDE_EXPORT_ROOT: resolve(folder, 'exports') });
  const built = process.env.BDE_TEST_BUILT === '1';
  const entry = built ? './services/game-server/dist/index.js' : './services/game-server/src/index.ts';
  let child;
  let exited;
  let errors = '';
  let diagnostics = '';
  const sockets = [];
  async function launch() {
    child = spawn(process.execPath, [...(built ? [] : ['--import', 'tsx']), '--import', './tests/helpers/no-outgoing-fetch.mjs', entry],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    exited = once(child, 'exit');
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-8000); diagnostics += chunk; });
    return await new Promise((accept, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Isolated server startup timed out: ${errors}`)), 8000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Isolated server exited (${code}): ${errors}`)); });
      child.stdout.on('data', chunk => {
        diagnostics += chunk;
        output = (output + chunk).slice(-4000);
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timeout); accept(match[1]); }
      });
    });
  }
  try {
    let base = await launch();
    const request = async (path, body, role) => {
      const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(role ? (role.length === 43 ? { authorization: `Bearer ${role}` } : { 'x-bde-role': role }) : {}) },
        body: body === undefined ? undefined : JSON.stringify({ requestId: randomUUID(), ...body }), signal: AbortSignal.timeout(3000) });
      return { status: response.status, body: await response.json() };
    };
    const hostToken = await readFile(resolve(folder, 'demo.db.host.key'), 'utf8');
    assert.equal((await request('/api/session-snapshot')).status, 401);
    assert.equal((await request('/api/session-snapshot', undefined, 'gm')).status, 401);
    const initial = await request('/api/session-snapshot', undefined, hostToken);
    assert.equal(initial.status, 200);
    assert.ok(initial.body.campaignBible);
    assert.notEqual(initial.body.tablePin, 'BD20');
    const joined = await request('/api/session/join', { code: initial.body.tablePin, label: 'Sparrow' });
    assert.equal(joined.status, 201);
    const player = joined.body;
    const other = (await request('/api/session/join', { code: initial.body.tablePin, label: 'Pigeon' })).body;
    const display = (await request('/api/session/display', {}, hostToken)).body;
    assert.equal((await request('/api/session/display', {}, player.token)).status, 403);
    assert.equal((await request('/api/session/resume', {}, display.token)).status, 200);
    const privateCharacter = await request('/api/characters', { name: 'Demo Tinker', classLabel: 'Artificer', notes: ['OTHER_SHEET_CANARY'] }, hostToken);
    assert.equal(privateCharacter.status, 201);
    const character = initial.body.party[0];
    const claim = { clientId: player.actorId, characterId: character.id, playerLabel: 'Forged label', requestId: 'demo-claim' };
    assert.equal((await request('/api/claim-character', claim)).status, 401);
    const claimed = await request('/api/claim-character', claim, player.token);
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.sessionSnapshot.party[0].claimedByLabel, 'Sparrow');
    assert.equal(claimed.body.sessionSnapshot.campaignBible, undefined);
    assert.equal((await request('/api/claim-character', { ...claim, clientId: other.actorId }, player.token)).status, 403);
    assert.equal((await request('/api/claim-character', { ...claim, clientId: other.actorId, requestId: 'other-claim' }, other.token)).status, 409);
    const hiddenKeys = ['campaignBible', 'activeSceneContext', 'approvalQueue', 'mediaJobs', 'audioCueQueue', 'tablePin'];
    const frames = [];
    const connect = async (credential = player) => {
      const socket = new WebSocket(base.replace('http:', 'ws:') + '/ws?role=gm&clientId=forged',
        ['bde.session', `bde.auth.${credential.token}`]);
      sockets.push(socket);
      socket.on('message', frame => frames.push(JSON.parse(frame.toString())));
      const [frame] = await once(socket, 'message', { signal: AbortSignal.timeout(3000) });
      const message = JSON.parse(frame.toString());
      assert.equal(message.type, 'connected');
      if (credential.role !== 'gm') for (const key of hiddenKeys) assert.equal(message.payload.sessionSnapshot[key], undefined, key);
      if (credential === player) assert.equal(message.payload.sessionSnapshot.party.find(entry => entry.id === character.id).claimedByClientId, player.actorId);
      return socket;
    };
    const first = await connect();
    const closed = once(first, 'close');
    first.close();
    await closed;
    await connect();
    const displaySocket = await connect(display);
    const unauthenticated = new WebSocket(base.replace('http:', 'ws:') + '/ws?role=gm');
    sockets.push(unauthenticated);
    const denied = await new Promise((accept, reject) => {
      unauthenticated.on('unexpected-response', (_request, response) => { response.resume(); accept(response.statusCode); });
      unauthenticated.on('open', () => reject(new Error('Unauthenticated socket was admitted')));
      unauthenticated.on('error', () => {});
    });
    assert.equal(denied, 401);
    const roll = { actorId: character.id, actorName: 'Forged name', dice: 'd6', requestId: 'demo-roll' };
    const metadata = { schemaVersion: 1, sessionId: player.sessionId, mode: 'ttrpg', actorId: player.actorId, roundId: null, stage: 'table' };
    assert.equal((await request('/api/rolls', { ...roll, _command: { ...metadata, schemaVersion: 2 } }, player.token)).status, 400);
    assert.equal((await request('/api/rolls', { ...roll, _command: { ...metadata, sessionId: 'old-room' } }, player.token)).status, 409);
    assert.equal((await request('/api/rolls', { ...roll, _command: { ...metadata, expectedRevision: 9999 } }, player.token)).status, 409);
    assert.equal((await request('/api/rolls', roll, other.token)).status, 403);
    assert.equal((await request('/api/rolls', roll, display.token)).status, 403);
    const accepted = await request('/api/rolls', roll, player.token);
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.actorName, character.name);
    assert.ok(accepted.body.total >= 1 && accepted.body.total <= 6);
    let retriedRollId;
    assert.deepEqual((await request('/api/rolls', roll, player.token)).body, accepted.body);
    assert.equal((await request('/api/rolls', { ...roll, dice: 'd20' }, player.token)).status, 409);
    assert.equal((await request('/api/set-action', { type: 'Check', ability: 'wis', dc: 3 }, hostToken)).status, 200);
    const storage = new Database(env.BDE_DB_PATH);
    try {
      storage.exec("CREATE TRIGGER reject_command BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
      const beforeFailure = (await request('/api/session-snapshot', undefined, hostToken)).body;
      const rejected = await request('/api/rolls', { ...roll, requestId: 'storage-retry' }, player.token);
      assert.equal(rejected.status, 503);
      assert.match(rejected.body.error, /retry the same request/);
      const afterFailure = (await request('/api/session-snapshot', undefined, hostToken)).body;
      assert.deepEqual(afterFailure, beforeFailure, 'Failed receipt must roll back in-memory state and revision');
      assert.deepEqual(storage.prepare('SELECT data FROM roll_log ORDER BY id').all().map(row => JSON.parse(row.data)).sort((a,b) => a.id.localeCompare(b.id)),
        beforeFailure.rollLog.toSorted((a,b) => a.id.localeCompare(b.id)), 'All legacy table writes must roll back with the failed receipt');
      assert.equal(storage.prepare('SELECT count(*) AS count FROM command_receipts WHERE request_id = ?').get('storage-retry').count, 0);
      storage.exec('DROP TRIGGER reject_command');
      const retry = await request('/api/rolls', { ...roll, requestId: 'storage-retry' }, player.token);
      assert.equal(retry.status, 201);
      retriedRollId = retry.body.id;
      assert.equal(retry.body.command.revision, beforeFailure.revision + 1);
      assert.equal((await request('/api/session-snapshot', undefined, hostToken)).body.currentAction, null, 'Action completion is part of the committed roll');
      assert.deepEqual((await request('/api/rolls', { ...roll, requestId: 'storage-retry' }, player.token)).body, retry.body);
    } finally { storage.close(); }
    const rolls = (await request('/api/rolls', undefined, player.token)).body;
    assert.equal(rolls[0].name, character.name);
    assert.equal(rolls[0].id, undefined, 'Compact GET roll history remains compatible after duplicate-route removal');
    assert.equal((await request('/api/rolls', { ...roll, dice: 'bad', requestId: 'bad-roll' }, player.token)).status, 400);
    assert.equal((await request('/api/rolls', { ...roll, dice: 'd6+999999999999999999999999', requestId: 'overflow-roll' }, player.token)).status, 400);
    const proposed = await request('/api/state-events/propose', { type: 'hp_delta', characterId: character.id,
      amount: -1, requestId: 'demo-proposal', submittedBy: { id: 'forged', kind: 'gm', label: 'Forged' } }, player.token);
    assert.equal(proposed.status, 201);
    assert.equal(proposed.body.proposal.submittedBy.id, player.actorId);
    const path = `/api/state-events/${proposed.body.proposal.id}/approve`;
    assert.equal((await request(path, {}, player.token)).status, 403);
    assert.equal((await request(path, {}, 'gm')).status, 401);
    const approval = await request(path, { requestId: 'approve-once' }, hostToken);
    assert.equal(approval.status, 200);
    assert.deepEqual((await request(path, { requestId: 'approve-once' }, hostToken)).body, approval.body);
    const after = (await request('/api/session-snapshot', undefined, player.token)).body;
    assert.ok(!JSON.stringify(after).includes('OTHER_SHEET_CANARY'));
    assert.equal(after.party.find(entry => entry.id === character.id).hp.current, character.hp.current - 1);
    for (const key of hiddenKeys) assert.equal(after[key], undefined, key);
    assert.equal((await request('/api/images', undefined, player.token)).status, 200);
    for (const path of ['/api/pending-narration', '/api/state-event-queue', '/api/scene-packet', '/api/ai-logs']) {
      assert.equal((await request(path, undefined, player.token)).status, 403, path);
    }
    const summary = await fetch(base + '/api/session-summary.md', { headers: { authorization: `Bearer ${hostToken}` } });
    assert.equal(summary.status, 200);
    assert.match(await summary.text(), /Session Summary/);
    assert.ok(summary.headers.get('x-export-path').startsWith(resolve(folder, 'exports')));
    assert.ok((await readdir(resolve(folder, 'exports/session-summaries'))).length > 0);
    const publicSummary = await fetch(base + '/api/session-summary.md', { headers: { authorization: `Bearer ${display.token}` } });
    assert.equal(publicSummary.status, 200);
    assert.equal(publicSummary.headers.get('x-export-path'), null);
    assert.ok(!(await publicSummary.text()).includes(initial.body.tablePin));
    const invalid = await fetch(base + '/api/rolls', { method: 'POST', headers: { authorization: `Bearer ${player.token}`, 'content-type': 'application/json' }, body: '{INVALID_PRIVATE_CANARY' });
    assert.equal(invalid.status, 400);
    const invalidText = await invalid.text();
    assert.ok(!invalidText.includes('INVALID_PRIVATE_CANARY'));
    assert.ok(!invalidText.includes('stack'));
    const revoked = once(displaySocket, 'close');
    assert.equal((await request('/api/session/revoke', { actorId: display.actorId }, hostToken)).status, 200);
    assert.equal((await revoked)[0], 4001);
    assert.equal((await request('/api/session-snapshot', undefined, display.token)).status, 401);
    for (const message of frames) {
      if (message.type === 'roll_recorded') assert.ok([accepted.body.id, retriedRollId].includes(message.payload.id), 'Rejected action must never be broadcast');
      assert.ok(!JSON.stringify(message).includes('OTHER_SHEET_CANARY'));
      const snapshot = message.type === 'connected' ? message.payload.sessionSnapshot : message.type === 'session_snapshot' ? message.payload : null;
      if (snapshot) for (const key of hiddenKeys) assert.equal(snapshot[key], undefined, `frame ${key}`);
      for (const token of [hostToken, player.token, other.token, display.token]) assert.ok(!JSON.stringify(message).includes(token));
    }
    // Crash without save-now: accepted outcomes and receipts must already be durable.
    const revisionBeforeRestart = (await request('/api/session-snapshot', undefined, player.token)).body.revision;
    for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) { socket.on('error', () => {}); socket.terminate(); }
    child.kill();
    await exited;
    base = await launch();
    assert.equal(await readFile(resolve(folder, 'demo.db.host.key'), 'utf8'), hostToken);
    assert.equal((await request('/api/session/resume', {}, player.token)).body.actorId, player.actorId);
    const restored = await request('/api/session-snapshot', undefined, player.token);
    assert.equal(restored.body.party.find(entry => entry.id === character.id).claimedByClientId, player.actorId);
    assert.equal(restored.body.party.find(entry => entry.id === character.id).hp.current, character.hp.current - 1);
    assert.equal(restored.body.revision, revisionBeforeRestart);
    assert.deepEqual((await request('/api/rolls', roll, player.token)).body, accepted.body, 'Restart must reuse the exact recorded random outcome');
    assert.equal((await request('/api/rolls', { ...roll, dice: 'd20' }, player.token)).status, 409);
    assert.equal((await request('/api/session-snapshot', undefined, player.token)).body.revision, revisionBeforeRestart);
    assert.equal((await request('/api/release-character', { requestId: 'release-once' }, player.token)).status, 200);
    assert.deepEqual((await request('/api/rolls', roll, player.token)).body, accepted.body, 'A prior receipt replays even after ownership changed');
    assert.equal((await request('/api/session-snapshot', undefined, player.token)).body.party.find(entry => entry.id === character.id).claimedByClientId, null);
    assert.equal((await request('/api/claim-character', { ...claim, requestId: 'reclaim' }, player.token)).status, 200);
    await connect();
    const next = await request('/api/session/new-room', {}, hostToken);
    assert.equal(next.status, 201);
    assert.equal((await request('/api/session/me', undefined, player.token)).status, 401);
    assert.equal((await request('/api/session/me', undefined, hostToken)).status, 401);
    assert.equal((await request('/api/session/me', undefined, next.body.token)).status, 200);
    for (const token of [hostToken, player.token, other.token, display.token, next.body.token]) assert.ok(!diagnostics.includes(token), 'Credentials must not enter diagnostics');
    assert.doesNotMatch(errors, /UNEXPECTED_OUTGOING_FETCH/);
  } finally {
    for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) { socket.on('error', () => {}); socket.terminate(); }
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
    assert.ok(resolve(folder).startsWith(temporaryRoot + sep));
    await rm(folder, { recursive: true, force: true });
  }
});
