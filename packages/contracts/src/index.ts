import { isCampaignProgress } from "./campaign-progress.js";
/** Browser/server data only: no I/O, framework, timers or authoritative game rules. */
export const partyChoices = ["mend", "dare", "guard", "pass"] as const;
export const partyStages = ["lobby", "briefing", "choosing", "locked", "reveal", "resolving", "summary", "ending"] as const;
export const partyClientActions = ["enter", "ready", "start", "advance", "choose", "lock", "skip", "pause", "resume", "extend"] as const;
export type Choice = typeof partyChoices[number];
export type PartyStage = typeof partyStages[number];
export type PartyAction = typeof partyClientActions[number];
export type LocalIdentity = { actorId: string; sessionId: string; role: "gm" | "player" | "spectator"; label: string };
export type LocalCredential = LocalIdentity & { token: string };
export type PartySeat = { actorId: string; label: string; seat: number; ready: boolean; score: number };
export type PartyOutcome = { actorId: string; seat: number; choice: Choice; roll: number | null; success: boolean; points: number; dangerAfter: number; text: string };
/** Internal persisted data. Never serialize this as a viewer snapshot. */
export type PartyState = {
  schemaVersion: 1; sessionId: string; mode: "party"; revision: number; roundId: number; stage: PartyStage;
  roster: PartySeat[]; participants: string[]; danger: number; deadline: number | null; paused: boolean; remainingMs: number | null;
  ending: string | null; winners: string[]; choices: Record<string, Choice>; outcomes: PartyOutcome[];
  history: Array<{ roundId: number; danger: number; outcomes: PartyOutcome[] }>;
};
/** Audience-filtered shape; only the server decides which values are visible. */
export type PartySnapshot = PartyState & {
  submittedCount: number; ownChoice: Choice | null;
  scene: { prompt: string; mend: string; dare: string; guard: string } | null;
};
export type TableCommandMetadata = { schemaVersion: 1; sessionId: string; mode: "ttrpg"; actorId: string;
  roundId: null; stage: "table"; expectedRevision?: number };
export type PartyCommandMetadata = { schemaVersion: 1; sessionId: string; mode: "party"; actorId: string;
  roundId: number; stage: PartyStage; expectedRevision?: number };
export type CommandMetadata = TableCommandMetadata | PartyCommandMetadata;
export type CommandKey = { sessionId: string; mode: "ttrpg" | "party"; actorId: string; kind: string; requestId: string };
export const abilities = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = typeof abilities[number];
export type Character = {
  id: string; name: string; classLabel: string; hp: { current: number; max: number }; armorClass: number; initiative: number | null;
  conditions: string[]; resources: Array<{ id: string; label: string; current: number; max: number }>;
  inventory: Array<{ id: string; name: string; quantity: number; detail?: string }>; notes: string[]; image?: string | null;
  stats?: Partial<Record<Ability, number>> & { skills?: string[] }; claimedByClientId: string | null; claimedByLabel: string | null;
  portrait?: { pendingId?: string; approvedId?: string; description: string; version: number; seed: number };
};
export type RollRecord = { id: string; actorId: string; actorName: string; dice: string; modifier: number; rolled: number | number[];
  total: number; advantage: boolean | null; note: string; timestamp: string; action?: { id: string; description: string; dc: number | null; success: boolean | null } };
export type CurrentAction = { id?: string; rolls?: RollRecord[]; type: string; description: string; ability: string; dc: number | null };
export type PlayerMemoryEntry = { id: string; kind: string; visibility: string; summary: string; createdAt: string };
export type PlayerSessionSnapshot = {
  campaignProgress?: import("./campaign-progress.js").CampaignProgress;
  schemaVersion: 1; sessionId: string; mode: "ttrpg"; roundId: null; stage: "table"; revision: number;
  campaignId: string; campaignTitle: string; currentScene: string; joinUrl: string;
  party: Character[]; rollLog: RollRecord[]; memoryEntries: PlayerMemoryEntry[]; currentAction: CurrentAction | null;
};

