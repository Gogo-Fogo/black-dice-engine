# Party Mode server loop

The original [Midnight Bell rules](party-mode-rules.md) now run through the existing game server without AI, audio, images or additional dependencies. This is the authoritative server loop. The [host/TV/phone surfaces](party-ui.md) are implemented; interactive browser verification and physical rehearsal remain open.

## Access and commands

Join with the normal room-code endpoint to receive a player membership. Host participation uses a separate player credential, so a group of seven can include the host. Player labels come from authenticated membership; neither a body actor ID nor a role declaration selects another seat. Six or seven ready seats are required to start. Seat numbers never change. A seventh player entering an open round waits until the next round; that round's frozen participants stay fixed even if someone disconnects. A missing participant passes on deadline or force-lock. A revoked seat remains in game history and passes when absent; seat replacement within an active game is not implemented. Start a fresh room for a fresh roster.

`GET /api/party-game` returns the caller's projection. Send commands to `POST /api/party-game/:action` with a stable `requestId` and `_command` matching the [v1 schema](../packages/shared-schemas/party-command-v1.schema.json). Metadata must include the issued room/member, `mode: "party"`, current round ID and current stage. Round 0 is the lobby; rounds 1–5 are the game. Optional expected revision uses optimistic concurrency; omit it when independent players submit simultaneously to the same stage. Unknown metadata/payload fields are rejected. A stale stage/round returns 409 rather than applying a choice to another round.

| Action | Identity | Effect |
| --- | --- | --- |
| `enter` | Player | Take one of seven immutable seats, or return the existing seat |
| `ready` with boolean `ready` | Player | Set readiness before joining a round; active participation stays frozen |
| `start` | Host | Require six or seven ready seats; enter round-one briefing |
| `advance` | Host | Briefing → choosing; locked → reveal; reveal → resolve once; resolving → summary; summary → next briefing or ending |
| `choose` with `choice` | Active player | Save/replace mend, dare, guard or pass while choosing and before deadline |
| `lock` | Host | Freeze submitted choices and fill missing seats with pass |
| `skip` | Host | Lock an unresolved choosing round with pass for every active seat; never reroll |
| `pause` / `resume` | Host | Save remaining time and freeze play; resume deliberately |
| `extend` with integer `seconds` | Host | Add 1–300 seconds to an open deadline or paused remaining time |

The server opens a 60-second choice deadline. Final submission, deadline tick and force-lock all use the same reducer lock transition and durable store. Commands are synchronous through commit; a later trigger sees locked state and cannot lock/resolve it again. Only the server can issue an automatic deadline command. New-room uses the existing authenticated `/api/session/new-room` lifecycle, invalidating old credentials and leaving the previous recovery record intact.

## Privacy and durability

Snapshots expose version, room, mode, revision, round/stage, roster/score, frozen participant IDs, aggregate submitted count, deadline/pause status, prepared scene and revealed history/results. Before reveal, `choices` and `outcomes` are empty for every viewer, including the host. A player's `ownChoice` contains only that player's accepted choice. Host/display `ownChoice` is always null. Revealed choices are public from the reveal stage onwards. No per-player submitted flags or individual choice events are published before reveal. There are no secret roles, objectives or free-form actions in this version; they are follow-up scope.

REST, initial socket/reconnect and `party_snapshot` broadcasts use the same projection. Roster/outcome/history fields are allowlisted. The service never broadcasts raw reducer state or journal receipts. Existing TTRPG routes remain available; Party requests do not import campaign material or call optional adapters.

Each accepted transition commits the full Party state, revision, response receipt and phase event in one SQLite transaction. A failed write publishes nothing; retry the same ID after checking storage. The immutable reducer's uncommitted candidate is discarded. Resolution records all d6 outcomes in ascending seat order once; a receipt replay returns those outcomes even after a restart, without invoking dice again. Scores/danger follow the prepared thresholds and clamp after each seat. All top-scoring players share the Clockkeeper title.

On process startup, any unfinished game outside the lobby is durably paused in its current phase. A choice deadline stops and its remaining duration is captured; expired deadlines resume with zero remaining unless the host extends first. Nothing advances through multiple phases in the background. Locked choices, revealed choices and resolved outcomes are retained. Host resume is required even when the recovered phase has no timer.

## Verification

The reducer/store tests cover complete five-round play, exact thresholds, danger bounds, ties, immutable seat order, private replacement, late arrival, pause/extend/deadline/pass, skip, forbidden roles, persistence failure, receipt conflict and no duplicate dice.

The API test connects seven independent phone WebSockets plus host and display. It finishes five rounds with concurrent submissions; inspects private/public payloads; crashes/relaunches during choosing, locked, reveal and resolving; checks deliberately paused recovery, exact outcome replay, score totals and fresh-room isolation. All child servers use disposable SQLite files and blocked outgoing fetches. This is a fast synthetic protocol rehearsal, not evidence of 20–30-minute pacing, actual phones, room Wi-Fi or TV readability.
