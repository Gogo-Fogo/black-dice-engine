import { hostSnapshot } from "./helpers/host-fixtures.mjs";
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTableActions } from '../apps/gm-dashboard/src/ttrpg/table-actions.ts';

test('host table commands retain uncertain IDs and drafts, clear confirmed actions and route approvals', async () => {
  const ids = new Map(), requests = [], pending = [], snapshots = [];
  let sequence = 0, fail = true, drafts = { hero: 'Dazed' };
  const hooks = { queueApprovalMode: false,
    requestIds: { get: key => { if (!ids.has(key)) ids.set(key, `host-test-${++sequence}`); return ids.get(key); }, clear: key => ids.delete(key) },
    setPendingActionKey: key => pending.push(key), setSnapshot: value => snapshots.push(value),
    setConditionDrafts: update => { drafts = update(drafts); },
    request: async (path, init) => {
      requests.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
      if (fail) throw new Error('Synthetic lost reply');
      return { ok: true, json: async () => ({ sessionSnapshot: hostSnapshot() }) };
    }
  };
  const actions = createTableActions(hooks);
  const event = { type: 'condition_add', characterId: 'hero', condition: 'Dazed' };
  await assert.rejects(actions.submitStateEvent(event, 'condition:hero:Dazed', 'add', { clearConditionDraftFor: 'hero' }), /lost reply/);
  assert.equal(ids.size, 1); assert.equal(drafts.hero, 'Dazed'); assert.equal(pending.at(-1), ''); assert.equal(snapshots.length, 0);
  fail = false;
  await actions.submitStateEvent(event, 'condition:hero:Dazed', 'add', { clearConditionDraftFor: 'hero' });
  assert.equal(requests[0].body.requestId, requests[1].body.requestId);
  assert.equal(ids.size, 0); assert.equal(drafts.hero, ''); assert.equal(snapshots.length, 1);
  await actions.submitStateEvent(event, 'condition:hero:Dazed', 'add');
  assert.notEqual(requests[1].body.requestId, requests[2].body.requestId);
  const approval = createTableActions({ ...hooks, queueApprovalMode: true });
  await approval.submitStateEvent({ type: 'hp_delta', characterId: 'hero', amount: -1 }, 'hp:hero:-1', 'damage');
  assert.equal(requests.at(-1).path, '/api/state-events/propose'); assert.equal(requests.at(-1).body.submittedBy.kind, 'gm');
  await approval.resolveProposal('demo-proposal', 'approve');
  assert.equal(requests.at(-1).path, '/api/state-events/demo-proposal/approve'); assert.equal(pending.at(-1), '');
});

test('unconfirmed host state and approval responses retain prior snapshots and release busy state', async () => {
  const pending = [], snapshots = [], cleared = [];
  const actions = createTableActions({ queueApprovalMode: false, setPendingActionKey: key => pending.push(key),
    setSnapshot: value => snapshots.push(value), setConditionDrafts: () => assert.fail('Unconfirmed draft cleared'),
    requestIds: { get: () => 'uncertain', clear: key => cleared.push(key) }, request: async () => ({ ok: false }) });
  await actions.submitStateEvent({ type: 'hp_delta', characterId: 'hero', amount: -1 }, 'hp', 'damage');
  await actions.resolveProposal('proposal', 'reject');
  assert.deepEqual(snapshots, []); assert.deepEqual(cleared, []); assert.deepEqual(pending, ['damage', '', 'reject-proposal', '']);
});

test('unavailable host request storage prevents submission and releases busy state', async () => {
  const pending = [];
  const actions = createTableActions({ queueApprovalMode: false, setPendingActionKey: key => pending.push(key),
    setSnapshot: () => assert.fail('Storage failure updated state'), setConditionDrafts: () => {},
    requestIds: { get: () => { throw new Error('Synthetic storage unavailable'); }, clear: () => {} },
    request: () => assert.fail('Request must be persisted before submission') });
  await assert.rejects(actions.submitStateEvent({ type: 'hp_delta', characterId: 'hero', amount: -1 }, 'hp', 'damage'), /storage unavailable/);
  assert.deepEqual(pending, ['damage', '']);
});

test('malformed successful table replies preserve pending IDs, condition drafts and prior state', async () => {
  for (const bad of [null, {}, { sessionSnapshot: {} }, { sessionSnapshot: { ...hostSnapshot(), party: [{}] } }]) {
    const cleared = [], applied = [], pending = [];
    const actions = createTableActions({ queueApprovalMode: false,
      setPendingActionKey: key => pending.push(key), setSnapshot: value => applied.push(value),
      setConditionDrafts: () => assert.fail('Malformed response cleared draft'),
      requestIds: { get: () => 'retain-this-id', clear: key => cleared.push(key) },
      request: async () => Response.json(bad) });
    await assert.rejects(actions.submitStateEvent({ type: 'condition_add', characterId: 'hero', condition: 'Dazed' }, 'condition', 'add', { clearConditionDraftFor: 'hero' }), /Invalid host response/);
    await assert.rejects(actions.resolveProposal('demo', 'approve'), /Invalid host response/);
    assert.deepEqual(applied, []); assert.deepEqual(cleared, []); assert.equal(pending.at(-1), '');
  }
});
