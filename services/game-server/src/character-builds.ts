/**
 * Deterministic quick-start build details for Forge characters: subclass, background,
 * attacks, spellcasting picks, class features and ability score improvements.
 *
 * Content uses SRD 5.1 names and 2014-style progression only. Picks are sensible
 * defaults that a GM reviews; the LLM never supplies mechanics.
 */

import type { CharacterBuild } from "../../../packages/contracts/dist/index.js";

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const proficiencyBonus = (level: number) => 2 + Math.floor((level - 1) / 4);
export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
const damage = (dice: string, bonus: number, kind: string) => `${dice}${bonus ? ` ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)}` : ""} ${kind}`;

/** Levels that grant an Ability Score Improvement, applied as +2 to the primary ability. */
const asiLevels: Record<string, number[]> = { fighter: [4, 6, 8, 12, 14, 16, 19], rogue: [4, 8, 10, 12, 16, 19] };
export function asiCount(classId: string, level: number) {
  return (asiLevels[classId] ?? [4, 8, 12, 16, 19]).filter((at) => at <= level).length;
}

const subclasses: Record<string, { name: string; at: number }> = {
  fighter: { name: "Champion", at: 3 }, barbarian: { name: "Path of the Berserker", at: 3 }, paladin: { name: "Oath of Devotion", at: 3 },
  rogue: { name: "Thief", at: 3 }, ranger: { name: "Hunter", at: 3 }, wizard: { name: "School of Evocation", at: 2 },
  sorcerer: { name: "Draconic Bloodline", at: 1 }, warlock: { name: "The Fiend", at: 1 }, cleric: { name: "Life Domain", at: 1 },
  druid: { name: "Circle of the Land", at: 2 }, bard: { name: "College of Lore", at: 3 }
};

export const backgrounds: Record<string, { name: string; skills: string[]; feature: string }> = {
  soldier: { name: "Soldier", skills: ["athletics", "intimidation"], feature: "Military Rank: soldiers of a former army still recognize your authority." },
  criminal: { name: "Criminal", skills: ["deception", "stealth"], feature: "Criminal Contact: a reliable go-between can pass messages for you." },
  sage: { name: "Sage", skills: ["arcana", "history"], feature: "Researcher: you usually know where or from whom to learn a fact." },
  acolyte: { name: "Acolyte", skills: ["insight", "religion"], feature: "Shelter of the Faithful: temples of your faith offer you modest help." }
};
const classBackground: Record<string, keyof typeof backgrounds> = {
  fighter: "soldier", barbarian: "soldier", paladin: "acolyte", rogue: "criminal", ranger: "soldier", wizard: "sage",
  sorcerer: "sage", warlock: "criminal", cleric: "acolyte", druid: "acolyte", bard: "criminal"
};

/** Feature name, the level gained, and an optional short note. */
const features: Record<string, Array<[string, number, string?]>> = {
  fighter: [["Fighting Style: Dueling", 1, "+2 damage with a one-handed weapon"], ["Second Wind", 1], ["Action Surge", 2], ["Improved Critical", 3, "crit on 19–20"], ["Extra Attack", 5]],
  barbarian: [["Rage", 1], ["Unarmored Defense", 1], ["Reckless Attack", 2], ["Danger Sense", 2], ["Frenzy", 3], ["Extra Attack", 5], ["Fast Movement", 5]],
  paladin: [["Divine Sense", 1], ["Lay on Hands", 1], ["Fighting Style: Dueling", 2, "+2 damage with a one-handed weapon"], ["Divine Smite", 2], ["Divine Health", 3], ["Channel Divinity: Sacred Weapon", 3], ["Extra Attack", 5]],
  rogue: [["Expertise", 1, "stealth and thieves' tools"], ["Sneak Attack", 1], ["Thieves' Cant", 1], ["Cunning Action", 2], ["Fast Hands", 3], ["Second-Story Work", 3], ["Uncanny Dodge", 5]],
  ranger: [["Favored Enemy", 1], ["Natural Explorer", 1], ["Fighting Style: Archery", 2, "+2 to ranged weapon attacks"], ["Primeval Awareness", 3], ["Hunter's Prey: Colossus Slayer", 3], ["Extra Attack", 5]],
  wizard: [["Arcane Recovery", 1], ["Evocation Savant", 2], ["Sculpt Spells", 2]],
  sorcerer: [["Draconic Resilience", 1, "+1 HP per level; unarmored AC 13 + DEX"], ["Font of Magic", 2], ["Metamagic: Quickened and Careful Spell", 3]],
  warlock: [["Dark One's Blessing", 1], ["Eldritch Invocation: Agonizing Blast", 2, "add CHA to Eldritch Blast damage"], ["Pact of the Tome", 3]],
  cleric: [["Disciple of Life", 1], ["Channel Divinity: Turn Undead and Preserve Life", 2], ["Destroy Undead", 5]],
  druid: [["Druidic", 1], ["Wild Shape", 2], ["Natural Recovery", 2]],
  bard: [["Bardic Inspiration", 1], ["Jack of All Trades", 2], ["Song of Rest", 2], ["Expertise", 3, "persuasion and performance"], ["Cutting Words", 3], ["Font of Inspiration", 5]]
};

