import { isObject, type Ability, type CurrentAction } from "./index.js";

export const actionSkillAbilities = {
  Athletics: "str", Acrobatics: "dex", "Sleight of Hand": "dex", Stealth: "dex",
  Arcana: "int", History: "int", Investigation: "int", Nature: "int", Religion: "int",
  "Animal Handling": "wis", Insight: "wis", Medicine: "wis", Perception: "wis", Survival: "wis",
  Deception: "cha", Intimidation: "cha", Performance: "cha", Persuasion: "cha",
  Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha"
} as const satisfies Record<string, Ability>;
export const actionDifficultyDcs = { easy: 10, medium: 15, hard: 20, "very hard": 25 } as const;
export type ActionProposal = {
  action: string;
  skill: keyof typeof actionSkillAbilities;
  difficulty: keyof typeof actionDifficultyDcs;
  description: string;
  consequences: string;
};
const boundedText = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" } as const);
/** Maintained schema definition; the JSON artifact is checked against this complete value. */
export const aiActionProposalSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://black-dice-engine.local/schemas/ai-action-proposal.schema.json",
  title: "AI Action Proposal", type: "object", additionalProperties: false,
  required: ["action", "skill", "difficulty", "description", "consequences"],
  properties: {
    action: boundedText(1024), skill: { type: "string", enum: Object.keys(actionSkillAbilities) },
    difficulty: { type: "string", enum: Object.keys(actionDifficultyDcs) },
    description: boundedText(2000), consequences: boundedText(2000)
  }
} as const;
export function isActionProposal(value: unknown): value is ActionProposal {
  if (!isObject(value) || Object.keys(value).length !== aiActionProposalSchema.required.length) return false;
  const text = (key: "action" | "description" | "consequences") => typeof value[key] === "string" &&
    value[key].trim().length > 0 && value[key].length <= aiActionProposalSchema.properties[key].maxLength;
  return text("action") && text("description") && text("consequences") &&
    typeof value.skill === "string" && Object.hasOwn(actionSkillAbilities, value.skill) &&
    typeof value.difficulty === "string" && Object.hasOwn(actionDifficultyDcs, value.difficulty);
}
export function actionFromProposal(proposal: ActionProposal): CurrentAction {
  return { type: proposal.skill.toLowerCase(), description: proposal.action,
    ability: actionSkillAbilities[proposal.skill], dc: actionDifficultyDcs[proposal.difficulty] };
}
export type ActionProposalResponse = { ok: true; raw: string; proposal: ActionProposal };
export function isActionProposalResponse(value: unknown): value is ActionProposalResponse {
  return isObject(value) && value.ok === true && typeof value.raw === "string" && isActionProposal(value.proposal);
}
export type NarrationToggle = { enabled: boolean };
export function isNarrationToggle(value: unknown): value is NarrationToggle {
  return isObject(value) && typeof value.enabled === "boolean";
}
export function isNarrationToggleConfirmation(value: unknown): value is NarrationToggle & { ok: true } {
  return isObject(value) && value.ok === true && isNarrationToggle(value);
}
export function isActionConfirmation(value: unknown): value is { ok: true; action: CurrentAction } {
  if (!isObject(value) || value.ok !== true || !isObject(value.action)) return false;
  const action = value.action;
  return typeof action.type === "string" && !!action.type.trim() && typeof action.description === "string" &&
    typeof action.ability === "string" && ["str", "dex", "con", "int", "wis", "cha"].includes(action.ability) &&
    (action.dc === null || typeof action.dc === "number" && Number.isFinite(action.dc));
}
