import { SessionError, type LocalIdentity } from "./session-authority.js";
import { isCommandMetadata, isProgressCommand, isRequestId, type TableCommandMetadata } from "../../../packages/contracts/dist/index.js";

const paths = new Map([
  ["/campaign-progress", "progress"], ["/claim-character", "claim"], ["/release-character", "release"], ["/rolls", "roll"],
  ["/state-events/propose", "propose"], ["/state-events", "state"], ["/set-action", "action"],
  ["/set-scene", "scene"], ["/ai/narration-toggle", "narration-toggle"], ["/characters", "character"],
]);
export function tableCommandKind(path: string) {
  if (/^\/character-forge\/sessions\/[^/]+\/choose$/.test(path)) return "forge-choose";
  if (/^\/characters\/[^/]+\/scene-job$/.test(path)) return 'character-scene';
  if (/^\/characters\/[^/]+\/portrait(?:\/review)?$/.test(path)) return path.endsWith('/review') ? 'portrait-review' : 'portrait-upload';
  if (/^\/state-events\/[^/]+\/(approve|reject)$/.test(path)) return path.endsWith("/approve") ? "approve" : "reject";
  return paths.get(path) ?? null;
}

export type CommandMetadata = TableCommandMetadata;
export function validateTableCommand(path: string, input: unknown, identity: LocalIdentity) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new SessionError(400, "A command object is required.");
  const body = input as Record<string, unknown>;
  if (!isRequestId(body.requestId)) throw new SessionError(400, "A requestId of 1–128 letters, digits, underscores or hyphens is required.");
  // Existing REST callers may omit metadata during migration; supplied metadata is strict.
  const meta = body._command ?? { schemaVersion: 1, sessionId: identity.sessionId, mode: "ttrpg", actorId: identity.actorId, roundId: null, stage: "table" };
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new SessionError(400, "Invalid command metadata.");
  const command = meta as Record<string, unknown>;
  if (!isCommandMetadata(command) || command.mode !== "ttrpg") throw new SessionError(400, "Unsupported command version, mode or stage.");
  if (command.sessionId !== identity.sessionId || command.actorId !== identity.actorId) throw new SessionError(409, "Command belongs to another session or actor.");
  const finite = (key: string, min: number, max: number, optional = false) => {
    if (optional && body[key] === undefined) return;
    if (typeof body[key] !== "number" || !Number.isFinite(body[key]) || !Number.isInteger(body[key]) || body[key] < min || body[key] > max) throw new SessionError(400, `Invalid ${key}.`);
  };
  const text = (key: string, max: number, optional = false, blank = false) => {
    if (optional && body[key] === undefined) return;
    if (typeof body[key] !== "string" || (!blank && !body[key].trim()) || body[key].length > max) throw new SessionError(400, `Invalid ${key}.`);
  };
  const kind = tableCommandKind(path);
  if (!kind) throw new SessionError(400, "Unknown table command.");
  if (kind === "forge-choose") { text("proposalId",128); finite("portraitIndex",0,1,true); text("image",750000,true); }
  if (kind === "progress" && !Boolean(isProgressCommand(body))) throw new SessionError(400, "Invalid progress command.");
  if (kind === 'character-scene') text('scenePrompt', 1200);
  if (kind === 'portrait-upload') { text('image', 750000); text('description', 600, true, true); }
  if (kind === 'portrait-review') { text('referenceId', 64); if (typeof body.approve !== 'boolean') throw new SessionError(400, 'Approval decision required.'); }
  if (kind === "claim") text("characterId", 128);
  if (kind === "roll") {
    text("actorId", 128); text("actorName", 80, true); text("dice", 64, true); text("note", 256, true, true); finite("modifier", -1000, 1000, true);
  }
  if (kind === "state" || kind === "propose") {
    text("characterId", 128);
    if (!["hp_delta", "condition_add", "condition_remove", "resource_set", "initiative_set"].includes(String(body.type))) throw new SessionError(400, "Unknown state event type.");
    if (body.type === "hp_delta") finite("amount", -100000, 100000);
    if (body.type === "condition_add" || body.type === "condition_remove") text("condition", 128);
    if (body.type === "resource_set") { text("resourceId", 128); finite("value", 0, 100000); }
    if (body.type === "initiative_set" && body.value !== null) finite("value", -1000, 1000);
  }
  if (kind === "scene") text("title", 256);
  if (kind === "action") {
    text("type", 64); text("description", 1024, true, true);
    if (body.ability !== undefined && !["str", "dex", "con", "int", "wis", "cha"].includes(String(body.ability))) throw new SessionError(400, "Invalid ability.");
    if (body.dc !== undefined && body.dc !== null) finite("dc", 0, 1000);
  }
  if (kind === "narration-toggle" && typeof body.enabled !== "boolean") throw new SessionError(400, "Invalid enabled flag.");
  if (kind === "character") {
    text("name", 80); text("classLabel", 80); finite("maxHp", 1, 100000, true); finite("armorClass", 0, 1000, true); finite("level", 1, 100, true);
    if (body.notes !== undefined && (!Array.isArray(body.notes) || body.notes.length > 30 || body.notes.some(note => typeof note !== "string" || note.length > 2000))) throw new SessionError(400, "Invalid notes.");
  }
  return { kind, requestId: body.requestId, metadata: command as CommandMetadata };
}