type Weapon = { name: string; dice: string; kind: string; ability: "str" | "dex"; ranged?: boolean; note?: string };
const weapons: Record<string, Weapon[]> = {
  fighter: [{ name: "Longsword", dice: "1d8", kind: "slashing", ability: "str" }, { name: "Handaxe", dice: "1d6", kind: "slashing", ability: "str", ranged: true, note: "thrown 20/60 ft" }],
  barbarian: [{ name: "Greataxe", dice: "1d12", kind: "slashing", ability: "str" }, { name: "Javelin", dice: "1d6", kind: "piercing", ability: "str", ranged: true, note: "thrown 30/120 ft" }],
  paladin: [{ name: "Warhammer", dice: "1d8", kind: "bludgeoning", ability: "str" }],
  rogue: [{ name: "Shortsword", dice: "1d6", kind: "piercing", ability: "dex" }, { name: "Shortbow", dice: "1d6", kind: "piercing", ability: "dex", ranged: true, note: "80/320 ft" }],
  ranger: [{ name: "Longbow", dice: "1d8", kind: "piercing", ability: "dex", ranged: true, note: "150/600 ft" }, { name: "Shortsword", dice: "1d6", kind: "piercing", ability: "dex" }],
  wizard: [{ name: "Quarterstaff", dice: "1d6", kind: "bludgeoning", ability: "str" }],
  sorcerer: [{ name: "Dagger", dice: "1d4", kind: "piercing", ability: "dex", note: "finesse, thrown 20/60 ft" }],
  warlock: [{ name: "Light Crossbow", dice: "1d8", kind: "piercing", ability: "dex", ranged: true, note: "80/320 ft" }],
  cleric: [{ name: "Mace", dice: "1d6", kind: "bludgeoning", ability: "str" }],
  druid: [{ name: "Quarterstaff", dice: "1d6", kind: "bludgeoning", ability: "str" }],
  bard: [{ name: "Rapier", dice: "1d8", kind: "piercing", ability: "dex" }]
};

