import { isObject } from './index.js';

export const progressKinds = ['objective', 'clue', 'obstacle', 'milestone', 'fact', 'scene'] as const;
export const progressStatuses = ['active', 'completed', 'failed', 'abandoned'] as const;
export type ProgressVisibility = 'gm_only' | 'player_visible' | 'public_demo';
export type ProgressEntry = {
  id: string; kind: typeof progressKinds[number]; title: string; detail: string;
  status: typeof progressStatuses[number]; visibility: ProgressVisibility;
  sceneId: string; resolution: string; updatedAt: string;
};
export type ActionResolution = {
  id: string; sceneId: string; description: string; dc: number | null; timestamp: string;
  participants: Array<{ actorId: string; actorName: string; rollId: string; total: number; success: boolean | null }>;
  consequence: string; visibility: ProgressVisibility;
};
export type CampaignProgress = {
  schemaVersion: 1; campaignId: string; sceneId: string;
  entries: ProgressEntry[]; actions: ActionResolution[];
  history: Array<{ entry: ProgressEntry; reason: string }>;
  actionsSinceProgress: number;
};
export type ProgressCommand =
  | { operation: 'record'; id?: string; kind: ProgressEntry['kind']; title: string; detail: string;
      status: ProgressEntry['status']; visibility: ProgressVisibility; resolution: string; reason?: string }
  | { operation: 'consequence'; actionId: string; consequence: string; visibility: ProgressVisibility };

const text = (v: unknown, max: number, blank = false): v is string => typeof v === 'string' && v.length <= max && (blank || !!v.trim());
const visibility = (v: unknown): v is ProgressVisibility => ['gm_only', 'player_visible', 'public_demo'].includes(String(v));
const status = (v: unknown) => progressStatuses.includes(v as ProgressEntry['status']);
const kind = (v: unknown) => progressKinds.includes(v as ProgressEntry['kind']);
export function isProgressCommand(v: unknown): v is ProgressCommand {
  if (!isObject(v) || !visibility(v.visibility)) return false;
  const keys = v.operation === 'record'
    ? ['operation', 'id', 'kind', 'title', 'detail', 'status', 'visibility', 'resolution', 'reason', 'requestId', '_command']
    : ['operation', 'actionId', 'consequence', 'visibility', 'requestId', '_command'];
  if (Object.keys(v).some(key => !keys.includes(key))) return false;
  if (v.operation === 'consequence') return text(v.actionId, 128) && text(v.consequence, 2000);
  return v.operation === 'record' && (v.id === undefined || text(v.id, 128)) && kind(v.kind) && status(v.status) &&
    text(v.title, 160) && text(v.detail, 2000, v.kind !== 'scene') && text(v.resolution, 2000, v.status === 'active') &&
    (v.reason === undefined || text(v.reason, 2000));
}
export function isCampaignProgress(v: unknown): v is CampaignProgress {
  if (!isObject(v) || v.schemaVersion !== 1 || !text(v.campaignId, 256) || !text(v.sceneId, 128) ||
      !Number.isSafeInteger(v.actionsSinceProgress) || Number(v.actionsSinceProgress) < 0) return false;
  const entry = (e: unknown) => isObject(e) && text(e.id, 128) && kind(e.kind) && status(e.status) && visibility(e.visibility) &&
    text(e.title, 160) && text(e.detail, 2000, true) && text(e.resolution, 2000, true) && text(e.sceneId, 128) && text(e.updatedAt, 64);
  return Array.isArray(v.entries) && v.entries.every(entry) && new Set(v.entries.map(e => e.id)).size === v.entries.length &&
    Array.isArray(v.history) && v.history.every(h => isObject(h) && entry(h.entry) && text(h.reason, 2000)) &&
    Array.isArray(v.actions) && v.actions.every(a => isObject(a) && text(a.id, 128) && text(a.sceneId, 128) &&
      text(a.description, 1024) && (a.dc === null || Number.isInteger(a.dc) && Number(a.dc) >= 0 && Number(a.dc) <= 1000) &&
      text(a.timestamp, 64) && text(a.consequence, 2000, true) && visibility(a.visibility) && Array.isArray(a.participants) &&
      a.participants.every(p => isObject(p) && text(p.actorId, 128) && text(p.actorName, 128) && text(p.rollId, 128) &&
        typeof p.total === 'number' && Number.isFinite(p.total) && (p.success === null || typeof p.success === 'boolean')));
}
