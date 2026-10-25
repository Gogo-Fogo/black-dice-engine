# Bounded command metadata and durable replay

`CommandStore` retains the latest **5,000 commit envelopes globally**, across rooms and both modes, in `command_events`. The bound applies at store construction and inside each successful command transaction. A caller-owned test store can inject a limit from 1 to 50,000; production uses the default and adds no environment setting. Validation happens before schema initialization.

Retention orders envelopes by SQLite insertion rowid, not wall-clock timestamps. Clock corrections therefore cannot evict newer commits in favor of older ones. Per-room revisions still order that room's history. This is a bounded operational journal, not a full audit log, and the limit is global rather than multiplied by every retired room.

## Recovery data is preserved

Trimming deletes only redundant commit metadata from `command_events`. It never deletes or rewrites `command_receipts`, `command_sessions`, authority, legacy/domain records, saved outcomes or user files. Receipt scope remains room/mode/authenticated actor/kind/request ID. Every accepted receipt keeps its canonical payload fingerprint, exact response/status and revision indefinitely. Different payloads still conflict after their metadata envelope expires. State recovery reads the latest complete checkpoint; retry reads the durable receipt, without regenerating dice or reapplying effects.

This policy bounds the metadata journal, **not total database size**. Receipts/checkpoints are intentional durable recovery data. A future archive policy must address credential expiry, request-ID reuse, verified backup and user-controlled archival before reducing that data; it must not silently prune accepted outcomes to meet a byte target. No automatic deletion of campaign history, user records, media or files is introduced.

The `historyWindow(sessionId, mode)` store method returns the current revision, retained first/last revisions (null when none remain), the global retention limit, retained envelopes and an explicit `truncated` flag. An old room can have a saved checkpoint and receipts but no retained envelopes. This private method is not an HTTP/WebSocket endpoint or audience projection. It must not be exposed to players: envelopes include private actor/request metadata. Its metadata is not sufficient to rebuild full state by event sourcing; recovery uses checkpoints/receipts instead.

The 12-roll and 20-event TTRPG UI collections remain recent presentation windows. Session summaries based on them are recent summaries, not complete audit exports. Party checkpoints retain the game's authoritative prepared outcomes/history independently of journal eviction.

## Atomicity and compatibility

Command persistence, legacy writes, checkpoint, exact receipt, new envelope and metadata trimming share one SQLite transaction. A trim failure rolls back the whole new command, including any metadata removed during that transaction; existing boundary code restores in-memory state and reports storage failure. Retry uses the same request ID. Startup trimming likewise uses a transaction and fails startup if retention cannot complete. No timer or external cleanup process races command admission.

No schema version changes: tables/columns/keys remain those established by migrations 1/2. This is a runtime retention policy, so metadata beyond the bound can disappear when the store opens even without a new command. It does not compact/shrink the SQLite file or run VACUUM. Returning to an older build cannot reconstruct trimmed envelopes, but preserved checkpoints and receipts retain their previous format. Keep a verified consistent backup if full historical metadata must be preserved before adopting this policy. Implementation/testing used disposable data only.

## Evidence

`tests/command-history.test.mjs` selects source/emitted modules and proves:

- A global bound across rooms/modes follows commit order even when the injected clock moves backward. Evicted envelopes leave exact receipt replay, payload conflicts and checkpoints intact, including an empty retained window after restart.
- A synthetic DELETE failure rolls back legacy writes, new state/revision/receipt and history together; retry succeeds once the failure is removed.
- Invalid limits cannot initialize a database.
- Seven synthetic Party players resolve a round, evict that envelope and recover through a newly constructed service. Replaying the earlier resolution returns identical saved outcomes with no additional dice or publication, even after stage/revision changes and recovery pause.
- A real isolated source/emitted game-server process accepts a roll, stops, then restarts after its owned fixture adds more than 5,000 synthetic envelopes. Startup bounds the journal and evicts the roll's envelope. The original request still returns the exact stored response, changed payload conflicts, and checkpoint revision/rolls remain unchanged.

All connections, files and loopback children belong to synthetic fixtures with blocked providers. Existing authorization/projection and duplicate/restart suites remain required; this check does not establish physical crash/power-loss recovery, corruption handling, a complete audit archive or product backup/restore.
