import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('optional TTS configuration and HTTP handling work with stdlib-only injected speech and no model imports', { timeout: 10000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(resolve(root, 'tmp'), { recursive: true });
  const env = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const child = spawn('python', ['-I', '-B', resolve(root, 'tests/helpers/tts-check.py'), root], { cwd: resolve(root, 'tmp'), env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  const exited = once(child, 'exit'); let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 8000);
  try {
    assert.equal((await exited)[0], 0, output);
    assert.match(output, /Ran 3 tests/); assert.match(output, /OK/);
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; } }
});
