import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WebSocket from 'ws';
import { HostUpdates } from '../apps/gm-dashboard/src/ttrpg/host-updates.ts';
import { RuntimePanel, PresencePanel, CampaignContextPanel, AiActivityPanel, ErrorLogPanel, RollLogPanel, EventHistoryPanel } from '../apps/gm-dashboard/src/ttrpg/DiagnosticPanels.tsx';
import { withIsolatedServer } from './helpers/isolated-server.mjs';
import { createTableActions } from '../apps/gm-dashboard/src/ttrpg/table-actions.ts';
import { TableStatePanel, ApprovalPanel } from '../apps/gm-dashboard/src/ttrpg/TablePanels.tsx';
import { CharacterCreationPanel } from '../apps/gm-dashboard/src/ttrpg/CharacterCreationPanel.tsx';
import { AiDirectorPanel, LocalModelPanel, DirectorDraftPanel, SceneDraftPanel } from '../apps/gm-dashboard/src/ttrpg/AiPanels.tsx';

test('host live updates reject malformed envelopes and deduplicate saved roll presentation', () => {
  const rolls = [], snapshots = [], runtime = []; let changed = 0;
  const updates = new HostUpdates({ roll: value => rolls.push(value), snapshot: value => snapshots.push(value), runtime: value => runtime.push(value), changed: () => changed++ });
  for (const value of [null, [], {}, { type: 'connected', payload: null }, { type: 'session_snapshot', payload: {} }, { type: 'runtime_status', payload: {} }, { type: 'roll_recorded', payload: { total: 'forged' } }]) assert.equal(updates.receive(value), false);
  const roll = { id: 'saved-roll', actorId: 'demo', actorName: 'Demo', dice: 'd6', modifier: 1, rolled: 4, total: 5, advantage: false, note: 'Check', timestamp: new Date(0).toISOString() };
  assert.equal(updates.receive({ type: 'roll_recorded', payload: roll }), true);
  assert.equal(updates.receive({ type: 'roll_recorded', payload: roll }), true);
  assert.deepEqual(rolls, [roll]);
  assert.deepEqual(snapshots, []); assert.deepEqual(runtime, []); assert.equal(changed, 0);
  const markup = renderToStaticMarkup(React.createElement(RollLogPanel, { snapshot: { rollLog: [roll] } }));
  assert.match(markup, /Demo/); assert.match(markup, />5</); assert.match(markup, /Check/);
});

