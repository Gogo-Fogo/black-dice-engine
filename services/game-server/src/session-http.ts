import type express from "express";
import { SessionAuthority, SessionError, requestCredential, type LocalIdentity, type LocalCredential } from "./session-authority.js";
import { projectAssets, projectRuntime, projectSnapshot, publicSummary } from "./projections.js";

const identities = new WeakMap<express.Request, LocalIdentity>();
const ownershipChecks = new WeakMap<express.Request, () => void>();
export function validateCommandOwnership(request: express.Request) {
  ownershipChecks.get(request)?.();
}
export function identityFor(request: express.Request): LocalIdentity {
  const identity = identities.get(request);
  if (!identity) throw new SessionError(401, "Session credential required.");
  return identity;
}

export function installSessionAccess(app: express.Express, authority: SessionAuthority, hooks: {
  snapshot(): unknown;
  character(id: string): { name: string; claimedByClientId: string | null } | null;
  release(actorId?: string): void;
  hostCredential(credential: LocalCredential): void;
  disconnectRevoked(): void;
}) {
  const route = (handler: express.RequestHandler): express.RequestHandler => (request, response, next) => {
    try { handler(request, response, next); } catch (error) { next(error); }
  };
  app.post("/api/session/join", route((request, response) => {
    const credential = authority.join(request.body?.code, request.body?.label);
    response.setHeader("Cache-Control", "no-store");
    response.status(201).json(credential);
  }));
  app.post("/api/session/pair-display", route((request, response) => {
    const credential = authority.pairDisplay(request.body?.code);
    response.setHeader("Cache-Control", "no-store");
    response.status(201).json(credential);
  }));
  app.use("/api", route((request, response, next) => {
    const identity = authority.authenticate(requestCredential(request.headers));
    identities.set(request, identity);
    response.setHeader("Cache-Control", "no-store");
    const path = request.path;
    const reads = new Set(["/session/me", "/session/join-info", "/session-snapshot", "/party", "/party-game", "/rolls", "/runtime-status", "/assets", "/images", "/session-summary.md"]);
    const writes = new Set(["/claim-character", "/release-character", "/rolls", "/state-events/propose", "/session/resume", "/party-game/enter", "/party-game/ready", "/party-game/choose"]);
    if (identity.role !== "gm" && !(request.method === "GET" && (reads.has(path) || (identity.role === "player" && /^\/character-forge\/(?:options|sessions\/[^/]+(?:\/portraits\/[^/]+\/[0-9]+)?)$/.test(path)) || /^\/assets\/[^/]+\/content$/.test(path) || /^\/characters\/[^/]+\/portrait\/[^/]+$/.test(path))) &&
        !(request.method === "POST" && (path === "/session/resume" || (identity.role === "player" && (writes.has(path) || /^\/character-forge\/sessions(?:\/[^/]+\/(?:reroll|choose))?$/.test(path) || /^\/characters\/[^/]+\/portrait$/.test(path)))))) {
      throw new SessionError(403, "Host access required.");
    }
    if (request.method === "POST" && identity.role === "player") {
      const body = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new SessionError(400, "A command object is required.");
      if (path === "/claim-character" || path === "/release-character") {
        if (body.clientId !== undefined && body.clientId !== identity.actorId) throw new SessionError(403, "This membership cannot act for another player.");
        body.clientId = identity.actorId;
        body.playerLabel = identity.label;
      }
      if (path === "/rolls" || path === "/state-events/propose") {
        ownershipChecks.set(request, () => {
        const character = hooks.character(path === "/rolls" ? body.actorId : body.characterId);
        if (!character || character.claimedByClientId !== identity.actorId) throw new SessionError(403, "Claim your own character before acting.");
        if (path === "/rolls") body.actorName = character.name;
        else body.submittedBy = { id: identity.actorId, kind: "player", label: identity.label };
        });
      }
    }
    const json = response.json.bind(response);
    response.json = ((body: unknown) => {
      if (response.statusCode >= 400) return json(body);
      if (identity.role === "gm") return json(body);
      if (path === "/session-snapshot") return json(projectSnapshot(body, identity));
      if (path === "/runtime-status") return json(projectRuntime(body, identity));
      if (path === "/assets") return json({ assets: projectAssets(body && typeof body === "object" && "assets" in body ? body.assets : [], identity) });
      if (body && typeof body === "object" && "sessionSnapshot" in body) {
        return json({ ...body, sessionSnapshot: projectSnapshot(body.sessionSnapshot, identity) });
      }
      return json(body);
    }) as express.Response["json"];
    if (path === "/session-summary.md" && identity.role !== "gm") {
      response.type("text/markdown").send(publicSummary(hooks.snapshot(), identity));
      return;
    }
    next();
  }));
  app.get("/api/session/me", route((request, response) => { response.json(identityFor(request)); }));
  app.post("/api/session/resume", route((request, response) => { response.json(identityFor(request)); }));
  app.post("/api/session/display", route((request, response) => {
    response.status(201).json(authority.display(requestCredential(request.headers)));
  }));
  app.post("/api/session/display-code", route((request, response) => {
    response.status(201).json(authority.displayCode(requestCredential(request.headers)));
  }));
  app.post("/api/session/revoke", route((request, response) => {
    const actorId = request.body?.actorId;
    authority.revoke(requestCredential(request.headers), actorId);
    hooks.release(actorId);
    hooks.disconnectRevoked();
    response.json({ ok: true });
  }));
  app.post("/api/session/new-room", route((request, response) => {
    const credential = authority.newRoom(requestCredential(request.headers));
    hooks.hostCredential(credential);
    hooks.release();
    hooks.disconnectRevoked();
    response.status(201).json(credential);
  }));
}

export const sessionErrorHandler: express.ErrorRequestHandler = (error, _request, response, _next) => {
  const badBody = error?.type === "entity.parse.failed" || error?.type === "entity.too.large";
  const status = error instanceof SessionError ? error.status : badBody ? 400 : 500;
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json({ error: error instanceof SessionError ? error.message : badBody ? "Invalid request body." : "The server could not complete this request." });
};
