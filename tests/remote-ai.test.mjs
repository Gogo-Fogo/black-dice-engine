import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { readAiConfig } from '../packages/runtime-config/dist/index.js';

const built = process.env.BDE_TEST_BUILT === '1';
const adapter = new URL(`../services/game-server/${built ? 'dist/ai-adapter.js' : 'src/ai-adapter.ts'}`, import.meta.url).href;
const root = fileURLToPath(new URL('../', import.meta.url));

test('optional director routes only to local Ollama, unloads Qwen and never falls back to paid AI', {timeout:15000}, async()=>{
 for(const scenario of ['ready','failed','remote','party']){
  const script=`
import assert from 'node:assert/strict';
const {generateDirectorGuidance}=await import(${JSON.stringify(adapter)});
let calls=0;
const context={audience:'gm_only',sources:[],campaignTitle:'Synthetic',currentScene:'Demo',tone:[],facts:[],activeCharacters:[],recentEvents:[]};
const result=await generateDirectorGuidance(context,0,0,{request:async(url,init)=>{
 calls++;assert.equal(url,'http://127.0.0.1:11434/api/chat');
 const body=JSON.parse(init.body);assert.equal(body.model,'qwen3.5:4b');assert.equal(body.think,false);assert.equal(body.keep_alive,0);
 ${scenario === 'failed' ? "throw Error('PRIVATE_FAILURE');" : "return Response.json({message:{content:'Demo local guidance'},done_reason:'stop'});"}
}});
assert.equal(calls,${['remote','party'].includes(scenario)?0:1});
assert.equal(Boolean(result.error),${scenario!=='ready'});
assert.doesNotMatch(JSON.stringify(result),/PRIVATE_FAILURE|synthetic-key/);
console.log('Local director policy passed');`;
  const env=Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{BDE_RUNTIME_PROFILE:scenario==='party'?'party':'full',BDE_LLM_PROVIDER:'openai',BDE_ALLOW_REMOTE_AI:'1',OPENAI_API_KEY:'synthetic-key',BDE_DIRECTOR_MODE_MODEL:'qwen3.5:4b',OLLAMA_BASE_URL:scenario==='remote'?'https://demo.invalid':'http://127.0.0.1:11434'});
  const child=spawn(process.execPath,[...(built?[]:['--import','tsx']),'--input-type=module','--eval',script],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});const exit=once(child,'exit');let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);const timer=setTimeout(()=>child.kill(),4000);
  try{assert.equal((await exit)[0],0,output);assert.match(output,/Local director policy passed/);}finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill();await exit;}}
 }
});

