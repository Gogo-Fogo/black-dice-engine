import { isObject, isPartySnapshot, isPartyAction, isCommandMetadata, isRequestId, type PartyAction, type PartySnapshot } from "../packages/contracts/dist/index.js";
import { CommandQueue, type CommandStorage, type CommandTransport, type PendingCommand } from "./command-queue.mts";

type Actor = { actorId: string; sessionId: string };
export type PendingPartyCommand = PendingCommand<PartyAction>;

export class PartyCommandQueue extends CommandQueue<PartyAction, PartySnapshot> {
  constructor(private actor: Actor, storage: CommandStorage, transport: CommandTransport<PartyAction>, private requestId: () => string) {
    super({ key: `bde-party-pending-${actor.sessionId}-${actor.actorId}`, storage, transport,
      accepts: (value): value is PendingPartyCommand => isObject(value) && isPartyAction(value.action) && isObject(value.body) && isRequestId(value.body.requestId) &&
        isCommandMetadata(value.body._command) && value.body._command.mode === "party" && value.body._command.actorId === actor.actorId && value.body._command.sessionId === actor.sessionId,
      receipt: (pending, value) => {
        const metadata = isObject(value) && isObject(value.command) ? value.command : {};
        if (!isObject(value) || !isPartySnapshot(value.party) || value.party.sessionId !== actor.sessionId || metadata.schemaVersion !== 1 ||
            metadata.mode !== "party" || metadata.kind !== pending.action || metadata.revision !== value.party.revision ||
            metadata.requestId !== pending.body.requestId || metadata.actorId !== actor.actorId || metadata.sessionId !== actor.sessionId) throw new Error("The reply could not be confirmed. Retry the pending action.");
        return value.party;
      }
    });
  }
  prepare(action: PartyAction, view: PartySnapshot, fields: Record<string, unknown> = {}) {
    if (view.sessionId !== this.actor.sessionId) throw new Error("This view belongs to another room. Refresh before acting.");
    this.stage({ action, body: { ...fields, requestId: this.requestId(), _command: { schemaVersion: 1, sessionId: this.actor.sessionId,
      mode: "party", actorId: this.actor.actorId, roundId: view.roundId, stage: view.stage } } });
  }
}
