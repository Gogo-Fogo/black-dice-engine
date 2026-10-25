import { recordActionResolution } from "./campaign-progress.js";
import type { CampaignProgress } from "../../../packages/contracts/dist/index.js";
import { buildAiSceneContext } from "./ai-context.js";
import type { createSceneImages } from "./scene-images.js";
import type { createNarration } from "./narration.js";
import type express from "express";
import { randomUUID } from "node:crypto";
import type { Character, RollRecord, CurrentAction, TableEventRecord, SessionSnapshot, RuntimeStatus, AiLogEntry } from "../../../packages/contracts/dist/index.js";
import { parseDiceNotation, rollDice } from "./dice.js";
import type { AiCompletionResult, SceneContext, RollResultContext } from "./ai-adapter.js";
import type { createServerWork } from "./server-lifecycle.js";

export type TtrpgControls = {
  currentSceneTitle: string;
  currentAction: CurrentAction | null;
  currentActionSetAt: number;
  pendingNarration: { text: string; timestamp: number } | null;
  aiNarrationEnabled: boolean;
};

type TtrpgRouteHooks = {
  progress(): CampaignProgress;
  controls: TtrpgControls;
  party: Character[];
  rollLog: RollRecord[];
  eventLog: TableEventRecord[];
  work: Pick<ReturnType<typeof createServerWork>, "now" | "active">;
  sceneImages: Pick<ReturnType<typeof createSceneImages>, "request">;
  commands: { defer(effect: () => void): void };
  narration: Pick<ReturnType<typeof createNarration<{ scene: SceneContext; roll: RollResultContext }, AiCompletionResult>>, "run" | "cancelStale">;
  aiNarrationAvailable(): boolean;
  requireRole(...roles: ("gm" | "admin" | "player")[]): express.RequestHandler;
  recordTableEvent(event: Omit<TableEventRecord, "id" | "timestamp">): TableEventRecord;
  recordAiLog(entry: Omit<AiLogEntry, "id" | "createdAt">): void;
  broadcast(type: string, payload: unknown): void;
  getSessionSnapshot(): SessionSnapshot;
  getRuntimeStatus(): RuntimeStatus;
  publishSessionState(): SessionSnapshot;
  createMemoryEntry(trigger: string): void;
  persistState(): void;
};

