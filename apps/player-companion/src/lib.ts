import type { AbilityKey, Character, RollMode } from "./types";

// --- Identity and idempotent request ids -------------------------------------------------

const clientIdKey = "black-dice-engine-player-client-id";
const pendingRequestKey = "black-dice-engine-pending-requests";

function randomId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

export function getOrCreateClientId() {
  try {
    const existing = window.localStorage.getItem(clientIdKey);
    if (existing) return existing;
    const created = randomId("client");
    window.localStorage.setItem(clientIdKey, created);
    return created;
  } catch {
    return randomId("client");
  }
}

function readPending(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(pendingRequestKey);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writePending(value: Record<string, string>) {
  try {
    window.sessionStorage.setItem(pendingRequestKey, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Reuses the same request id for a retried mutation so the server can de-duplicate it. */
export function getPendingRequestId(fingerprint: string) {
  const pending = readPending();
  if (pending[fingerprint]) return pending[fingerprint];
  const created = randomId("request");
  writePending({ ...pending, [fingerprint]: created });
  return created;
}

export function clearPendingRequestId(fingerprint: string) {
  const pending = readPending();
  if (!(fingerprint in pending)) return;
  delete pending[fingerprint];
  writePending(pending);
}

export function readPref(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

// --- API -------------------------------------------------------------------------------

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bde-role": "player" },
    body: JSON.stringify(body)
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error || `Request failed (${response.status})`);
  }
  return json;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "x-bde-role": "player" } });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

// --- Rules helpers ---------------------------------------------------------------------

export const abilities: Array<{ key: AbilityKey; short: string; name: string }> = [
  { key: "str", short: "STR", name: "Strength" },
  { key: "dex", short: "DEX", name: "Dexterity" },
  { key: "con", short: "CON", name: "Constitution" },
  { key: "int", short: "INT", name: "Intelligence" },
  { key: "wis", short: "WIS", name: "Wisdom" },
  { key: "cha", short: "CHA", name: "Charisma" }
];

const skillAbility: Record<string, AbilityKey> = {
  acrobatics: "dex",
  animal_handling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleight_of_hand: "dex",
  stealth: "dex",
  survival: "wis"
};

export function isAbilityKey(value: string): value is AbilityKey {
  return abilities.some((ability) => ability.key === value);
}

export function abilityName(key: string) {
  return abilities.find((ability) => ability.key === key)?.name ?? key;
}

export function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

export function characterAbilityMod(character: Character, key: string) {
  const ability: AbilityKey = isAbilityKey(key) ? key : "wis";
  return abilityModifier(character.stats?.[ability] ?? 10);
}

/** Proficiency bonus from the trailing level in a class label like "Eldritch Knight 5". */
export function proficiencyBonus(character: Character) {
  const match = character.classLabel.match(/(\d+)\s*$/);
  const level = match ? Number(match[1]) : 1;
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function skillInfo(character: Character, skill: string) {
  const ability = skillAbility[skill] ?? "wis";
  return {
    label: skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    ability,
    modifier: characterAbilityMod(character, ability) + proficiencyBonus(character)
  };
}

export function formatMod(value: number) {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function diceWithMode(dice: string, mode: RollMode) {
  return mode === "normal" ? dice : `${dice} ${mode}`;
}

export function hpTone(hp: { current: number; max: number }) {
  const ratio = hp.max > 0 ? hp.current / hp.max : 0;
  if (hp.current <= 0) return "down";
  if (ratio <= 0.25) return "critical";
  if (ratio <= 0.6) return "wounded";
  return "healthy";
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function naturalRolls(rolled: number | number[]) {
  return Array.isArray(rolled) ? rolled : [rolled];
}

export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}

export function actionKey(action: { type: string; description: string; ability: string; dc: number | null }) {
  return `${action.type}|${action.description}|${action.ability}|${action.dc ?? ""}`;
}
