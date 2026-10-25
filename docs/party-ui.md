# Party host, TV and phone surfaces

The two existing Vite apps now default to Party Mode. Protocol, client-lifecycle and static React markup tests cover these implemented surfaces. An isolated browser check now verifies the 1920×1080 public display with seven saved results and its QR/room-code panel visible without scrolling; the phone join form was inspected at 390×844. TV styles also isolate cards from legacy dashboard flex rules. Physical phones, HDMI/extended-display operation, TV scaling, remote tunnel delivery and pacing have not been verified.

Use the [lightweight Party launcher](party-launch.md) to build and serve these surfaces with optional services disabled and a separate Party database. The older full-stack launcher is not needed.

| Surface | Built server URL | Credential |
| --- | --- | --- |
| Private host | `/host/` | Local `.host.key` |
| Public TV | `/display/` | Separate read-only display key |
| Party phone | `/player/?mode=party` | Room code and unique display name |
| Preserved TTRPG host | `/host/?mode=ttrpg` | Host key |
| Preserved TTRPG phone | `/player/?mode=ttrpg` | Player membership |

The TV gate rejects host/player credentials and never mounts the GM dashboard or hides private panels with CSS. Host/display gates use different session-storage keys. Credentials stay in headers/WebSocket protocols, never URLs. `/api/session/join-info` gives host/display the public room code and actual listening address; player access is denied. Loopback-only hosting is labeled local-only. TTRPG QR links explicitly retain TTRPG mode.

For Vite development, open `/?view=display` on the dashboard origin for the public view. The existing `/api` and `/ws` proxies remain. Built routes require neither Vite nor a CDN.

## Host and TV setup

1. Open `/host/` and enter the local key. The host can join through a separate normal player tab without consuming a GM seat.
2. Create a read-only display key. Copy it into the separately opened `/display/` screen. New-window links use `noopener`; they contain no key.
3. Use an **extended display**, move only the public window to the TV and use full screen. Keep host controls private. Mirror mode duplicates a window: opening private controls while mirroring can expose them. Software cannot verify this physical arrangement.
4. Show the locally generated QR plus printed fallback address/code. Phones must reach the host on the intended LAN; loopback is local testing only.
5. Start with six or seven ready players. Open choices, lock/reveal/resolve, show summary and advance to ending. Pause/resume, 30-second extension and force-lock are available in legal phases. Skip and new-room operations require separate confirmation checkboxes.

A new room disconnects all members and rotates the local host key, preserving old results. If its reply is lost or browser storage is unavailable, reopen access using the current `.host.key`; do not create repeated rooms to guess whether the first request worked. No cloud account or third display app was added.

## Phone flow and recovery

Scan the QR or open the address, enter a name, join the game and mark ready. Choose from labeled radio cards, save, receive acknowledgement and optionally update until lock. The phone shows its own accepted choice; public views wait for reveal. Missing/late submissions pass. Results use recorded server dice.

The shared connection owns one socket, heartbeat and reconnect timer. Focus/online/visibility events refresh state; silent sockets are replaced. Old callbacks and revisions cannot overwrite newer state. Revocation returns to the join gate. Saved sessions can be retried after a failed startup without creating another seat.

Commands save action, ID and metadata to room/member-scoped tab storage before sending. Timeout, unreadable reply and ambiguous server errors retain the pending command. **Confirm pending action** sends the exact body and checks the returned actor/room/kind/request ID/revision before clearing it. Definitive invalid/stale/denied errors clear it and refresh. New actions are disabled while pending. A storage warning explains when only in-memory recovery is available; keep the tab open until confirmation.

Countdowns are informative and never advance the game. The TV alternates the roster and compact revealed results; final scores/winners replace the last dice at the ending. These choices still need actual TV layout verification.

## Evidence and remaining checks

- Both apps compile/build. Initial Party scripts are about 253 KB (host/display) and 227 KB (phone); older TTRPG/Three.js code is lazy-loaded separately. Legacy chunk warnings remain.
- HTTP tests load all three built surfaces and script/style assets, verify correct Party/TTRPG join modes and the actual port. This does not prove rendering or QR scanning.
- Actual seven-client tests run the client queue through a lost response after server commit, storage restoration and replay without another effect/revision.
- Deterministic lifecycle tests cover socket/timer ownership, cleanup/remount, wake/reconnect, silent replacement and revocation.
- Static React markup checks separate TV/host/phone trees, selected saved choice, paused/disabled form, phase controls and default-disabled skip/new-room safeguards. These are not interactive browser, layout or accessibility-tree checks.

Keep UX-02–06 and UX-09 open until their rendered/physical requirements pass. Full Stage 3 and live-demo gates remain open.