type Caster = {
  ability: Ability;
  style: "known" | "prepared";
  cantrips: string[];
  cantripCount: [number, number, number]; // at levels 1, 4, 10
  spells: string[][]; // by spell level 1..5
  known?: number[]; // spells known by character level, for "known" casters
  attackCantrip?: { name: string; die: string; kind: string; save?: Ability; addMod?: boolean; beams?: boolean };
};
const casters: Record<string, Caster> = {
  wizard: { ability: "int", style: "prepared", cantripCount: [3, 4, 5], cantrips: ["Fire Bolt", "Mage Hand", "Light", "Prestidigitation", "Ray of Frost"],
    spells: [["Magic Missile", "Shield", "Sleep", "Detect Magic", "Mage Armor", "Feather Fall"], ["Misty Step", "Scorching Ray", "Invisibility", "Hold Person"], ["Fireball", "Counterspell", "Fly"], ["Polymorph", "Greater Invisibility"], ["Cone of Cold", "Wall of Force"]],
    attackCantrip: { name: "Fire Bolt", die: "d10", kind: "fire" } },
  sorcerer: { ability: "cha", style: "known", cantripCount: [4, 5, 6], cantrips: ["Fire Bolt", "Light", "Prestidigitation", "Shocking Grasp", "Mage Hand", "Ray of Frost"],
    spells: [["Magic Missile", "Shield", "Burning Hands", "Thunderwave"], ["Misty Step", "Scorching Ray", "Hold Person"], ["Fireball", "Haste", "Lightning Bolt"], ["Polymorph", "Greater Invisibility"], ["Cone of Cold"]],
    known: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15], attackCantrip: { name: "Fire Bolt", die: "d10", kind: "fire" } },
  warlock: { ability: "cha", style: "known", cantripCount: [2, 3, 4], cantrips: ["Eldritch Blast", "Minor Illusion", "Mage Hand", "Chill Touch"],
    spells: [["Hellish Rebuke", "Charm Person", "Protection from Evil and Good", "Unseen Servant"], ["Hold Person", "Invisibility", "Misty Step", "Darkness"], ["Counterspell", "Fly", "Hypnotic Pattern"], ["Dimension Door", "Banishment"], ["Hold Monster"]],
    known: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15], attackCantrip: { name: "Eldritch Blast", die: "d10", kind: "force", beams: true } },
  cleric: { ability: "wis", style: "prepared", cantripCount: [3, 4, 5], cantrips: ["Sacred Flame", "Guidance", "Spare the Dying", "Light", "Thaumaturgy"],
    spells: [["Cure Wounds", "Bless", "Guiding Bolt", "Healing Word", "Shield of Faith"], ["Spiritual Weapon", "Lesser Restoration", "Aid"], ["Spirit Guardians", "Revivify", "Mass Healing Word"], ["Death Ward", "Guardian of Faith"], ["Greater Restoration", "Mass Cure Wounds"]],
    attackCantrip: { name: "Sacred Flame", die: "d8", kind: "radiant", save: "dex" } },
  druid: { ability: "wis", style: "prepared", cantripCount: [2, 3, 4], cantrips: ["Produce Flame", "Guidance", "Druidcraft", "Shillelagh"],
    spells: [["Cure Wounds", "Entangle", "Goodberry", "Healing Word", "Faerie Fire"], ["Moonbeam", "Pass without Trace", "Barkskin"], ["Call Lightning", "Plant Growth", "Conjure Animals"], ["Polymorph", "Ice Storm"], ["Mass Cure Wounds", "Tree Stride"]],
    attackCantrip: { name: "Produce Flame", die: "d8", kind: "fire" } },
  bard: { ability: "cha", style: "known", cantripCount: [2, 3, 4], cantrips: ["Vicious Mockery", "Minor Illusion", "Mage Hand", "Light"],
    spells: [["Healing Word", "Charm Person", "Faerie Fire", "Thunderwave", "Sleep"], ["Suggestion", "Invisibility", "Heat Metal"], ["Hypnotic Pattern", "Dispel Magic"], ["Dimension Door", "Polymorph"], ["Mass Cure Wounds", "Greater Restoration"]],
    known: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22], attackCantrip: { name: "Vicious Mockery", die: "d4", kind: "psychic", save: "wis" } },
  paladin: { ability: "cha", style: "prepared", cantripCount: [0, 0, 0], cantrips: [],
    spells: [["Bless", "Cure Wounds", "Shield of Faith", "Divine Favor"], ["Aid", "Lesser Restoration"], ["Revivify", "Dispel Magic"], ["Death Ward"], ["Dispel Evil and Good"]] },
  ranger: { ability: "wis", style: "known", cantripCount: [0, 0, 0], cantrips: [],
    spells: [["Hunter's Mark", "Cure Wounds", "Goodberry", "Fog Cloud"], ["Pass without Trace", "Spike Growth"], ["Conjure Animals", "Lightning Arrow"], ["Freedom of Movement"], ["Swift Quiver"]],
    known: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11] }
};

