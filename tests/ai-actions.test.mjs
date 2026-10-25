import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { aiActionProposalSchema, isActionProposal, actionFromProposal, isActionProposalResponse } from '../packages/contracts/dist/index.js';
import { parseActionProposal } from '../services/game-server/src/ai-proposals.ts';
import { createAiActions } from '../apps/gm-dashboard/src/ttrpg/ai-actions.ts';
import { AiDirectorPanel } from '../apps/gm-dashboard/src/ttrpg/AiPanels.tsx';
import { withIsolatedServer } from './helpers/isolated-server.mjs';

const proposal = { action: 'Examine the demo gate', skill: 'Perception', difficulty: 'medium',
  description: 'Look for a safe path through the gate.', consequences: 'Find the route or spend more time.' };

test('AI action schema, parser and ability mapping agree; malformed structured output is rejected', async () => {
  const schema = JSON.parse(await readFile(new URL('../packages/shared-schemas/ai-action-proposal.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema, aiActionProposalSchema);
  assert.deepEqual(parseActionProposal(JSON.stringify(proposal)), proposal);
  assert.deepEqual(parseActionProposal('```json\n' + JSON.stringify(proposal) + '\n```'), proposal);
  assert.deepEqual(actionFromProposal(proposal), { type: 'perception', description: proposal.action, ability: 'wis', dc: 15 });
  const bad = [null, [], {}, { ...proposal, difficulty: 'impossible' }, { ...proposal, skill: 'Invented' },
    { ...proposal, skill: 'toString' }, { ...proposal, action: ' ' }, { ...proposal, action: 'x'.repeat(1025) },
    { ...proposal, description: {} }, { ...proposal, consequences: 'x'.repeat(2001) }, { ...proposal, extra: 'private' }];
  for (const value of bad) { assert.equal(isActionProposal(value), false); assert.throws(() => parseActionProposal(JSON.stringify(value)), /Invalid AI/); }
  for (const value of ['not JSON', 'Here is a proposal: ' + JSON.stringify(proposal), 'x'.repeat(16001)]) assert.throws(() => parseActionProposal(value), /Invalid AI/);
});

test('real AI proposal endpoint rejects malformed mock output and requires an explicit validated host action', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken(); let sequence = 0;
    const request = (path, init) => {
      const command = ['/api/set-action', '/api/ai/narration-toggle'].includes(path);
      const body = command ? JSON.stringify({ ...JSON.parse(init.body), requestId: `ai-action-${++sequence}` }) : init.body;
      return fetch(server.base + path, { ...init, body, headers: { ...init.headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    };
    const actions = createAiActions(request);
    const snapshot = async () => (await fetch(server.base + '/api/session-snapshot', { headers: { authorization: `Bearer ${token}` } })).json();
    const before = (await snapshot()).currentAction;
    const result = await actions.propose(); assert.equal(isActionProposalResponse(result), true);
    assert.deepEqual((await snapshot()).currentAction, before, 'Proposal alone cannot change the table action');
    await assert.rejects(actions.propose(), /request failed/);
    assert.deepEqual((await snapshot()).currentAction, before);
    const logs = await (await fetch(server.base + '/api/ai-logs', { headers: { authorization: `Bearer ${token}` } })).json();
    const failure = logs.logs.find(entry => entry.kind === 'validation_failure');
    assert.ok(failure); assert.doesNotMatch(JSON.stringify(failure), /private-output-canary/);
    const confirmation = await actions.apply(result.proposal);
    const applied = (await snapshot()).currentAction;
    assert.equal(typeof applied.id, "string");
    assert.deepEqual(confirmation, applied);
    const { id: _id, ...fields } = applied;
    assert.deepEqual(fields, actionFromProposal(proposal));
    assert.equal(await actions.toggle(false), false); assert.equal(await actions.toggle(true), true);
    await server.restart(); assert.deepEqual((await snapshot()).currentAction, applied);
  }, { aiReplies: [JSON.stringify(proposal), JSON.stringify({ action: 'private-output-canary' })] });
});

test('AI controls reject malformed or mismatched confirmations and preserve explicit failure feedback', async () => {
  for (const body of [{}, { enabled: 'true' }, { ok: true, enabled: false }, { ok: false, enabled: true }]) {
    const actions = createAiActions(async () => Response.json(body));
    await assert.rejects(actions.toggle(true)); await assert.rejects(actions.apply(proposal)); await assert.rejects(actions.propose());
  }
  const mismatched = createAiActions(async () => Response.json({ ok: true, action: { ...actionFromProposal(proposal), dc: 25 } }));
  await assert.rejects(mismatched.apply(proposal), /not confirmed/);
  const html = renderToStaticMarkup(React.createElement(AiDirectorPanel, { pendingActionKey: '', controller: {
    narrationKnown: true, narrationToggleStatus: 'failed', aiNarrationEnabled: false,
    aiProposedAction: proposal, aiProposeStatus: 'apply-failed', aiDirectorStatus: '', aiDirectorGuidance: ''
  } }));
  assert.match(html, /proposal is retained for retry/); assert.match(html, /last confirmed setting/); assert.match(html, />OFF</);
});
