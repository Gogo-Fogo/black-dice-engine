import { isObject, isRequestId, isCommandMetadata, isPlayerSessionSnapshot, isRollRecord,
  type LocalIdentity, type PlayerSessionSnapshot, type RollRecord } from "../../../../packages/contracts/dist/index.js";
import { CommandQueue, type CommandStorage, type CommandTransport, type PendingCommand } from "../../../command-queue.mts";

export const playerCommandPaths = { claim: "/api/claim-character", release: "/api/release-character", roll: "/api/rolls" } as const;
export type PlayerCommand = keyof typeof playerCommandPaths;
export type PlayerReceipt = { revision: number; snapshot?: PlayerSessionSnapshot; roll?: RollRecord };
const isAction = (value: unknown): value is PlayerCommand => value === "claim" || value === "release" || value === "roll";

export class PlayerCommandQueue extends CommandQueue<PlayerCommand, PlayerReceipt> {
  constructor(private actor: LocalIdentity, storage: CommandStorage, transport: CommandTransport<PlayerCommand>, private requestId: () => string) {
    super({ key: `bde-table-pending-${actor.sessionId}-${actor.actorId}`, storage, transport,
      accepts: (value): value is PendingCommand<PlayerCommand> => isObject(value) && isAction(value.action) && isObject(value.body) && isRequestId(value.body.requestId) &&
        isCommandMetadata(value.body._command) && value.body._command.mode === "ttrpg" && value.body._command.actorId === actor.actorId && value.body._command.sessionId === actor.sessionId,
      receipt: (pending, value) => {
        const meta = isObject(value) && isObject(value.command) ? value.command : {};
        if (!isObject(value) || meta.schemaVersion !== 1 || meta.mode !== "ttrpg" || meta.roundId !== null || meta.stage !== "table" ||
            meta.sessionId !== actor.sessionId || meta.actorId !== actor.actorId || meta.kind !== pending.action || meta.requestId !== pending.body.requestId ||
            !Number.isSafeInteger(meta.revision) || Number(meta.revision) < 1) throw new Error("The reply could not be confirmed. Retry the pending action.");
        if (pending.action === "roll") {
          if (!isRollRecord(value) || value.actorId !== pending.body.actorId) throw new Error("The saved roll could not be confirmed. Retry the pending action.");
          return { revision: Number(meta.revision), roll: value };
        }
        if (!isPlayerSessionSnapshot(value.sessionSnapshot) || value.sessionSnapshot.sessionId !== actor.sessionId || value.sessionSnapshot.revision !== meta.revision) throw new Error("The saved sheet could not be confirmed. Retry the pending action.");
        return { revision: Number(meta.revision), snapshot: value.sessionSnapshot };
      }
    });
  }
  prepare(action: PlayerCommand, fields: Record<string, unknown>) {
    this.stage({ action, body: { ...fields, requestId: this.requestId(), _command: { schemaVersion: 1, sessionId: this.actor.sessionId,
      actorId: this.actor.actorId, mode: "ttrpg", roundId: null, stage: "table" } } });
  }
}
