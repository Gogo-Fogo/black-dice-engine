import { migrateGameSchema } from "./schema-migrations.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type { LocalIdentity, LocalCredential } from "../../../packages/contracts/dist/index.js";
export type { LocalIdentity, LocalCredential } from "../../../packages/contracts/dist/index.js";
type Room = { id: string; code: string; expiresAt: number };

export class SessionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

/** Local capabilities, not accounts. No import-time I/O or database singleton. */
export class SessionAuthority {
  constructor(private database: Database.Database, private now = Date.now, private lifetimeMs = 8 * 60 * 60 * 1000) {
    migrateGameSchema(database);
  }

  room(): Room {
    const row = this.database.prepare("SELECT id, code, expires_at AS expiresAt FROM local_rooms WHERE active = 1").get() as Room | undefined;
    if (!row || row.expiresAt <= this.now()) throw new SessionError(401, "Room expired. The host must start a new room.");
    return row;
  }

  bootstrap(recoverHost = false): LocalCredential | null {
    try { this.room(); }
    catch (error) {
      if (!(error instanceof SessionError)) throw error;
      return this.createRoom();
    }
    if (!recoverHost) return null;
    return this.database.transaction(() => {
      const room = this.room();
      this.database.prepare("UPDATE local_members SET revoked = 1 WHERE room_id = ? AND role = 'gm'").run(room.id);
      return this.issue(room.id, "gm", "Host");
    })();
  }

  private issue(sessionId: string, role: LocalIdentity["role"], label: string): LocalCredential {
    const token = randomBytes(32).toString("base64url");
    const actorId = randomUUID();
    this.database.prepare("INSERT INTO local_members (actor_id, room_id, token_hash, role, label) VALUES (?, ?, ?, ?, ?)")
      .run(actorId, sessionId, digest(token), role, label);
    return { token, sessionId, actorId, role, label };
  }

  private createRoom(): LocalCredential {
    return this.database.transaction(() => {
      const id = randomUUID();
      const code = randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
      this.database.prepare("UPDATE local_rooms SET active = 0 WHERE active = 1").run();
      this.database.prepare("INSERT INTO local_rooms (id, code, expires_at, active) VALUES (?, ?, ?, 1)")
        .run(id, code, this.now() + this.lifetimeMs);
      return this.issue(id, "gm", "Host");
    })();
  }

  authenticate(token: unknown): LocalIdentity {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new SessionError(401, "Session credential required.");
    const room = this.room();
    const identity = this.database.prepare(`SELECT room_id AS sessionId, actor_id AS actorId, role, label
      FROM local_members WHERE token_hash = ? AND room_id = ? AND revoked = 0`).get(digest(token), room.id) as LocalIdentity | undefined;
    if (!identity) throw new SessionError(401, "Session expired or revoked. Join again.");
    return identity;
  }

  join(code: unknown, rawLabel: unknown): LocalCredential {
    if (typeof code !== "string" || code.trim().toUpperCase() !== this.room().code) throw new SessionError(403, "Room code is invalid.");
    if (typeof rawLabel !== "string") throw new SessionError(400, "Choose a player name.");
    const label = rawLabel.normalize("NFKC").trim();
    if (!label || label.length > 24 || /[\u0000-\u001f\u007f]/.test(label)) throw new SessionError(400, "Use a player name of 1–24 visible characters.");
    return this.database.transaction(() => {
      const room = this.room();
      const players = this.database.prepare("SELECT label FROM local_members WHERE room_id = ? AND role = 'player' AND revoked = 0")
        .all(room.id) as Array<{ label: string }>;
      if (players.some(player => player.label.toLocaleLowerCase() === label.toLocaleLowerCase())) throw new SessionError(409, "That player name is already in use.");
      if (players.length >= 7) throw new SessionError(409, "This room has seven players. Ask the host to release a seat.");
      return this.issue(room.id, "player", label);
    })();
  }

  display(hostToken: unknown): LocalCredential {
    const host = this.authenticate(hostToken);
    if (host.role !== "gm") throw new SessionError(403, "Host access required.");
    return this.issue(host.sessionId, "spectator", "Public display");
  }

  revoke(hostToken: unknown, actorId: unknown) {
    const host = this.authenticate(hostToken);
    if (host.role !== "gm") throw new SessionError(403, "Host access required.");
    if (typeof actorId !== "string" || actorId === host.actorId) throw new SessionError(400, "Choose another membership to revoke.");
    const result = this.database.prepare("UPDATE local_members SET revoked = 1 WHERE actor_id = ? AND room_id = ? AND revoked = 0")
      .run(actorId, host.sessionId);
    if (!result.changes) throw new SessionError(404, "Membership not found.");
  }

  newRoom(hostToken: unknown): LocalCredential {
    const host = this.authenticate(hostToken);
    if (host.role !== "gm") throw new SessionError(403, "Host access required.");
    return this.createRoom();
  }
}

/** Browsers put a WebSocket credential in a header protocol, never a URL. */
export function requestCredential(headers: { authorization?: string; "sec-websocket-protocol"?: string }): string {
  const bearer = headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  if (bearer) return bearer[1];
  return headers["sec-websocket-protocol"]?.split(",").map(value => value.trim())
    .find(value => value.startsWith("bde.auth."))?.slice("bde.auth.".length) ?? "";
}
