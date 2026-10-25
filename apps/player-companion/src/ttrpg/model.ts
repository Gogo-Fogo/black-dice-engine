import { isObject, isPlayerSessionSnapshot, isRollRecord, abilities, type Character, type CurrentAction, type LocalIdentity,
  type PlayerSessionSnapshot, type RollRecord } from "../../../../packages/contracts/dist/index.js";

/** Ability modifier plus proficiency when the called check names one of the character's skills. */
export function abilityModifier(character: Character | null, action: CurrentAction | null) {
  const ability = abilities.find(key => key === action?.ability) ?? "wis";
  const base = Math.floor(((character?.stats?.[ability] ?? 10) - 10) / 2);
  const skill = (action?.type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!skill || !character?.stats?.skills?.includes(skill)) return base;
  const level = Number(character.classLabel.match(/(\d+)\s*$/)?.[1]) || 1;
  return base + (character.build?.proficiencyBonus ?? 2 + Math.floor((Math.min(20, level) - 1) / 4));
}

/** Latest server state selects ownership; live/receipt rolls share bounded presentation dedup. */
export class PlayerTableModel {
  private snapshot: PlayerSessionSnapshot | null = null;
  private presented = new Set<string>();
  constructor(private actor: LocalIdentity, private hooks: { snapshot(value: PlayerSessionSnapshot): void; roll(value: RollRecord): void }) {}
  current() { return this.snapshot; }
  acceptSnapshot(value: unknown) {
    if (!isPlayerSessionSnapshot(value) || value.sessionId !== this.actor.sessionId || this.snapshot && value.revision < this.snapshot.revision) return false;
    this.snapshot = value; this.hooks.snapshot(value); return true;
  }
  acceptRoll(value: unknown, revision?: number) {
    if (!isRollRecord(value) || !this.snapshot) return false;
    if (revision !== undefined && revision < this.snapshot.revision) return true;
    if (!this.snapshot.rollLog.some(roll => roll.id === value.id)) {
      this.snapshot = { ...this.snapshot, rollLog: [value, ...this.snapshot.rollLog].slice(0, 8) };
      this.hooks.snapshot(this.snapshot);
    }
    if (!this.presented.has(value.id) && this.snapshot.party.some(character => character.id === value.actorId && character.claimedByClientId === this.actor.actorId)) {
      this.presented.add(value.id);
      if (this.presented.size > 128) this.presented.delete(this.presented.values().next().value!);
      this.hooks.roll(value);
    }
    return true;
  }
  receive(message: unknown) {
    if (!isObject(message)) return false;
    if (message.type === "connected" && isObject(message.payload)) return this.acceptSnapshot(message.payload.sessionSnapshot);
    if (message.type === "session_snapshot") return this.acceptSnapshot(message.payload);
    if (message.type === "roll_recorded") return this.acceptRoll(message.payload);
    return message.type === "runtime_status";
  }
}
