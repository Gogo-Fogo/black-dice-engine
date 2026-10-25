import { isActionProposal, type ActionProposal } from "../../../packages/contracts/dist/index.js";

/** Accept one JSON object (optionally fenced), never salvage arbitrary prose. */
export function parseActionProposal(text: string): ActionProposal {
  if (text.length > 16000) throw new Error("Invalid AI action proposal");
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  let value: unknown;
  try { value = JSON.parse(fenced?.[1] ?? trimmed); }
  catch { throw new Error("Invalid AI action proposal"); }
  if (!isActionProposal(value)) throw new Error("Invalid AI action proposal");
  return value;
}
