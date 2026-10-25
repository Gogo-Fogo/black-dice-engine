import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Uses only its own ignored demo directory, allowlisted child environment and loopback port. */
export async function withIsolatedServer(run, { profile = 'full', configuredProviders = false, localModelService = true, campaignDir, aiReplies, aiDelayMs = 0, captureAiInput = false, mockFetches, gracefulStop = false, mediaFixture = false, automaticBackups = false, blockedBackups = false } = {}) {
  assert.ok(Number.isInteger(aiDelayMs) && aiDelayMs >= 0 && aiDelayMs <= 2000);
  assert.ok(aiReplies === undefined || mockFetches === undefined, 'Select one synthetic adapter fixture');
  if (mockFetches !== undefined) assert.ok(Array.isArray(mockFetches) && mockFetches.length <= 30 && mockFetches.every(item => typeof item.url === 'string' && item.url.startsWith('http://127.0.0.1:1/')));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const temporaryRoot = resolve(root, 'tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(resolve(temporaryRoot, 'party-api-'));
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { BDE_HOST: '127.0.0.1', BDE_GAME_SERVER_PORT: '0', BDE_DB_PATH: resolve(folder, 'demo.db'), BDE_EXPORT_ROOT: resolve(folder, 'exports'), BDE_BACKUPS_DIR: resolve(folder, 'backups') });
  env.BDE_RUNTIME_PROFILE = profile;
  if (campaignDir) env.BDE_CAMPAIGN_DIR = campaignDir;
  env.BDE_AUTO_BACKUP = automaticBackups ? "1" : "0";
  if (blockedBackups) await writeFile(resolve(folder, 'backups'), 'Synthetic blocked backup destination');
  if (mediaFixture) { await mkdir(resolve(folder, 'media')); env.BDE_MEDIA_OUTPUT_ROOT = resolve(folder, 'media'); }
  if (configuredProviders) Object.assign(env, {
    BDE_COMFY_ROUTER_ENDPOINT: 'http://127.0.0.1:1', BDE_LOCAL_MODEL_ENDPOINT: 'http://127.0.0.1:1',
    BDE_TTS_SERVICE_ENDPOINT: 'http://127.0.0.1:1', BDE_AUDIO_SERVICE_ENDPOINT: 'http://127.0.0.1:1',
    BDE_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-never-send', OPENAI_BASE_URL: 'http://127.0.0.1:1'
  });
  // A hosted provider alone, as on the event PC, has no optional local-model service.
  if (configuredProviders && !localModelService) delete env.BDE_LOCAL_MODEL_ENDPOINT;
  let fetchPreload = './tests/helpers/no-outgoing-fetch.mjs';
  let preloadPath, preloadContent;
  if (aiReplies !== undefined) {
    assert.ok(Array.isArray(aiReplies) && aiReplies.length <= 20 && aiReplies.every(value => typeof value === 'string' && value.length <= 20000));
    const preload = resolve(folder, 'synthetic-ai.mjs');
    preloadPath = preload;
    preloadContent = `
import { appendFileSync } from 'node:fs';
const replies = ${JSON.stringify(aiReplies)};
globalThis.fetch = async (url, init) => {
  if (String(url) !== 'http://127.0.0.1:1/api/chat' || replies.length === 0) throw new Error('Unexpected synthetic adapter call');
  if (${captureAiInput}) appendFileSync(${JSON.stringify(resolve(folder, 'synthetic-ai-inputs.jsonl'))}, init.body + '\\n');
  const content = replies.shift();
  if (${aiDelayMs} > 0) {
    console.log('SYNTHETIC_NARRATION_PENDING');
    await new Promise(resolve => setTimeout(resolve, ${aiDelayMs}));
  }
  return Response.json({ message: { content } });
};
`;
    fetchPreload = pathToFileURL(preload).href;
    if (aiDelayMs) env.BDE_LOCAL_MODEL_ENDPOINT = 'http://127.0.0.1:1';
    Object.assign(env, { BDE_LLM_PROVIDER: 'ollama', OLLAMA_BASE_URL: 'http://127.0.0.1:1', OLLAMA_MODEL: 'synthetic' });
  }
  if (mockFetches !== undefined) {
    preloadPath = resolve(folder, 'synthetic-fetch.mjs');
    preloadContent = `
const replies = ${JSON.stringify(mockFetches)};
globalThis.fetch = async (url, init) => {
  const reply = replies.shift();
  if (!reply || String(url) !== reply.url || (init?.method ?? 'GET') !== (reply.method ?? 'GET')) throw new Error('Unexpected synthetic adapter call');
  if (String(url).endsWith('/prompt')) console.log('SYNTHETIC_IMAGE_SUBMITTED');
  if (reply.hang) { console.log('SYNTHETIC_FETCH_PENDING'); return new Promise(() => {}); }
  if (reply.bytes !== undefined) return new Response(new Uint8Array(reply.bytes), { status: reply.status ?? 200, headers: reply.headers });
  return reply.raw === undefined ? Response.json(reply.body, { status: reply.status ?? 200 }) : new Response(reply.raw, { status: reply.status ?? 200 });
};
`;
    fetchPreload = pathToFileURL(preloadPath).href;
    if (mockFetches.some(reply => reply.url.endsWith('/api/jobs/prepare'))) env.BDE_COMFY_ROUTER_ENDPOINT = 'http://127.0.0.1:1';
    if (mockFetches.some(reply => reply.url.endsWith('/speak'))) env.BDE_TTS_SERVICE_ENDPOINT = 'http://127.0.0.1:1';
    if (mockFetches.some(reply => reply.url.endsWith('/prompt'))) env.BDE_COMFY_API_BASE = 'http://127.0.0.1:1';
    if (mockFetches.some(reply => reply.url.endsWith('/api/library'))) env.BDE_AUDIO_SERVICE_ENDPOINT = 'http://127.0.0.1:1';
  }
  if (gracefulStop) {
    preloadContent = (preloadContent ?? "globalThis.fetch = async () => { throw new Error('Unexpected outgoing request'); };\n") +
      "\nprocess.on('message', message => { if (message === 'synthetic-stop') process.emit('SIGTERM'); });\n";
    preloadPath ??= resolve(folder, 'synthetic-shutdown.mjs');
    fetchPreload = pathToFileURL(preloadPath).href;
  }
  let child;
  let exited;
  let diagnostics = '';
  let base;
  const stop = async () => {
    let forced = false, timeout;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (gracefulStop && child.connected) {
        child.send('synthetic-stop');
        timeout = setTimeout(() => { forced = true; child.kill(); }, 7000);
      } else child.kill();
    }
    if (exited) await exited;
    clearTimeout(timeout);
    if (gracefulStop && child) assert.equal(child.exitCode, 0, diagnostics);
    assert.equal(forced, false, 'Synthetic server shutdown exceeded its deadline');
  };
  const launch = async () => {
    await stop();
    if (preloadPath) await writeFile(preloadPath, preloadContent);
    const built = process.env.BDE_TEST_BUILT === '1';
    child = spawn(process.execPath, [...(built ? [] : ['--import', 'tsx']), '--import', fetchPreload,
      built ? './services/game-server/dist/index.js' : './services/game-server/src/index.ts'], { cwd: root, env, stdio: gracefulStop ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'], windowsHide: true });
    exited = once(child, 'exit');
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-32000); });
    base = await new Promise((accept, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Isolated Party server startup timed out.')), 8000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Isolated Party server exited (${code}).`)); });
      child.stdout.on('data', chunk => {
        diagnostics = (diagnostics + chunk).slice(-32000);
        output = (output + chunk).slice(-4000);
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timeout); accept(match[1]); }
      });
    });
    return base;
  };
  try {
    await launch();
    await run({ get base() { return base; }, folder, restart: launch, shutdown: stop,
      hostToken: () => readFile(resolve(folder, 'demo.db.host.key'), 'utf8'), diagnostics: () => diagnostics });
  } finally {
    try { await stop(); }
    finally {
      assert.ok(resolve(folder).startsWith(temporaryRoot + sep));
      await rm(folder, { recursive: true, force: true });
    }
  }
}