export function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function isRequestId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
export function isChoice(value: unknown): value is Choice { return typeof value === "string" && (partyChoices as readonly string[]).includes(value); }
export function isPartyStage(value: unknown): value is PartyStage { return typeof value === "string" && (partyStages as readonly string[]).includes(value); }
export function isPartyAction(value: unknown): value is PartyAction { return typeof value === "string" && (partyClientActions as readonly string[]).includes(value); }
export function isIdentity(value: unknown): value is LocalIdentity {
  return isObject(value) && ["gm", "player", "spectator"].includes(String(value.role)) &&
    [value.actorId, value.sessionId, value.label].every(value => typeof value === "string" && value.length > 0);
}
const integer = (value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const finiteTime = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0;
export function isCommandMetadata(value: unknown): value is CommandMetadata {
  if (!isObject(value) || Object.keys(value).some(key => !["schemaVersion", "sessionId", "mode", "actorId", "roundId", "stage", "expectedRevision"].includes(key)) ||
      value.schemaVersion !== 1 || typeof value.sessionId !== "string" || !value.sessionId || typeof value.actorId !== "string" || !value.actorId ||
      value.expectedRevision !== undefined && !integer(value.expectedRevision, 0)) return false;
  return value.mode === "party" ? integer(value.roundId, 0, 5) && isPartyStage(value.stage)
    : value.mode === "ttrpg" && value.roundId === null && value.stage === "table";
}
export function isPartyOutcome(value: unknown): value is PartyOutcome {
  return isObject(value) && typeof value.actorId === "string" && integer(value.seat, 1, 7) && isChoice(value.choice) &&
    (value.roll === null || integer(value.roll, 1, 6)) && typeof value.success === "boolean" && integer(value.points, 0, 4) &&
    integer(value.dangerAfter, 0, 12) && typeof value.text === "string";
}
export function isPartyState(value: unknown): value is PartyState {
  if (!isObject(value) || value.schemaVersion !== 1 || value.mode !== "party" || typeof value.sessionId !== "string" || !value.sessionId ||
      !integer(value.revision, 0) || !integer(value.roundId, 0, 5) || !isPartyStage(value.stage) ||
      !Array.isArray(value.roster) || value.roster.length > 7 || !value.roster.every((seat, index) => isObject(seat) && typeof seat.actorId === "string" &&
        !!seat.actorId && typeof seat.label === "string" && !!seat.label && seat.seat === index + 1 && integer(seat.score, 0) && typeof seat.ready === "boolean")) return false;
  const ids = new Set(value.roster.map(seat => seat.actorId));
  if (ids.size !== value.roster.length || !Array.isArray(value.participants) || value.participants.length > 7 ||
      !value.participants.every(id => typeof id === "string" && ids.has(id)) || new Set(value.participants).size !== value.participants.length ||
      !isObject(value.choices) || !Object.entries(value.choices).every(([id, choice]) => (value.participants as unknown[]).includes(id) && isChoice(choice))) return false;
  return typeof value.paused === "boolean" && finiteTime(value.deadline) && finiteTime(value.remainingMs) && integer(value.danger, 0, 12) &&
    (value.ending === null || typeof value.ending === "string") && Array.isArray(value.winners) && value.winners.length <= 7 &&
    value.winners.every(id => typeof id === "string" && ids.has(id)) &&
    Array.isArray(value.outcomes) && value.outcomes.length <= 7 && value.outcomes.every(isPartyOutcome) &&
    Array.isArray(value.history) && value.history.length <= 5 && value.history.every(round => isObject(round) && integer(round.roundId, 1, 5) &&
      integer(round.danger, 0, 12) && Array.isArray(round.outcomes) && round.outcomes.length <= 7 && round.outcomes.every(isPartyOutcome));
}
export function isPartySnapshot(value: unknown): value is PartySnapshot {
  if (!isObject(value)) return false;
  const view: Record<string, unknown> = value;
  return isPartyState(value) && integer(view.submittedCount, 0, value.participants.length) &&
    (view.ownChoice === null || isChoice(view.ownChoice)) &&
    (view.scene === null || isObject(view.scene) && [view.scene.prompt, view.scene.mend, view.scene.dare, view.scene.guard].every(text => typeof text === "string"));
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const texts = (value: Record<string, unknown>, keys: string[]) => keys.every(key => typeof value[key] === "string");
export function isRollRecord(value: unknown): value is RollRecord {
  return isObject(value) && texts(value, ["id", "actorId", "actorName", "dice", "note", "timestamp"]) && !!value.id &&
    (value.action === undefined || isObject(value.action) && typeof value.action.id === 'string' && typeof value.action.description === 'string' &&
      (value.action.dc === null || finite(value.action.dc)) && (value.action.success === null || typeof value.action.success === 'boolean')) &&
    finite(value.modifier) && finite(value.total) && (value.advantage === null || typeof value.advantage === "boolean") &&
    (finite(value.rolled) || Array.isArray(value.rolled) && value.rolled.length <= 1000 && value.rolled.every(finite));
}
export function isCharacter(value: unknown): value is Character {
  return isObject(value) && texts(value, ["id", "name", "classLabel"]) && isObject(value.hp) && finite(value.hp.current) && finite(value.hp.max) &&
    finite(value.armorClass) && (value.initiative === null || finite(value.initiative)) && strings(value.conditions) && strings(value.notes) &&
    (value.image === undefined || value.image === null || typeof value.image === "string") &&
    (value.portrait === undefined || isObject(value.portrait) && typeof value.portrait.description === "string" && value.portrait.description.length <= 600 &&
      integer(value.portrait.version, 1) && integer(value.portrait.seed, 0, 4294967295) &&
      [value.portrait.pendingId, value.portrait.approvedId].every(id => id === undefined || typeof id === "string" && /^[a-f0-9]{64}$/.test(id))) &&
    (value.claimedByClientId === null || typeof value.claimedByClientId === "string") && (value.claimedByLabel === null || typeof value.claimedByLabel === "string") &&
    Array.isArray(value.resources) && value.resources.every(item => isObject(item) && texts(item, ["id", "label"]) && finite(item.current) && finite(item.max)) &&
    Array.isArray(value.inventory) && value.inventory.every(item => isObject(item) && texts(item, ["id", "name"]) && finite(item.quantity) && (item.detail === undefined || typeof item.detail === "string")) &&
    (value.stats === undefined || isObject(value.stats) && abilities.every(key => value.stats && isObject(value.stats) && (value.stats[key] === undefined || finite(value.stats[key]))) &&
      (value.stats.skills === undefined || strings(value.stats.skills)));
}
export function isPlayerSessionSnapshot(value: unknown): value is PlayerSessionSnapshot {
  return isObject(value) && (value.campaignProgress === undefined || isCampaignProgress(value.campaignProgress)) && value.schemaVersion === 1 && value.mode === "ttrpg" && value.stage === "table" && value.roundId === null &&
    integer(value.revision, 0) && texts(value, ["sessionId", "campaignId", "campaignTitle", "currentScene", "joinUrl"]) &&
    Array.isArray(value.party) && value.party.every(isCharacter) && Array.isArray(value.rollLog) && value.rollLog.every(isRollRecord) &&
    Array.isArray(value.memoryEntries) && value.memoryEntries.every(item => isObject(item) && texts(item, ["id", "kind", "visibility", "summary", "createdAt"])) &&
    (value.currentAction === null || isObject(value.currentAction) && texts(value.currentAction, ["type", "description", "ability"]) &&
      (value.currentAction.dc === null || finite(value.currentAction.dc)));
}

export type * from "./ttrpg.js";
export { sceneBeatKinds, capabilityStates } from "./ttrpg.js";
export * from "./ttrpg-validation.js";
export * from "./ttrpg-responses.js";
export * from "./ai-action.js";
export * from "./media-router.js";


export * from "./campaign-progress.js";
