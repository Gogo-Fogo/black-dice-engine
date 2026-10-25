---
name: bde-realtime-server
description: Change Black Dice Engine's Express/Node game server, WebSocket synchronization, player sessions, permission checks, or SQLite persistence while preserving deterministic game state and reconnect behavior.
---

# Realtime game server and persistence

Inspect `services/game-server/src/index.ts`, `db.ts`, and the relevant callers. Read `docs/decisions/runtime-reliability.md` for reconnect/recovery changes and `docs/decisions/database-and-memory-design.md` for persistence changes. Separate intended architecture from implemented behavior.

## Request to authoritative state

- Trace each mutation from request parsing through session/role checks, ownership checks, validation, state application, persistence, and the resulting response/broadcast. Preserve this chain during extractions.
- Check duplicate Express routes and middleware ordering before moving handlers. A structurally identical handler can behave differently when registered earlier or later.
- Treat browser-supplied roles, character IDs, and WebSocket query parameters as untrusted. A declared role is not proof of authorization. Apply the same visibility policy to initial snapshots, REST responses, reconnect snapshots, broadcasts, and error details.
- Preserve implemented request deduplication and revision/version checks. Replaying a request or reconnecting a socket must not apply a roll or state event twice.
- Keep dice outcomes and state transitions deterministic after the authoritative roll is recorded. AI output proposes events; it does not bypass their validation or GM approval policy.

## Persistence and recovery

- Database initialization is explicit: `openGameStore(absolutePath)` owns initialization/WAL/FULL and close; `createLegacyRepository(connection)` leaves the injected connection caller-owned. Importing `db.ts` performs no environment/configuration read or database open. Legacy table replacements remain nested transactions on the command connection; asset records must write their required SQL status column. Use owned demo paths or memory for tests, never `_data` or a real campaign.
- Trace the commit boundary between memory, persisted rows, and emitted updates. When changing it, define what a failed write, restart, or repeated request means for the client.
- Keep SQL table identifiers from trusted application choices; parameter binding applies to values, not interpolated identifiers. Validate JSON loaded from persistence at the appropriate boundary rather than assuming a TypeScript assertion validates it.
- Design migration code against synthetic fixtures. Do not run a migration against user data as part of a code change.
- Optional AI, media, audio, and runtime services should time out and degrade without blocking ordinary state/roll operations. Preserve cancellation and surface actionable status.

Verify changed behavior with demo requests, including applicable denied-role, malformed-input, duplicate-request, disconnect, and restart cases. Use existing dependencies or built-in test facilities; do not install a test framework without authorization. Bind any isolated verification server to loopback and close only processes started for that check.
