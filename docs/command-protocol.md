# Durable table commands

The game server now uses one commit boundary for synchronous TTRPG commands. It keeps the current Express routes and SQLite read tables; no additional service or package is required. Party Mode must add its round-specific commands and projections using the same persistence rules.

## Wire contract

Each covered POST requires `requestId`: 1–128 ASCII letters, digits, underscores or hyphens. Both browser apps generate it for commands that do not already supply one. A client retry must retain the same ID and payload.

```json
{
  "requestId": "example-roll-1",
  "actorId": "owned-character-id",
  "dice": "d6",
  "_command": {
    "schemaVersion": 1,
    "sessionId": "issued-room-id",
    "mode": "ttrpg",
    "actorId": "issued-membership-id",
    "roundId": null,
    "stage": "table",
    "expectedRevision": 2
  }
}
```

The top-level actor identifies a character; metadata identifies the authenticated membership. The server checks both. `expectedRevision` is optional and rejects a new command with 409 when the room revision differs. Replaying an accepted command returns its saved result even if the revision or character ownership subsequently changed. Authentication and role authorization still run before replay; revoked credentials cannot retrieve receipts.

During legacy REST migration, omitting `_command` synthesizes v1 metadata from the authenticated identity. Supplied metadata is strictly validated: unknown fields, unsupported versions/modes/stages, non-null round IDs and unsafe revisions are rejected. A mismatched actor/session returns 409. `table-commands.ts` performs runtime validation; the [schema](../packages/shared-schemas/table-protocol-v1.schema.json) documents the envelopes and is not loaded as an executable validator.

Covered routes: character claim/release, rolls, state-event proposal/direct application/approval/rejection, set-action, set-scene, narration toggle and character creation. Their existing permission/target checks remain. Runtime guards bound string lengths, integer fields, event types, abilities and character notes. Dice notation additionally bounds count, sides and modifiers. Extra legacy payload fields remain accepted for compatibility; metadata fields are closed.

Successful responses preserve the existing body and add `command` metadata with kind, request ID and committed revision. Host and projected snapshots carry `schemaVersion`, `sessionId`, `mode`, `roundId`, `stage` and `revision`. Older domain log entries retain their existing shape. The private `command_events` journal records the v1 commit envelope; it is not broadcast directly.

## Commit and failure behavior

1. Authenticate, authorize, validate and look up a receipt by room, mode, authenticated actor, route/kind and request ID. A different canonical payload with the same key returns 409.
2. Check ownership/revision for a new command and capture the previous in-memory state. Buffer broadcasts and memory exports while synchronous handlers run.
3. In one SQLite transaction, save all legacy state tables, complete command state, recorded random results in the response/state, the next revision, receipt and event envelope. WAL uses `synchronous=FULL`.
4. On failure, SQLite rolls back all rows; restore the captured in-memory state and discard queued effects. Return 503 with guidance to check storage and retry the same request. There is no success broadcast.
5. After commit, release queued presentation/export effects and acknowledge. Failure of an optional effect cannot undo an accepted command. A retry returns the prior receipt without rerolling, changing revision or repeating effects.

On startup, legacy tables restore the committed collections; the room's saved controls restore scene, action and narration settings. Old room receipts remain private history and cannot replay into another room. Optional adapters still have legacy asynchronous state and capability work tracked in PLAN; this boundary deliberately covers synchronous domain commands. [Journal retention](command-history.md) bounds commit metadata globally to the latest 5,000 envelopes; exact receipts and complete checkpoints are preserved independently. Receipt replay never depends on a retained envelope or recent UI logs. Receipts have no automatic pruning. Do not manually remove them while a room is active.

## Evidence and limits

`tests/command-store.test.mjs` verifies scoped replay, canonical fingerprints, optimistic revision and rollback of legacy rows/receipt/state when journal insertion fails. The real HTTP/WebSocket test injects a receipt-write failure, observes unchanged state/revision and no rejected-roll broadcast, retries successfully, then crashes the child without save-now. Relaunch preserves HP, claims and revision and returns the exact earlier random result. It also replays after ownership release without reapplying the command. These tests use only disposable demo databases with outgoing provider calls blocked.

This is process-restart and transaction-failure evidence. Physical power-loss/storage corruption and live Wi-Fi/phone rehearsals remain separate plan tasks. The subsequent [Party server loop](party-mode-api.md) adds round/stage commands and seven-client headless game verification.