test('extracted host panels consume actual authenticated snapshots and reconnect envelopes', { timeout: 15000 }, async () => {
  await withIsolatedServer(async server => {
    const token = await server.hostToken();
    const snapshots = [], runtimes = [], rolls = []; let changes = 0;
    const updates = new HostUpdates({ snapshot: value => snapshots.push(value), runtime: value => runtimes.push(value), roll: value => rolls.push(value), changed: () => changes++ });
    const sockets = [];
    const connect = async () => {
      const socket = new WebSocket(server.base.replace('http:', 'ws:') + '/ws', ['bde.session', `bde.auth.${token}`]);
      sockets.push(socket);
      const [frame] = await once(socket, 'message', { signal: AbortSignal.timeout(3000) });
      const message = JSON.parse(frame.toString());
      assert.equal(message.type, 'connected'); assert.equal(updates.receive(message), true);
      socket.on('message', frame => updates.receive(JSON.parse(frame.toString())));
      return socket;
    };
    try {
      const first = await connect();
      const snapshot = snapshots.at(-1), runtime = runtimes.at(-1);
      for (const Component of [RuntimePanel, PresencePanel]) assert.match(renderToStaticMarkup(React.createElement(Component, { runtime })), /panel/);
      const context = renderToStaticMarkup(React.createElement(CampaignContextPanel, { snapshot }));
      assert.match(context, /Campaign Context/); assert.ok(context.includes(snapshot.campaignBible.subtitle));
      for (const Component of [RollLogPanel, EventHistoryPanel]) assert.match(renderToStaticMarkup(React.createElement(Component, { snapshot })), /panel/);
      assert.match(renderToStaticMarkup(React.createElement(AiActivityPanel, { aiLogs: [] })), /AI Activity Log/);
      assert.match(renderToStaticMarkup(React.createElement(ErrorLogPanel, { errorEvents: [] })), /Error Log/);
      const closed = once(first, 'close'); first.close(); await closed;
      await connect();
      assert.equal(snapshots.length, 2); assert.equal(snapshots.at(-1).sessionId, snapshot.sessionId);
      const response = await fetch(server.base + '/api/rolls', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: 'host-extraction-roll', actorId: snapshot.party[0].id, actorName: snapshot.party[0].name, dice: 'd6' }), signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 201);
      const { command, ...recorded } = await response.json();
      assert.equal(command.kind, 'roll');
      await new Promise((accept, reject) => {
        const timer = setTimeout(() => { clearInterval(interval); reject(new Error('Host roll frame missing')); }, 3000);
        const check = () => { if (rolls.some(roll => roll.id === recorded.id) && changes > 0) { clearTimeout(timer); clearInterval(interval); accept(); } };
        const interval = setInterval(check, 10);
        check();
      });
      assert.deepEqual(rolls, [recorded]);
      assert.ok(snapshots.at(-1).rollLog.some(roll => roll.id === recorded.id));
      assert.equal(updates.receive({ type: 'roll_recorded', payload: recorded }), true);
      assert.equal(rolls.length, 1);
      let confirmed;
      const table = { conditionDrafts: {}, queueApprovalMode: false, combatMode: false, combatRound: 1, combatTurnIndex: 0,
        ...Object.fromEntries(['setConditionDrafts', 'setQueueApprovalMode', 'setCombatMode', 'setCombatRound', 'setCombatTurnIndex'].map(name => [name, () => {}])) };
      Object.assign(table, createTableActions({ queueApprovalMode: false, setPendingActionKey: () => {}, setConditionDrafts: () => {},
        setSnapshot: value => { confirmed = value; }, requestIds: { get: () => 'host-extracted-hp', clear: () => {} },
        request: (path, init) => fetch(server.base + path, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }) }));
      await table.submitStateEvent({ type: 'hp_delta', characterId: snapshot.party[0].id, amount: -1 }, 'hp:demo:-1', 'damage');
      assert.equal(confirmed.party[0].hp.current, Math.max(0, snapshot.party[0].hp.current - 1));
      for (const advancedMode of [false, true]) {
        const html = renderToStaticMarkup(React.createElement(TableStatePanel, { snapshot: confirmed, advancedMode, pendingActionKey: 'busy', table, queueCharacterVisualCanonJob: async () => {} }));
        assert.match(html, /Party State/); assert.match(html, /disabled/);
      }
      assert.match(renderToStaticMarkup(React.createElement(ApprovalPanel, { snapshot: confirmed, pendingActionKey: '', table })), /Approval Queue/);
      assert.match(renderToStaticMarkup(React.createElement(CharacterCreationPanel, { controller: { newCharacterName: '', newCharacterClass: '', newCharacterLevel: 1, newCharacterMaxHp: 10, newCharacterAc: 10, newCharacterImage: null, creatingCharacter: false } })), /disabled/);
      const ai = { aiNarrationEnabled: false, aiProposedAction: null, aiProposeStatus: '', aiDirectorStatus: '', aiDirectorGuidance: '' };
      assert.match(renderToStaticMarkup(React.createElement(AiDirectorPanel, { controller: ai, pendingActionKey: '' })), /AI Director/);
      const scene = { scenePacket: null, scenePacketStatus: '', scenePacketValidation: null, localModelDraft: null, localModelStatus: '', directorDraft: null, directorStatus: '' };
      for (const Component of [LocalModelPanel, DirectorDraftPanel, SceneDraftPanel]) assert.match(renderToStaticMarkup(React.createElement(Component, { controller: scene, pendingActionKey: '', mediaQueueStatus: '' })), /panel/);
    } finally {
      for (const socket of sockets) { if (socket.readyState !== WebSocket.CLOSED) { const closed = once(socket, 'close'); socket.close(); await closed; } }
    }
  });
});
