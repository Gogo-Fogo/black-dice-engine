import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { root } from '../scripts/party-launch.mjs';
import { sessionOptions } from '../scripts/session-launch.mjs';

test('full session selection is explicit, bounded and defaults to loopback without optional children', () => {
  assert.deepEqual(sessionOptions([]).services, []);
  assert.equal(sessionOptions([]).host, '127.0.0.1');
  assert.equal(sessionOptions([]).dataExplicit, false);
  assert.equal(sessionOptions(['--data-dir', 'tmp/demo space']).dataDir, resolve(root, 'tmp/demo space'));
  assert.deepEqual(sessionOptions(['--services', 'audio,comfy']).services, ['audio', 'comfy']);
  for (const args of [['--services'], ['--services', 'tts'], ['--services', 'audio,audio'], ['--services', 'none', '--services', 'audio']]) assert.throws(() => sessionOptions(args));
});

test('full launcher starts selected children outside cwd, refuses conflicts and stops only owned processes', { timeout: 25000 }, async () => {
  await mkdir(resolve(root, 'tmp'), { recursive: true });
  const fixture = await mkdtemp(resolve(root, 'tmp/session-launch-'));
  const caller = resolve(fixture, 'different working directory');
  await mkdir(caller);
  await writeFile(resolve(caller, '.env'), 'INVALID SYNTHETIC ENV THAT MUST NOT LOAD');
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { BDE_AUDIO_SERVICE_PORT: '0', BDE_COMFY_ROUTER_PORT: '0' });
  const records = []; let diagnostics = '';
  const launch = args => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(resolve(root, 'tests/helpers/no-outgoing-fetch.mjs')).href,
      resolve(root, 'scripts/session-launch.mjs'), '--no-build', ...args], { cwd: caller, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    const record = { child, exited: once(child, 'exit'), services: [], output: '' };
    child.on('message', message => { if (message.type === 'bde-child') record.services.push(message); });
    child.stdout.on('data', chunk => { record.output += chunk; diagnostics += chunk; });
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    records.push(record); return record;
  };
  const stop = async record => {
    if (record.child.exitCode === null && record.child.signalCode === null) {
      if (record.child.connected) record.child.send({ type: 'bde-stop' });
      const timer = setTimeout(() => {
        // Only PIDs reported by this test's own launcher may be cleaned up.
        for (const { pid } of record.services) { try { process.kill(pid); } catch {} }
        record.child.kill();
      }, 4000);
      try { await record.exited; } finally { clearTimeout(timer); }
    } else await record.exited;
  };
  try {
    const running = launch(['--services', 'audio,comfy', '--port', '0', '--data-dir', resolve(fixture, 'demo data')]);
    const addresses = await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error(`Launcher timeout: ${diagnostics}`)), 8000);
      running.child.once('exit', code => { clearTimeout(timer); reject(new Error(`Launcher exited ${code}: ${diagnostics}`)); });
      running.child.stdout.on('data', () => {
        const matches = [...running.output.matchAll(/\[([^\]]+)\] listening on (http:\/\/127\.0\.0\.1:\d+)/g)];
        const game = running.output.match(/game server listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (game) { clearTimeout(timer); accept({ ...Object.fromEntries(matches.map(match => [match[1], match[2]])), 'game-server': game[1] }); }
      });
    });
    assert.equal(running.services.length, 2);
    for (const base of Object.values(addresses)) assert.equal((await fetch(base + '/health', { signal: AbortSignal.timeout(2000) })).status, 200);
    assert.equal((await (await fetch(addresses['game-server'] + '/health')).json()).profile, 'full');
    const conflictDir = resolve(fixture, 'never created');
    const conflict = launch(['--port', new URL(addresses['game-server']).port, '--data-dir', conflictDir]);
    assert.equal((await conflict.exited)[0], 1);
    await assert.rejects(access(conflictDir), { code: 'ENOENT' });
    assert.equal((await fetch(addresses['game-server'] + '/health')).status, 200);
    await stop(running);
    assert.equal(running.child.exitCode, 0);
    for (const base of Object.values(addresses)) await assert.rejects(fetch(base + '/health', { signal: AbortSignal.timeout(1000) }));
    assert.doesNotMatch(diagnostics, /UNEXPECTED_OUTGOING_FETCH/);
  } finally {
    for (const record of records) await stop(record);
    await rm(fixture, { recursive: true, force: true });
  }
});
