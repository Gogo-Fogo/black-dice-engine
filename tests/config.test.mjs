import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { readRuntimeConfig, repositoryRoot } from '../services/game-server/src/config.ts';
import { readServiceConfig, readAiConfig } from '../packages/runtime-config/dist/index.js';

test('public join origin is explicit HTTPS, including in the Party profile', () => {
  assert.equal(readRuntimeConfig({}).publicOrigin, '');
  assert.equal(readRuntimeConfig({ BDE_RUNTIME_PROFILE: 'party', BDE_PUBLIC_ORIGIN: 'https://party.example/' }).publicOrigin, 'https://party.example');
  for (const value of ['http://party.example', 'https://user:secret@party.example', 'https://party.example/path', 'https://party.example/?key=secret', 'https://party.example/#key', 'bad']) {
    assert.throws(() => readRuntimeConfig({ BDE_PUBLIC_ORIGIN: value }), /BDE_PUBLIC_ORIGIN/);
  }
});

test('configuration preserves database default and disables unconfigured external paths', () => {
  const config = readRuntimeConfig({});
  assert.equal(config.databasePath, resolve(repositoryRoot, '_data/black-dice-engine.db'));
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.automaticBackups, true);
  assert.equal(readRuntimeConfig({ BDE_AUTO_BACKUP: '0' }).automaticBackups, false);
  assert.throws(() => readRuntimeConfig({ BDE_AUTO_BACKUP: 'yes' }), /BDE_AUTO_BACKUP/);
  for (const key of ['mediaOutputRoot', 'comfyOutputBDEDir', 'comfyRouterEndpoint', 'ttsServiceEndpoint']) {
    assert.equal(config[key], '');
  }
  assert.equal(config.sessionSummaryExportDir, resolve(repositoryRoot, '_exports/session-summaries'));
});

test('Node service configuration shares stable roots, explicit stores, strict ports and safe endpoint validation', () => {
  const root = resolve(repositoryRoot, 'tmp', 'synthetic root with spaces');
  for (const service of ['audio', 'comfy', 'runtime']) {
    const config = readServiceConfig(service, {}, root);
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.databasePath, resolve(root, '_data/black-dice-engine.db'));
    assert.equal(config.backupsDir, resolve(root, '_backups'));
    assert.equal(config.workflowRegistryPath, resolve(root, 'comfy-workflows/registry.json'));
  }
  assert.equal(readServiceConfig('audio', { BDE_AUDIO_DIR: 'demo/audio' }, root).audioDir, resolve(root, 'demo/audio'));
  assert.equal(readServiceConfig('comfy', { BDE_COMFY_OUTPUT_ROOT: 'demo/output' }, root).comfyOutputRoot, resolve(root, 'demo/output'));
  for (const key of ['BDE_AUDIO_SERVICE_PORT', 'BDE_COMFY_ROUTER_PORT', 'BDE_RUNTIME_SERVICE_PORT', 'BDE_GAME_SERVER_PORT']) {
    for (const value of ['-1','65536','1.2','1e3','0x10','NaN']) {
      const service = key.includes('AUDIO') ? 'audio' : key.includes('COMFY') ? 'comfy' : 'runtime';
      assert.throws(() => key === 'BDE_GAME_SERVER_PORT' ? readRuntimeConfig({ [key]: value }) : readServiceConfig(service, { [key]: value }), new RegExp(key));
    }
  }
  for (const value of ['file:///private', 'http://user:secret@localhost', 'http://localhost?token=private', 'http://localhost/#private', 'not-a-url']) {
    assert.throws(() => readServiceConfig('comfy', { BDE_COMFY_API_BASE: value }), /BDE_COMFY_API_BASE/);
    assert.throws(() => readAiConfig({ OLLAMA_BASE_URL: value }), /OLLAMA_BASE_URL/);
  }
  const partyEnv = { BDE_RUNTIME_PROFILE: 'party', BDE_COMFY_API_BASE: 'bad', BDE_AUDIO_DIR: 'never-open',
    BDE_COMFY_OUTPUT_ROOT: 'never-open', OLLAMA_BASE_URL: 'bad', OPENAI_BASE_URL: 'bad', OPENAI_API_KEY: 'never-send' };
  assert.equal(readServiceConfig('audio', partyEnv).audioDir, '');
  assert.equal(readServiceConfig('comfy', partyEnv).comfyApiBase, '');
  assert.equal(readServiceConfig('comfy', partyEnv).comfyOutputRoot, '');
  const ai = readAiConfig(partyEnv);
  for (const key of ['ollamaBaseUrl', 'openaiBaseUrl', 'openaiApiKey']) assert.equal(ai[key], '');
  assert.equal(ai.disabled, true);
  assert.equal(readAiConfig({}, root).gmPromptPath, resolve(root, 'prompts/gm-system-prompt.md'));
  assert.throws(() => readAiConfig({ BDE_LLM_PROVIDER: 'typo' }), /BDE_LLM_PROVIDER/);
});

test('isolated paths, ephemeral port, and validated optional endpoints', () => {
  const config = readRuntimeConfig({ BDE_DB_PATH: 'tmp/demo/data.db', BDE_EXPORT_ROOT: 'tmp/demo/exports',
    BDE_GAME_SERVER_PORT: '0', BDE_COMFY_ROUTER_ENDPOINT: 'http://127.0.0.1:4320/' });
  assert.equal(config.gameServerPort, 0);
  assert.equal(config.databasePath, resolve(repositoryRoot, 'tmp/demo/data.db'));
  assert.equal(config.repoExportsRoot, resolve(repositoryRoot, 'tmp/demo/exports'));
  assert.equal(config.comfyRouterEndpoint, 'http://127.0.0.1:4320');
  for (const value of ['-1', '65536', 'NaN', '1.2']) assert.throws(() => readRuntimeConfig({ BDE_GAME_SERVER_PORT: value }));
  assert.throws(() => readRuntimeConfig({ BDE_AUDIO_SERVICE_ENDPOINT: 'file:///private' }));
});

test('Party profile cannot inherit optional endpoints or raw asset stores', () => {
  const config = readRuntimeConfig({ BDE_RUNTIME_PROFILE: 'party', BDE_COMFY_ROUTER_ENDPOINT: 'not-even-a-url',
    BDE_LOCAL_MODEL_ENDPOINT: 'http://127.0.0.1:1', BDE_TTS_SERVICE_ENDPOINT: 'http://127.0.0.1:1',
    BDE_AUDIO_SERVICE_ENDPOINT: 'http://127.0.0.1:1', BDE_COMFY_OUTPUT_DIR: 'do-not-open', BDE_MEDIA_OUTPUT_ROOT: 'do-not-open' });
  assert.equal(config.profile, 'party');
  for (const key of ['localModelEndpoint', 'ttsServiceEndpoint', 'comfyRouterEndpoint', 'audioServiceEndpoint', 'comfyOutputBDEDir', 'mediaOutputRoot']) assert.equal(config[key], '');
  assert.equal(readRuntimeConfig({}).profile, 'full', 'Direct legacy start keeps its explicit compatibility profile');
  assert.throws(() => readRuntimeConfig({ BDE_RUNTIME_PROFILE: 'typo' }), /BDE_RUNTIME_PROFILE/);
});
