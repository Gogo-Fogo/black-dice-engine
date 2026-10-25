import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, access, copyFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { options, root } from '../scripts/party-launch.mjs';

const safeEnvironment = () => Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));

test('Party launch options are explicit and paths do not depend on caller directory', () => {
  assert.equal(options([]).host, '127.0.0.1');
  assert.equal(options(['--lan']).host, '0.0.0.0');
  assert.equal(options(['--data-dir', 'tmp/demo space']).dataDir, resolve(root, 'tmp/demo space'));
  assert.equal(options(['--port', '0', '--check']).port, 0);
  assert.equal(options(['--check']).build, false);
  assert.equal(options(['--public-url', 'https://party.example/']).publicOrigin, 'https://party.example');
  assert.equal(options([]).publicOrigin, '', 'Public addressing requires an explicit launch option');
  for (const value of ['http://party.example', 'https://user:secret@party.example', 'https://party.example/path', 'https://party.example/?secret=1', 'https://party.example/#key']) assert.throws(() => options(['--public-url', value]));
  for (const args of [['--port', '-1'], ['--port', '65536'], ['--port', '1.5'], ['--data-dir'], ['--unknown']]) assert.throws(() => options(args));
});

test('a failing installed compiler is visible and prevents Party startup', async () => {
  const temporaryRoot = resolve(root, 'tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const fixture = await mkdtemp(resolve(temporaryRoot, 'party-build-failure-'));
  try {
    for (const folder of ['scripts', 'node_modules/typescript/bin', 'node_modules/vite/bin', 'packages/contracts']) await mkdir(resolve(fixture, folder), { recursive: true });
    await copyFile(resolve(root, 'scripts/party-launch.mjs'), resolve(fixture, 'scripts/party-launch.mjs'));
    await writeFile(resolve(fixture, 'packages/contracts/package.json'), JSON.stringify({ scripts: { build: 'tsc -p tsconfig.json' } }));
    await writeFile(resolve(fixture, 'node_modules/typescript/bin/tsc'), 'process.stderr.write("Synthetic compiler failure\\n"); process.exit(7);');
    await writeFile(resolve(fixture, 'node_modules/vite/bin/vite.js'), 'throw new Error("Must not reach Vite");');
    const child = spawn(process.execPath, [resolve(fixture, 'scripts/party-launch.mjs'), '--build-only'], { cwd: fixture, env: safeEnvironment(), windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    assert.equal((await once(child, 'exit'))[0], 1);
    assert.match(output, /Synthetic compiler failure/);
    assert.match(output, /Build failed.*7.*Server was not started/);
    assert.doesNotMatch(output, /listening on|Must not reach Vite/);
    await assert.rejects(access(resolve(fixture, '_data')), { code: 'ENOENT' });
  } finally {
    assert.ok(resolve(fixture).startsWith(temporaryRoot + sep));
    await rm(fixture, { recursive: true, force: true });
  }
});

test('portable built Party launcher preserves data and refuses an occupied port without stopping its owner', { timeout: 20000 }, async () => {
  const temporaryRoot = resolve(root, 'tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(resolve(temporaryRoot, 'party-launch-'));
  const dataDir = resolve(folder, 'demo data');
  const caller = resolve(folder, 'different working directory');
  await mkdir(caller);
  const env = safeEnvironment();
  Object.assign(env, { BDE_HOST: '0.0.0.0', BDE_DB_PATH: 'do-not-open.db', BDE_RUNTIME_PROFILE: 'full',
    BDE_RECOVER_HOST: '1', BDE_COMFY_ROUTER_ENDPOINT: 'http://127.0.0.1:1', BDE_TTS_SERVICE_ENDPOINT: 'http://127.0.0.1:1' });
  const children = [];
  let diagnostics = '';
  const spawnLauncher = args => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(resolve(root, 'tests/helpers/no-outgoing-fetch.mjs')).href,
      resolve(root, 'scripts/party-launch.mjs'), '--no-build', ...args], { cwd: caller, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const exited = once(child, 'exit');
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    const record = { child, exited };
    children.push(record);
    return record;
  };
  const stop = async record => { if (record.child.exitCode === null && record.child.signalCode === null) record.child.kill(); await record.exited; };
  const start = async () => {
    const record = spawnLauncher(['--port', '0', '--data-dir', dataDir, '--public-url', 'https://party.example']);
    record.base = await new Promise((accept, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Party launcher timed out')), 6000);
      record.child.once('error', error => { clearTimeout(timer); reject(error); });
      record.child.once('exit', code => { clearTimeout(timer); reject(new Error(`Launcher exited ${code}: ${diagnostics}`)); });
      record.child.stdout.on('data', chunk => {
        diagnostics += chunk; output += chunk;
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); accept(match[1]); }
      });
    });
    return record;
  };
  const request = async (base, path, token, body) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const server = await start();
    const health = await request(server.base, '/health');
    assert.equal(health.body.profile, 'party');
    const token = await readFile(resolve(dataDir, 'session.db.host.key'), 'utf8');
    const joinInfo = await request(server.base, '/api/session/join-info', token);
    assert.equal(joinInfo.body.localOnly, false);
    assert.equal(new URL(joinInfo.body.url).origin, 'https://party.example');
    assert.equal(new URL(joinInfo.body.url).pathname, '/player/');
    assert.equal(new URL(joinInfo.body.url).searchParams.get('pin'), joinInfo.body.code);
    const proxyReply = await fetch(server.base + '/api/session/join-info', { headers: {
      authorization: `Bearer ${token}`, host: 'untrusted.example',
      forwarded: 'host=untrusted.example;proto=http', 'x-forwarded-host': 'untrusted.example', 'x-forwarded-proto': 'http'
    } });
    assert.equal(proxyReply.status, 200);
    assert.deepEqual(await proxyReply.json(), joinInfo.body, 'Proxy headers cannot replace the operator-selected HTTPS join origin');
    assert.equal((await fetch(server.base + '/api/session/join-info')).status, 401, 'Tunnel reachability does not grant display or host access');
    const player = await request(server.base, '/api/session/join', undefined, { code: joinInfo.body.code, label: 'Portable demo' });
    assert.equal(player.status, 201);
    const state = (await request(server.base, '/api/party-game', player.body.token)).body;
    assert.equal((await request(server.base, '/api/party-game/enter', player.body.token, { requestId: randomUUID(), _command: {
      schemaVersion: 1, mode: 'party', sessionId: player.body.sessionId, actorId: player.body.actorId, roundId: state.roundId, stage: state.stage
    } })).status, 200);
    for (const path of ['/host/', '/display/', '/player/']) assert.equal((await fetch(server.base + path)).status, 200);
    const conflictDir = resolve(folder, 'never-created');
    const conflict = spawnLauncher(['--port', new URL(server.base).port, '--data-dir', conflictDir]);
    assert.equal((await conflict.exited)[0], 1);
    await assert.rejects(access(conflictDir), { code: 'ENOENT' });
    assert.match(diagnostics, /no existing process was stopped/);
    assert.equal((await request(server.base, '/health')).status, 200, 'Port owner remains running');
    await stop(server);
    const resumed = await start();
    assert.equal(await readFile(resolve(dataDir, 'session.db.host.key'), 'utf8'), token, 'Launcher does not rotate authority on restart');
    const recovered = await request(resumed.base, '/api/party-game', player.body.token);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body.roster[0].actorId, player.body.actorId);
    assert.doesNotMatch(diagnostics, /UNEXPECTED_OUTGOING_FETCH/);
    assert.ok(!diagnostics.includes(token));
    assert.ok(!diagnostics.includes(player.body.token));
    await assert.rejects(access(resolve(caller, 'do-not-open.db')), { code: 'ENOENT' });
  } finally {
    for (const record of children) await stop(record);
    assert.ok(resolve(folder).startsWith(temporaryRoot + sep));
    await rm(folder, { recursive: true, force: true });
  }
});
