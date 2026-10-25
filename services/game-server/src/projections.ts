import type { LocalIdentity } from "./session-authority.js";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function pick(value: unknown, keys: string[]) {
  const source = object(value);
  return Object.fromEntries(keys.filter(key => key in source).map(key => [key, source[key]]));
}
function visible(value: unknown, viewer: LocalIdentity) {
  const visibility = object(value).visibility;
  return visibility === "public_demo" || (viewer.role === "player" && visibility === "player_visible");
}

export function projectRoll(value: unknown) {
  return pick(value, ["id", "actorId", "actorName", "dice", "modifier", "rolled", "total", "advantage", "note", "timestamp"]);
}

function projectBuild(value: unknown) {
  const build = object(value);
  return {
    ...pick(build, ["review", "proficiencyBonus", "subclass", "background", "backgroundFeature", "features", "abilityImprovements"]),
    attacks: list(build.attacks).map(attack => pick(attack, ["name", "bonus", "damage", "notes"])),
    ...(build.spellcasting ? { spellcasting: pick(build.spellcasting, ["ability", "saveDc", "attackBonus", "style", "cantrips", "spells"]) } : {}),
  };
}

/** Allowlist fields before serialization; unknown fields are private by default. */
export function projectSnapshot(value: unknown, viewer: LocalIdentity): unknown {
  if (viewer.role === "gm") return value;
  const snapshot = object(value);
  return {
    ...pick(snapshot, ["schemaVersion", "sessionId", "mode", "roundId", "stage", "revision", "campaignId", "campaignTitle", "currentScene", "joinUrl"]),
    party: list(snapshot.party).map(value => {
      const character = object(value);
      const own = viewer.role === "player" && character.claimedByClientId === viewer.actorId;
      return {
        ...pick(character, ["id", "name", "classLabel", "armorClass", "initiative", "conditions", "claimedByLabel"]),
        hp: pick(character.hp, ["current", "max"]),
        claimedByClientId: own ? viewer.actorId : character.claimedByClientId ? "occupied" : null,
        resources: own ? list(character.resources).map(item => pick(item, ["id", "label", "current", "max"])) : [],
        inventory: own ? list(character.inventory).map(item => pick(item, ["id", "name", "quantity", "detail"])) : [],
        notes: own ? list(character.notes).filter(note => typeof note === "string") : [],
        ...(character.portrait ? {portrait: own ? pick(character.portrait,['pendingId','approvedId','description','version','seed']) : {
          approvedId:object(character.portrait).approvedId, description:'', version:1, seed:0
        }} : {}),
        ...(own ? { stats: pick(character.stats, ["str", "dex", "con", "int", "wis", "cha", "skills"]) } : {}),
        ...(own && character.build ? { build: projectBuild(character.build) } : {}),
      };
    }),
    rollLog: list(snapshot.rollLog).map(projectRoll),
    eventLog: list(snapshot.eventLog).filter(event => visible(event, viewer))
      .map(event => pick(event, ["id", "category", "type", "timestamp", "summary", "visibility"])),
    memoryEntries: list(snapshot.memoryEntries).filter(entry => visible(entry, viewer))
      .map(entry => pick(entry, ["id", "kind", "visibility", "summary", "createdAt"])),
    ...(snapshot.campaignProgress ? { campaignProgress: {
      ...pick(snapshot.campaignProgress, ['schemaVersion', 'campaignId', 'sceneId']),
      entries: list(object(snapshot.campaignProgress).entries).filter(entry => visible(entry, viewer))
        .map(entry => pick(entry, ['id', 'kind', 'title', 'detail', 'status', 'visibility', 'sceneId', 'resolution', 'updatedAt'])),
      actions: list(object(snapshot.campaignProgress).actions).filter(action => visible(action, viewer) && !!object(action).consequence)
        .map(action => ({ ...pick(action, ['id', 'sceneId', 'description', 'dc', 'timestamp', 'consequence', 'visibility']),
          participants: list(object(action).participants).map(p => pick(p, ['actorId', 'actorName', 'rollId', 'total', 'success'])) })),
      history: [], actionsSinceProgress: 0
    } } : {}),
    currentAction: snapshot.currentAction ? pick(snapshot.currentAction, ["type", "description", "ability", "dc"]) : null,
  };
}

export function projectRuntime(value: unknown, viewer: LocalIdentity) {
  if (viewer.role === "gm") return value;
  return { ...pick(value, ["id", "status", "mode", "updatedAt"]), services: [], clients: [], warnings: [] };
}

export function projectAssets(value: unknown, viewer: LocalIdentity) {
  if (viewer.role === "gm") return value;
  return list(value).filter(asset => visible(asset, viewer) && object(asset).status === "approved")
    .map(asset => ({ ...pick(asset, ["id", "kind", "visibility", "status"]), url: `/api/assets/${encodeURIComponent(String(object(asset).id))}/content` }));
}

export function publicSummary(value: unknown, viewer: LocalIdentity) {
  const snapshot = object(projectSnapshot(value, viewer));
  const escape = (text: unknown) => String(text ?? "").replace(/[\r\n]/g, " ");
  return [`# Session summary — ${escape(snapshot.campaignTitle)}`, "", escape(snapshot.currentScene), "",
    ...list(snapshot.party).map(value => {
      const character = object(value);
      const hp = object(character.hp);
      return `- ${escape(character.name)}: ${escape(hp.current)}/${escape(hp.max)} HP`;
    }), "", "## Campaign progress", "",
    ...list(object(snapshot.campaignProgress).entries).map(value => {
      const entry = object(value); return `- [${escape(entry.status)}] ${escape(entry.title)}: ${escape(entry.resolution || entry.detail)}`;
    }), ...list(object(snapshot.campaignProgress).actions).map(value => {
      const action = object(value); return `- ${escape(action.description)}: ${escape(action.consequence)}`;
    }), "", "## Rolls", "", ...list(snapshot.rollLog).map(value => {
      const roll = object(value);
      return `- ${escape(roll.actorName)}: ${escape(roll.total)} (${escape(roll.dice)})`;
    }), ""].join("\n");
}
