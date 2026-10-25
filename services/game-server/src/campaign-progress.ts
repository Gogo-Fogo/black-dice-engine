import { randomUUID } from 'node:crypto';
import type express from 'express';
import { isCampaignProgress, isProgressCommand, type CampaignProgress, type ProgressCommand,
  type CurrentAction, type RollRecord, type SessionSnapshot } from '../../../packages/contracts/dist/index.js';
import { SessionError } from './session-authority.js';

export function loadCampaignProgress(raw: string | null, campaignId: string): CampaignProgress {
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (!isCampaignProgress(parsed) || parsed.campaignId !== campaignId) throw new Error('Invalid campaign progress store; refusing to discard saved progress.');
    return parsed;
  }
  return { schemaVersion: 1, campaignId, sceneId: randomUUID(), entries: [], actions: [], history: [], actionsSinceProgress: 0 };
}

/** Only explicit GM commands establish canon. Roll totals are evidence, not consequences. */
export function applyProgressCommand(state: CampaignProgress, command: ProgressCommand, now: string) {
  if (command.operation === 'consequence') {
    const action = state.actions.find(a => a.id === command.actionId);
    if (!action) throw new SessionError(404, 'Action resolution not found.');
    if (action.consequence) throw new SessionError(409, 'This outcome already has an approved consequence. Record a new fact to amend it.');
    action.consequence = command.consequence.trim();
    action.visibility = command.visibility;
    state.actionsSinceProgress = 0;
    return;
  }
  const previous = command.id ? state.entries.find(e => e.id === command.id) : undefined;
  if (command.id && !previous) throw new SessionError(404, 'Progress entry not found.');
  if (previous && previous.kind !== command.kind) throw new SessionError(409, 'An entry cannot change kind.');
  if (previous && previous.status !== 'active' && !command.reason?.trim()) throw new SessionError(409, 'Changing resolved progress requires a reason.');
  if (!previous && state.entries.length >= 200) throw new SessionError(409, 'The progress ledger holds 200 entries. Review existing entries before adding more.');
  if (command.kind === 'scene' && (!previous || previous.status === 'active') && state.entries.some(e => e.kind === 'scene' && e.sceneId === state.sceneId && e.id !== previous?.id)) {
    throw new SessionError(409, 'This scene already has a closure record. Start a new scene before creating another.');
  }
  const entry = { id: previous?.id ?? randomUUID(), kind: command.kind, title: command.title.trim(), detail: command.detail.trim(),
    status: command.status, visibility: command.visibility, resolution: command.resolution.trim(), sceneId: previous?.sceneId ?? state.sceneId, updatedAt: now };
  if (previous) {
    state.history.push({ entry: structuredClone(previous), reason: command.reason?.trim() || 'GM updated active progress.' });
    state.entries.splice(state.entries.indexOf(previous), 1, entry);
  } else state.entries.push(entry);
  // Only a newly established fact, payoff, or changed status counts as progress.
  if ((!previous && entry.status === 'completed') || previous && previous.status !== entry.status) state.actionsSinceProgress = 0;
}

export function recordActionResolution(state: CampaignProgress, action: CurrentAction, rolls: RollRecord[], now: string) {
  const id = action.id ?? randomUUID();
  if (state.actions.some(a => a.id === id)) return;
  state.actions.push({ id, sceneId: state.sceneId, description: action.description, dc: action.dc, timestamp: now,
    participants: rolls.map(r => ({ actorId: r.actorId, actorName: r.actorName, rollId: r.id, total: r.total,
      success: action.dc === null ? null : r.total >= action.dc })), consequence: '', visibility: 'gm_only' });
  state.actionsSinceProgress++;
}

export function installProgressRoutes(app: express.Express, hooks: {
  state(): CampaignProgress;
  requireHost: express.RequestHandler;
  publish(): SessionSnapshot;
  closeScene(): void;
}) {
  app.post('/api/campaign-progress', hooks.requireHost, (request, response) => {
    if (!isProgressCommand(request.body)) throw new SessionError(400, 'Invalid campaign progress command.');
    applyProgressCommand(hooks.state(), request.body, new Date().toISOString());
    if (hooks.state().entries.some(e => e.kind === 'scene' && e.sceneId === hooks.state().sceneId && e.status !== 'active')) hooks.closeScene();
    response.json({ ok: true, sessionSnapshot: hooks.publish() });
  });
}
