import { randomInt, randomUUID } from "node:crypto";
import type express from "express";
import { CommandStore } from "./command-store.js";
import { SessionError, type LocalIdentity } from "./session-authority.js";
import { identityFor } from "./session-http.js";
import { applyPartyAction, newPartyState, partyActions, projectParty, type PartyAction, type PartyState } from "./party-game.js";

import { isObject as object, isPartyState, isCommandMetadata, isRequestId } from "../../../packages/contracts/dist/index.js";
function storedState(value: unknown, sessionId: string): PartyState {
  if (value === undefined) return newPartyState(sessionId);
  if (!isPartyState(value) || value.sessionId !== sessionId) {
    throw new SessionError(503, "Saved Party game is invalid. Ask the host to recover a demo backup before continuing.");
  }
  return value;
}
/** SQLite is the authority; a failed write never publishes an uncommitted reducer result. */
export class PartyService {
  constructor(private store: CommandStore, private publish: (state: PartyState) => void, private now = Date.now,
    private d6 = () => randomInt(1, 7)) {}

  state(sessionId: string) { return storedState(this.store.state(sessionId, "party"), sessionId); }

  recover(sessionId: string) {
    const state = this.state(sessionId);
    if (state.stage === "lobby" || state.stage === "ending" || state.paused) return;
    const next = structuredClone(state);
    next.paused = true;
    next.remainingMs = state.deadline === null ? null : Math.max(0, state.deadline - this.now());
    next.deadline = null;
    next.revision++;
    this.store.commit({ sessionId, mode: "party", actorId: "system", kind: "recover", requestId: randomUUID() }, {}, state.revision,
      next, { status: 200, body: { ok: true, revision: next.revision }, revision: next.revision }, undefined, { roundId: next.roundId, stage: next.stage });
  }

  command(actor: LocalIdentity, action: PartyAction, input: unknown) {
    if (!object(input) || !isRequestId(input.requestId)) throw new SessionError(400, "A command object with a valid requestId is required.");
    if (!partyActions.includes(action) || action === "deadline") throw new SessionError(400, "Unknown Party command.");
    const fields = ["requestId", "_command", ...(action === "ready" ? ["ready"] : action === "choose" ? ["choice"] : action === "extend" ? ["seconds"] : [])];
    if (Object.keys(input).some(key => !fields.includes(key))) throw new SessionError(400, "Unknown Party command field.");
    const metadata = input._command;
    if (!isCommandMetadata(metadata) || metadata.mode !== "party") throw new SessionError(400, "Invalid Party command metadata.");
    if (metadata.sessionId !== actor.sessionId || metadata.actorId !== actor.actorId) throw new SessionError(409, "Command belongs to another session or actor.");
    const key = { sessionId: actor.sessionId, mode: "party" as const, actorId: actor.actorId, kind: action, requestId: input.requestId };
    const prior = this.store.replay(key, input);
    if (prior) return prior;
    const state = this.state(actor.sessionId);
    if (metadata.roundId !== state.roundId || metadata.stage !== state.stage || metadata.expectedRevision !== undefined && metadata.expectedRevision !== state.revision) throw new SessionError(409, "Party changed. Refresh before acting.");
    const next = applyPartyAction(state, actor, action, input, this.now(), this.d6);
    next.revision++;
    const result = { status: 200, revision: next.revision, body: { ok: true, command: { ...metadata, kind: action, requestId: input.requestId, revision: next.revision },
      party: projectParty(next, actor) } };
    this.commit(key, input, state, next, result);
    return result;
  }

  tick(sessionId: string) {
    const state = this.state(sessionId);
    if (state.stage !== "choosing" || state.paused || state.deadline === null || this.now() < state.deadline) return;
    const actor: LocalIdentity = { sessionId, actorId: "system", role: "gm", label: "Deadline" };
    const next = applyPartyAction(state, actor, "deadline", {}, this.now(), this.d6);
    next.revision++;
    this.commit({ sessionId, mode: "party", actorId: actor.actorId, kind: "deadline", requestId: `deadline-${state.roundId}` }, {}, state, next,
      { status: 200, body: { ok: true, revision: next.revision }, revision: next.revision });
  }

  private commit(key: Parameters<CommandStore["commit"]>[0], payload: unknown, before: PartyState, next: PartyState,
    result: Parameters<CommandStore["commit"]>[4]) {
    try { this.store.commit(key, payload, before.revision, next, result, undefined, { roundId: next.roundId, stage: next.stage }); }
    catch (error) {
      if (error instanceof SessionError) throw error;
      throw new SessionError(503, "Could not save the Party action. State is unchanged. Check storage, then retry the same request.");
    }
    try { this.publish(next); } catch { console.error("[game-server] Party presentation failed after commit."); }
  }
}

export function installPartyRoutes(app: express.Express, service: PartyService) {
  app.get("/api/party-game", (request, response) => {
    const actor = identityFor(request);
    response.json(projectParty(service.state(actor.sessionId), actor));
  });
  app.post("/api/party-game/:action", (request, response) => {
    const result = service.command(identityFor(request), String(request.params.action) as PartyAction, request.body);
    response.status(result.status).json(result.body);
  });
}
