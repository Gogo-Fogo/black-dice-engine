# Companion module ownership

The existing player entry still selects Party by default and lazy-loads the TTRPG shell for `?mode=ttrpg`. `apps/session-client.tsx` owns credential join/resume/expiry and explicit authenticated requests for both modes. Credentials remain outside URLs. No character is automatically claimed after joining or reconnecting.

`apps/player-companion/src/App.tsx` composes the TTRPG view. Under `src/ttrpg/`:

| Module | Responsibility |
| --- | --- |
| `usePlayerTable.ts` | React lifecycle, explicit HTTP transport, refresh, connection status and command feedback |
| `model.ts` | Validated room/revision snapshots, latest ownership and bounded receipt/socket roll presentation deduplication |
| `commands.ts` | Claim/release/roll bodies, receipt identity validation and member/room-scoped pending requests |
| `CharacterPicker.tsx` | Explicit claim/release controls and authenticated seat label |
| `CharacterSheet.tsx` | Own projected HP, AC, initiative, conditions, resources, inventory, notes and advanced abilities |
| `RollControls.tsx` | GM action and optional custom roll form; authority stays in the server |
| `TableFeed.tsx` | Projected table roll and memory rendering |
| `DicePresentation.tsx` | Optional cosmetic animation, user-initiated audio/motion, saved result, focus and cleanup |
| `PresentationBoundary.tsx` | Optional chunk/render failure fallback that preserves the saved sheet/result |

`apps/live-connection.mts` owns the single socket, heartbeat, bounded reconnect and stale-callback/cleanup guards. Party and TTRPG provide their own frame decoders. `apps/command-queue.mts` owns persist-before-send, single-flight retry and ambiguity retention; each mode validates its own restored commands and receipts. `.mts` makes these shared browser helpers explicit ESM for Node/tsx as well as Vite. Only the no-emit app TypeScript configurations enable source-extension imports; service emission settings are unchanged.

The TTRPG queue persists the complete pending action under `bde-table-pending-<room>-<member>`. Network failures, unreadable/unverified replies, 408, 429 and server errors retain the same body/request ID. Valid receipts clear it so a later identical intentional action gets a fresh ID. Definitive readable client errors clear the rejected request. Storage failure is visible and retains only the current in-memory request. The previous unscoped fingerprint-only storage is not reused or deleted: it cannot establish a room, member or complete payload safely. When upgrading an already-open old companion with an uncertain action, resolve that action against the saved server state before using the new client.

The model reads current ownership rather than capturing the initial empty snapshot in a socket callback. Receipt and socket paths share a bounded roll-ID set, so one saved roll animates once. Older snapshot/receipt revisions cannot replace newer saved state. Reconnect snapshots restore state without replaying historical animations. Server projections continue to remove other players' private sheet content before delivery; React filtering does not establish privacy.

Three.js loads only when presenting a live own roll; there is no module-import preload. The numeric result is the saved server total and remains visible if WebGL, audio, motion permission or chunk loading fails. Audio starts on tap or explicitly enabled shake, and its timer/source is stopped on unmount. Motion permission is requested from a button; late permission/model completion is guarded after disposal. Both apps now use the [shared dice renderer and audio](shared-dice-presentation.md), with exclusively owned model resources and idempotent disposal instead of a module-global model cache.

Verification uses static React markup, pure connection/model/queue tests and disposable loopback server claim/roll/lost-reply/restart/replay/release tests. Built route/asset tests remain in the full suite. These checks do not verify rendered phone layouts, real WebGL, audio unlock, motion, focus behavior, device sleep or QR scanning. Local browser use is disabled in Work settings; UX-02–06/09 and physical rehearsal gates remain open.

Character artwork update: the TTRPG shell now has Play, Sheet, Table and Lore navigation adapted from upstream a94ed19. Shared app TS/TSX sources have explicit ESM scope through apps/package.json. Sheet supports reference uploads; Table shows approved party portraits and shared campaign art. A disposable browser check at 390px verified upload, GM approval, live owner update and loaded approved images for a second player. Real-device/WebGL/audio/motion checks remain separate. See [character artwork](character-artwork.md).
