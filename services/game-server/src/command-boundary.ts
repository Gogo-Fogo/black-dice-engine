import { AsyncLocalStorage } from "node:async_hooks";
import type express from "express";
import { CommandStore } from "./command-store.js";
import { SessionError } from "./session-authority.js";
import { identityFor, validateCommandOwnership } from "./session-http.js";
import { tableCommandKind, validateTableCommand } from "./table-commands.js";

type Frame = { completed: boolean; before: unknown; effects: Array<() => void>; writes: Array<() => void>; abort(): void };
/** Only synchronous domain handlers enter this boundary. Async adapters stay outside. */
export class CommandBoundary {
  private frames = new AsyncLocalStorage<Frame>();
  constructor(private store: CommandStore, private hooks: {
    capture(): unknown; restore(state: unknown): void; persist(): void;
  }) {}

  pending() { const frame = this.frames.getStore(); return !!frame && !frame.completed; }
  /** Run auxiliary SQLite writes inside the same transaction as state and receipt. */
  persist(effect: () => void) {
    const frame = this.frames.getStore();
    if (!frame || frame.completed) throw new Error("Transactional command required");
    frame.writes.push(effect);
  }
  defer(effect: () => void) {
    const frame = this.frames.getStore();
    if (frame && !frame.completed) frame.effects.push(effect);
    else effect();
  }

  middleware: express.RequestHandler = (request, response, next) => {
    if (request.method !== "POST" || !tableCommandKind(request.path)) { next(); return; }
    try {
      const identity = identityFor(request);
      const command = validateTableCommand(request.path, request.body, identity);
      const key = { sessionId: identity.sessionId, mode: "ttrpg" as const, actorId: identity.actorId,
        kind: `${command.kind}:${request.path}`, requestId: command.requestId };
      const payload = structuredClone(request.body);
      const prior = this.store.replay(key, payload);
      if (prior) { response.status(prior.status).json(prior.body); return; }
      validateCommandOwnership(request);
      const revision = this.store.revision(identity.sessionId, "ttrpg");
      if (command.metadata.expectedRevision !== undefined && command.metadata.expectedRevision !== revision) throw new SessionError(409, "Session changed. Refresh before retrying.");
      const before = structuredClone(this.hooks.capture());
      const frame: Frame = { before, completed: false, effects: [], writes: [], abort: () => {
        if (!frame.completed) { this.hooks.restore(before); frame.effects.length = 0; frame.completed = true; }
      } };
      const json = response.json.bind(response);
      response.json = ((body: unknown) => {
        if (frame.completed) return json(body);
        if (response.statusCode >= 400) { frame.abort(); return json(body); }
        const metadata = { ...command.metadata, kind: command.kind, revision: revision + 1, requestId: command.requestId };
        const result = { ...(body && typeof body === "object" ? body : { result: body }), command: metadata };
        const state = structuredClone(this.hooks.capture());
        try {
          this.store.commit(key, payload, revision, state, { status: response.statusCode, body: result, revision: revision + 1 }, () => {
            this.hooks.persist(); for (const write of frame.writes) write();
          });
        } catch (error) {
          frame.abort();
          if (error instanceof SessionError) throw error;
          throw new SessionError(503, "Could not save this action. State was kept unchanged. Ask the host to check storage, then retry the same request.");
        }
        frame.completed = true;
        for (const effect of frame.effects) {
          try { effect(); } catch { console.error("[game-server] A post-commit presentation/export effect failed."); }
        }
        frame.effects.length = 0;
        return json(result);
      }) as express.Response["json"];
      this.frames.run(frame, () => next());
    } catch (error) { next(error); }
  };

  errorMiddleware: express.ErrorRequestHandler = (error, _request, _response, next) => {
    this.frames.getStore()?.abort();
    next(error);
  };
}
