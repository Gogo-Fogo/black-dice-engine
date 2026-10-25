import { randomInt } from "node:crypto";

export function parseDiceNotation(raw: string): { count: number; sides: number; modifier: number; advantage: boolean | null; error?: string } {
  const trimmed = raw.trim().toLowerCase();

  let advantage: boolean | null = null;
  let notation = trimmed;

  if (/\s+adv$/i.test(trimmed)) {
    advantage = true;
    notation = trimmed.slice(0, trimmed.lastIndexOf(" ")).trim();
  } else if (/\s+dis$/i.test(trimmed)) {
    advantage = false;
    notation = trimmed.slice(0, trimmed.lastIndexOf(" ")).trim();
  }

  const match = notation.match(/^(\d+)?d(\d+)([+-]\d+)?$/);
  if (!match) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: `Invalid dice notation: ${raw}` };
  }

  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 1000) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: "Dice modifier must be an integer between -1000 and 1000" };
  }

  if (count < 1 || count > 100) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: "Dice count must be between 1 and 100" };
  }

  if (sides < 2 || sides > 1000) {
    return { count: 0, sides: 0, modifier: 0, advantage: null, error: "Dice sides must be between 2 and 1000" };
  }

  return { count, sides, modifier, advantage };
}

export function rollDice(parsed: { count: number; sides: number; modifier: number; advantage: boolean | null }, die: (sides: number) => number = sides => randomInt(1, sides + 1)) {
  const sample = () => {
    const value = die(parsed.sides);
    if (!Number.isInteger(value) || value < 1 || value > parsed.sides) throw new Error("Invalid die result");
    return value;
  };
  const rolls: number[] = [];

  if (parsed.advantage !== null) {
    // Roll twice, take higher (adv) or lower (dis)
    for (let i = 0; i < parsed.count; i++) {
      const a = sample();
      const b = sample();
      rolls.push(parsed.advantage ? Math.max(a, b) : Math.min(a, b));
    }
  } else {
    for (let i = 0; i < parsed.count; i++) {
      rolls.push(sample());
    }
  }

  const total = rolls.reduce((sum, r) => sum + r, 0) + parsed.modifier;
  return { rolls, total };
}