const cantripScale = (level: number) => (level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1);

/** Pick spells round-robin from the highest castable level down so each tier is represented. */
function pickSpells(lists: string[][], maxLevel: number, count: number) {
  const pools = lists.slice(0, Math.min(maxLevel, lists.length)).map((list) => list.slice()).reverse();
  const picked: string[] = [];
  while (picked.length < count && pools.some((pool) => pool.length)) {
    for (const pool of pools) if (picked.length < count && pool.length) picked.push(pool.shift()!);
  }
  return picked;
}

export function buildDetails(classId: string, level: number, stats: Record<Ability, number>, maxSpellLevel: number): CharacterBuild {
  const prof = proficiencyBonus(level);
  const mod = (ability: Ability) => abilityMod(stats[ability]);
  const owned = (name: string) => features[classId]?.some(([feature, at]) => feature.startsWith(name) && at <= level) ?? false;
  const attacks: CharacterBuild["attacks"] = (weapons[classId] ?? []).map((weapon) => {
    const ability = mod(weapon.ability);
    const toHit = prof + ability + (weapon.ranged && owned("Fighting Style: Archery") ? 2 : 0);
    const dueling = !weapon.ranged && owned("Fighting Style: Dueling") && !["Greataxe", "Quarterstaff"].includes(weapon.name) ? 2 : 0;
    const notes = [weapon.note, owned("Extra Attack") ? "two attacks per Attack action" : "", classId === "rogue" ? `Sneak Attack +${Math.ceil(level / 2)}d6 once per turn` : ""].filter(Boolean).join("; ");
    return { name: weapon.name, bonus: signed(toHit), damage: damage(weapon.dice, ability + dueling, weapon.kind), ...(notes ? { notes } : {}) };
  });
  const caster = casters[classId];
  let spellcasting: CharacterBuild["spellcasting"];
  if (caster && (maxSpellLevel > 0 || caster.cantrips.length)) {
    const ability = mod(caster.ability);
    const cantripCount = caster.cantripCount[level >= 10 ? 2 : level >= 4 ? 1 : 0];
    const prepared = classId === "paladin" ? Math.max(1, ability + Math.floor(level / 2)) : Math.max(1, ability + level);
    const count = caster.style === "known" ? caster.known![level - 1] : prepared;
    const cantrip = caster.attackCantrip;
    if (cantrip) {
      const beams = cantrip.beams ? cantripScale(level) : 1;
      const dice = cantrip.beams ? `1${cantrip.die}` : `${cantripScale(level)}${cantrip.die}`;
      const agonizing = cantrip.beams && owned("Eldritch Invocation: Agonizing Blast") ? ability : 0;
      attacks.push({ name: cantrip.name, bonus: cantrip.save ? `DC ${8 + prof + ability} ${cantrip.save.toUpperCase()}` : signed(prof + ability),
        damage: damage(dice, agonizing, cantrip.kind), notes: ["cantrip", beams > 1 ? `${beams} beams` : ""].filter(Boolean).join("; ") });
    }
    spellcasting = { ability: caster.ability, saveDc: 8 + prof + ability, attackBonus: signed(prof + ability), cantrips: caster.cantrips.slice(0, cantripCount),
      spells: pickSpells(caster.spells, maxSpellLevel, count), style: caster.style };
  }
  const subclass = subclasses[classId];
  const background = backgrounds[classBackground[classId]];
  const asi = asiCount(classId, level);
  return {
    review: "quick_start",
    proficiencyBonus: prof,
    subclass: subclass && level >= subclass.at ? subclass.name : null,
    background: background.name,
    backgroundFeature: background.feature,
    attacks,
    ...(spellcasting ? { spellcasting } : {}),
    features: (features[classId] ?? []).filter(([, at]) => at <= level).map(([name, , note]) => (note ? `${name} (${note})` : name)),
    abilityImprovements: asi ? `${asi} Ability Score Improvement${asi > 1 ? "s" : ""} applied as +2 to the primary ability (max 20).` : null
  };
}

export const backgroundSkills = (classId: string) => backgrounds[classBackground[classId]].skills;
