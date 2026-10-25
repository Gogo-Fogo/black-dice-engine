import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Party profile blocks adapter calls before contacting either provider', async () => {
  process.env.BDE_RUNTIME_PROFILE = 'party';
  process.env.BDE_LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'synthetic-never-send';
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Provider must stay disabled'); };
  try {
    const adapter = await import('../services/game-server/src/ai-adapter.ts');
    assert.deepEqual(adapter.getAiAdapterStatus(), { provider: 'disabled', model: '', endpointConfigured: false, endpoint: null });
    const result = await adapter.aiChatCompletion([{ role: 'user', content: 'Synthetic demo' }]);
    assert.equal(result.provider, 'disabled');
    assert.match(result.error, /disabled/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