// Install after session/command middleware at the former control/roll position.
// The caller retains control storage, transaction rollback and deferred delivery.
export function installTtrpgActionRoutes(app: express.Express, hooks: TtrpgRouteHooks) {
  const { controls, party, rollLog, eventLog, work, sceneImages, commands, narration, requireRole,
    recordTableEvent, recordAiLog, broadcast, getSessionSnapshot, getRuntimeStatus,
    publishSessionState, createMemoryEntry, persistState } = hooks;

  app.post("/api/set-action", requireRole("gm", "admin"), (request, response) => {
    const type = typeof request.body.type === "string" ? request.body.type.trim() : "";
    const description = typeof request.body.description === "string" ? request.body.description.trim() : "";
    const ability = typeof request.body.ability === "string" ? request.body.ability.trim() : "wis";
    const dc = typeof request.body.dc === "number" ? request.body.dc : null;
    if (!type) { response.status(400).json({ error: "type required" }); return; }
    if (hooks.progress().entries.some(e => e.kind === 'scene' && e.sceneId === hooks.progress().sceneId && e.status !== 'active')) {
      response.status(409).json({ error: 'This scene is closed. Start a new scene or explicitly reopen its progress record with a reason.' }); return;
    }
    controls.currentAction = { id: randomUUID(), type, description: description || type, ability, dc };
    controls.currentActionSetAt = work.now();
    broadcast("session_snapshot", getSessionSnapshot());
    response.json({ ok: true, action: controls.currentAction });
  });

  app.get("/api/ai/narration-toggle", requireRole("gm", "admin"), (_request, response) => {
    response.json({ enabled: controls.aiNarrationEnabled });
  });

  app.post("/api/ai/narration-toggle", requireRole("gm", "admin"), (request, response) => {
    const enabled = typeof request.body.enabled === "boolean" ? request.body.enabled : true;
    controls.aiNarrationEnabled = enabled;
    commands.defer(() => narration.cancelStale());
    response.json({ ok: true, enabled: controls.aiNarrationEnabled });
  });

  app.post("/api/set-scene", requireRole("gm", "admin"), (request, response) => {
    const title = typeof request.body.title === "string" ? request.body.title.trim() : "";
    if (!title) {
      response.status(400).json({ ok: false, error: "title required" });
      return;
    }
    hooks.progress().sceneId = randomUUID();
    hooks.progress().actionsSinceProgress = 0;
    controls.currentAction = null;
    commands.defer(() => narration.cancelStale());
    controls.currentSceneTitle = title;
    createMemoryEntry(`Scene change to "${title}"`);
    const sessionSnapshot = publishSessionState();
    persistState();
    response.json({ ok: true, sessionSnapshot });

    // Submission belongs to the committed command; rollback/replay cannot generate.
    const prompt = `${title}, medieval high fantasy, painterly oil painting style, dramatic lighting, epic fantasy illustration, high quality, detailed environment`;
    commands.defer(() => { void sceneImages.request(prompt); });
  });

  app.post("/api/save-now", requireRole("gm", "admin"), (_request, response) => {
    persistState();
    response.json({ ok: true, message: "Session state saved to database", sessionSnapshot: publishSessionState() });
  });

  app.post("/api/rolls", requireRole("player", "gm", "admin"), (request, response) => {
    const actorId = typeof request.body.actorId === "string" ? request.body.actorId : "";
    const actorName = typeof request.body.actorName === "string" ? request.body.actorName : "";
    const note = typeof request.body.note === "string" && request.body.note.trim() ? request.body.note : "Check";
    const diceRaw = typeof request.body.dice === "string" && request.body.dice.trim() ? request.body.dice.trim() : "d20";
    const modifierOverride =
      typeof request.body.modifier === "number" ? request.body.modifier : Number(request.body.modifier ?? 0);


    if (!actorId || !actorName) {
      response.status(400).json({
        error: "actorId and actorName are required"
      });
      return;
    }

    const parsed = parseDiceNotation(diceRaw);

    if (parsed.error) {
      response.status(400).json({ error: parsed.error });
      return;
    }

    // If dice notation provided, use it; otherwise default to d20 with body modifier
    const modifier = parsed.modifier + (request.body.modifier !== undefined ? modifierOverride : 0);
    const effectiveParse = { ...parsed, modifier };

    const { rolls, total } = rollDice(effectiveParse);
    const rolled = rolls.length === 1 ? rolls[0] : rolls;
    const diceLabel = parsed.advantage !== null
      ? `${parsed.count}d${parsed.sides}${modifier !== 0 ? (modifier > 0 ? "+" : "") + modifier : ""} ${parsed.advantage ? "adv" : "dis"}`
      : `${parsed.count}d${parsed.sides}${modifier !== 0 ? (modifier > 0 ? "+" : "") + modifier : ""}`;

    const record: RollRecord = {
      id: randomUUID(),
      actorId,
      actorName,
      dice: diceLabel,
      modifier,
      rolled,
      total,
      advantage: parsed.advantage,
      note,
      timestamp: new Date().toISOString()
    };

    const activeAction = controls.currentAction;
    if (activeAction && (note === "ability" || note === activeAction.type)) {
      // Restored legacy actions receive an identity once, before associating any rolls.
      activeAction.id ??= randomUUID();
      record.action = { id: activeAction.id, description: activeAction.description, dc: activeAction.dc,
        success: activeAction.dc === null ? null : total >= activeAction.dc };
    }
    if (record.action && activeAction) {
      activeAction.rolls ??= [];
      activeAction.rolls = [record, ...activeAction.rolls.filter(r => r.actorId !== record.actorId)];
    }
    rollLog.unshift(record);
    rollLog.splice(12);
    recordTableEvent({
      category: "roll",
      type: "roll_recorded",
      actor: {
        id: actorId,
        kind: "player",
        label: actorName
      },
      visibility: "player_visible",
      summary: `${actorName} rolled ${record.total} on ${note}`,
      payload: {
        rollId: record.id,
        actorId,
        actorName,
        dice: record.dice,
        modifier: record.modifier,
        rolled: record.rolled,
        total: record.total,
        note
      }
    });

    broadcast("roll_recorded", record);
    broadcast("session_snapshot", getSessionSnapshot());
    broadcast("runtime_status", getRuntimeStatus());




    // Auto-narrate when all claimed characters have rolled for the current action
    if (controls.currentAction) {
      const action = controls.currentAction;
      const claimedCharacters = party.filter(c => c.claimedByClientId);
      // One latest result per participant, tied to this exact action, never a prior check.
      const rollsForAction = claimedCharacters.flatMap(c => {
        const roll = (action.rolls ?? rollLog).find(r => r.actorId === c.id && r.action?.id === action.id);
        return roll ? [roll] : [];
      });
      const allRolled = claimedCharacters.length > 0 && claimedCharacters.every(c =>
        rollsForAction.some(r => r.actorId === c.id)
      );
      if (allRolled) {
        const abilityName: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
        const dc = action.dc;
        recordActionResolution(hooks.progress(), action, rollsForAction, new Date().toISOString());
        // Name the called check ("Athletics") rather than its ability when one was given.
        const checkName = action.type.trim() && action.type !== "ability" ? action.type.trim() : "";
        const abilityLabel = checkName ? checkName[0].toUpperCase() + checkName.slice(1) : abilityName[action.ability] || action.ability;

        // Build fallback template narration
        const templateLines = claimedCharacters.map(c => {
          const roll = rollsForAction.find(r => r.actorId === c.id);
          if (!roll) return `${c.name} hesitates.`;
          const pass = dc === null ? null : roll.total >= dc;
          if (pass === null) return `${c.name} rolls ${roll.total} on ${abilityLabel}; the GM decides the outcome (no DC set).`;
          return pass
            ? `${c.name} rolls ${roll.total} on ${abilityLabel} — success!`
            : `${c.name} rolls ${roll.total} on ${abilityLabel} — not enough. DC was ${dc}.`;
        });
        const fallbackNarration = `${action.description} ${templateLines.join(" ")}`;
        controls.pendingNarration = { text: fallbackNarration, timestamp: work.now() };

        // The host browser requests speech for pending prose; no server self-request.

        // Try AI-generated narration (may replace fallback)
        if (controls.aiNarrationEnabled && hooks.aiNarrationAvailable()) {
        commands.defer(() => { void (async () => {
          try {
            const snapshot = getSessionSnapshot();
            const sceneContext = buildAiSceneContext(snapshot, "public_demo");

            const participants: RollResultContext[] = rollsForAction.map(r => ({
              actorName: r.actorName, actionDescription: action.description, diceLabel: r.dice,
              total: r.total, modifier: r.modifier,
              rawRoll: typeof r.rolled === "number" ? r.rolled : r.rolled[0],
              success: dc === null ? null : r.total >= dc, dc, critical: null
            }));
            const rollContext: RollResultContext = { ...participants[0], participants };


            const outcome = await narration.run("roll", { scene: sceneContext, roll: rollContext }, fallbackNarration);
            if (outcome.status === "stale") return;
            controls.pendingNarration = { text: outcome.text, timestamp: work.now() };
            recordAiLog({
              kind: "output_packet", adapter: "local_model", correlationId: randomUUID(),
              summary: `AI narration completed${outcome.status === "fallback" ? " (fallback used)" : ""}`,
              details: { provider: outcome.value?.provider, model: outcome.value?.model, fallback: outcome.status === "fallback" }
            });

          } catch { /* Prepared fallback remains; never overwrite newer narration on failure. */ }
        })(); });
        }

        const successes = claimedCharacters.filter(c => {
          const roll = rollsForAction.find(r => r.actorId === c.id);
          return roll && dc !== null && roll.total >= dc;
        });
        const mood = dc === null ? "uncertain, awaiting judgment" : successes.length >= claimedCharacters.length
          ? "triumphant, hopeful, golden light, clear skies"
          : successes.length === 0
            ? "ominous, dark, fog, danger, shadows"
            : "tense, uncertain, mixed fortunes, fog parting slightly";
        const imagePrompt = `${controls.currentSceneTitle}, ${mood}, medieval high fantasy, painterly oil painting style, dramatic lighting, epic fantasy illustration, high quality, detailed environment`;
        commands.defer(() => { void sceneImages.request(imagePrompt); });

        controls.currentAction = null;
        broadcast("session_snapshot", getSessionSnapshot());
      }
    }
    response.status(201).json(record);
  });
}