test('remote AI needs explicit consent for the selected endpoint, including LAN and provider aliases', () => {
  assert.equal(readAiConfig({}).disabled, false);
  for (const url of ['http://localhost:1234', 'http://127.0.0.1:1234', 'http://127.1.2.3:1234', 'http://[::1]:1234']) {
    assert.equal(readAiConfig({ OLLAMA_BASE_URL: url }).disabled, false);
  }
  for (const url of ['https://demo.invalid', 'http://192.168.1.20:1234', 'http://0.0.0.0:1234', 'http://localhost.demo.invalid', 'http://[::ffff:192.168.1.20]:1234']) {
    const config = readAiConfig({ OLLAMA_BASE_URL: url });
    assert.equal(config.disabled, true); assert.equal(config.allowRemote, false);
    assert.equal(readAiConfig({ OLLAMA_BASE_URL: url, BDE_ALLOW_REMOTE_AI: '1' }).disabled, false);
  }
  for (const provider of ['openai', 'chatgpt']) {
    assert.equal(readAiConfig({ BDE_LLM_PROVIDER: provider, OPENAI_API_KEY: 'synthetic' }).disabled, true);
    assert.equal(readAiConfig({ BDE_LLM_PROVIDER: provider, OPENAI_API_KEY: 'synthetic', BDE_ALLOW_REMOTE_AI: '1' }).disabled, false);
    assert.equal(readAiConfig({ BDE_LLM_PROVIDER: provider, OPENAI_BASE_URL: 'http://127.0.0.1:1234' }).disabled, false);
  }
  for (const value of ['true', 'yes', '2', '-1']) assert.throws(() => readAiConfig({ BDE_ALLOW_REMOTE_AI: value }), /BDE_ALLOW_REMOTE_AI/);
  const party = readAiConfig({ BDE_RUNTIME_PROFILE: 'party', BDE_ALLOW_REMOTE_AI: '1', BDE_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic' });
  assert.equal(party.disabled, true); assert.equal(party.allowRemote, false); assert.equal(party.openaiApiKey, '');
});

test('DeepSeek interactive calls disable thinking and reject empty or truncated completions', { timeout: 15000 }, async () => {
  for (const endpoint of ['https://api.deepseek.com', 'https://demo.invalid']) {
    const script = `
import assert from 'node:assert/strict';
const { aiChatCompletion } = await import(${JSON.stringify(adapter)});
for (const example of [
  { content: 'Complete answer', finish_reason: 'stop', valid: true },
  { content: '   ', finish_reason: 'stop', valid: false },
  { content: '', finish_reason: 'length', valid: false },
  { content: 'Truncated answer', finish_reason: 'length', valid: false }
]) {
  let calls = 0;
  const result = await aiChatCompletion([{ role: 'user', content: 'Synthetic campaign' }], {
    maxTokens: 350,
    request: async (url, init) => {
      calls++;
      const body = JSON.parse(init.body);
      assert.equal(url, ${JSON.stringify(endpoint + '/chat/completions')});
      assert.equal(body.max_tokens, 350);
      assert.deepEqual(body.thinking, ${endpoint === 'https://api.deepseek.com' ? "{ type: 'disabled' }" : 'undefined'});
      return Response.json({ choices: [{ message: { content: example.content, reasoning_content: 'PRIVATE_REASONING_CANARY' }, finish_reason: example.finish_reason }] });
    }
  });
  assert.equal(calls, 1);
  assert.equal(Boolean(result.error), !example.valid);
  assert.equal(result.text, example.valid ? example.content : '');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_REASONING_CANARY/);
}
console.log('Bounded completion checks passed');
`;
    const env = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(env, { BDE_LLM_PROVIDER: 'openai', OPENAI_BASE_URL: endpoint, OPENAI_MODEL: 'deepseek-flash', OPENAI_API_KEY: 'synthetic', BDE_ALLOW_REMOTE_AI: '1' });
    const child = spawn(process.execPath, [...(built ? [] : ['--import', 'tsx']), '--input-type=module', '--eval', script], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const exit = once(child, 'exit'); let output = '';
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    const timer = setTimeout(() => child.kill(), 5000);
    try { assert.equal((await exit)[0], 0, output); assert.match(output, /Bounded completion checks passed/); }
    finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill(); await exit; } }
  }
});

test('source/emitted adapter refuses remote calls before fetch and never falls back to another provider', { timeout: 20000 }, async () => {
  const cases = [
    { env: { BDE_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic' }, calls: 0 },
    { env: { BDE_LLM_PROVIDER: 'chatgpt', OPENAI_API_KEY: 'synthetic' }, calls: 0 },
    { env: { OLLAMA_BASE_URL: 'https://demo.invalid' }, calls: 0 },
    { env: { OLLAMA_BASE_URL: 'http://192.168.1.20:1234' }, calls: 0 },
    { env: { BDE_RUNTIME_PROFILE: 'party', BDE_LLM_PROVIDER: 'openai', BDE_ALLOW_REMOTE_AI: '1', OPENAI_API_KEY: 'synthetic' }, calls: 0 },
    { env: { OLLAMA_BASE_URL: 'https://demo.invalid', BDE_ALLOW_REMOTE_AI: '1' }, calls: 1, url: 'https://demo.invalid/api/chat' },
    { env: { BDE_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic', BDE_ALLOW_REMOTE_AI: '1' }, calls: 1, url: 'https://api.openai.com/v1/chat/completions' },
    { env: { BDE_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic', OPENAI_BASE_URL: 'http://127.0.0.1:1234' }, calls: 1, url: 'http://127.0.0.1:1234/chat/completions' },
    { env: { OLLAMA_BASE_URL: 'http://127.0.0.1:1234', OPENAI_API_KEY: 'synthetic' }, calls: 1, url: 'http://127.0.0.1:1234/api/chat', fail: true },
    { env: { OLLAMA_BASE_URL: 'http://127.0.0.1:1234' }, calls: 1, url: 'http://127.0.0.1:1234/api/chat', invalid: true }
  ];
  for (const example of cases) {
    const script = `
import assert from 'node:assert/strict';
const example = ${JSON.stringify(example)};
let calls = 0;
globalThis.fetch = async (url, init) => {
  calls++; assert.equal(init.redirect, 'error');
  if (String(url).endsWith('/models') || String(url).endsWith('/api/tags')) {
    const local = example.url.endsWith('/api/chat');
    const suffix = local ? '/api/chat' : '/chat/completions';
    assert.equal(url, example.url.slice(0, -suffix.length) + (local ? '/api/tags' : '/models'));
    return Response.json({ models: [{ name: 'qwen2.5:7b' }], data: [{ id: 'gpt-4o-mini' }] });
  }
  assert.equal(url, example.url);
  assert.ok(init.signal instanceof AbortSignal);
  if (example.fail) throw new Error('PRIVATE_PROVIDER_ERROR_CANARY');
  if (example.invalid) return Response.json({ message: { content: { private: 'PRIVATE_PROVIDER_ERROR_CANARY' } } });
  return Response.json({ message: { content: 'Demo response' }, choices: [{ message: { content: 'Demo response' } }] });
};
const { aiChatCompletion, getAiAdapterStatus, probeAiReadiness } = await import(${JSON.stringify(adapter)});
const result = await aiChatCompletion([{ role: 'user', content: 'ORIGINAL_SYNTHETIC_CONTEXT' }]);
assert.equal(calls, example.calls);
if (!example.calls) {
  assert.equal(result.provider, 'disabled'); assert.equal(result.text, '');
  assert.equal(getAiAdapterStatus().endpointConfigured, false);
  assert.doesNotMatch(result.error, /ORIGINAL_SYNTHETIC_CONTEXT|synthetic|https?:/);
} else if (example.fail || example.invalid) {
  assert.equal(result.provider, 'ollama'); assert.equal(result.text, ''); assert.ok(result.error);
  assert.doesNotMatch(result.error, /PRIVATE_PROVIDER_ERROR_CANARY/);
} else assert.equal(result.text, 'Demo response');
if (!example.calls) await assert.rejects(probeAiReadiness(globalThis.fetch, new AbortController().signal));
else assert.equal(await probeAiReadiness(globalThis.fetch, new AbortController().signal), 'ready');
assert.equal(calls, example.calls ? 2 : 0);
console.log('Synthetic provider policy passed');
`;
    const env = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(env, example.env);
    const child = spawn(process.execPath, [...(built ? [] : ['--import', 'tsx']), '--input-type=module', '--eval', script],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const exit = once(child, 'exit'); let output = '';
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
    const timer = setTimeout(() => child.kill(), 5000);
    try { assert.equal((await exit)[0], 0, output); assert.match(output, /Synthetic provider policy passed/); }
    finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill(); await exit; } }
  }
});
