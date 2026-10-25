# Local session access

The game server now issues local bearer capabilities. These are room memberships, not cloud accounts. Keep the server on loopback until intentionally enabling LAN access. Local HTTP/WS is unencrypted: use a trusted table network; this slice does not add TLS or public hosting.

## Host setup and recovery

Build with `npm run build`, then run `npm --workspace services/game-server start`. Built browser surfaces are served at `/host/` and `/player/` on that server. The host dashboard uses a relative Vite base so it also works beneath `/host/`. The existing development proxies remain available.

On the first start, the server creates a random room code and writes the separate host key beside the configured SQLite file, with the suffix `.host.key`. With default paths, that is `_data/black-dice-engine.db.host.key`. This file is ignored by Git's `*.key` rule. Enter its contents in the host access form on the host device. Never send it to players, put it in a URL, share it in a screenshot, or commit it. The server requests owner-only file mode; on Windows, restrict the data folder using normal user permissions as appropriate for the host machine.

The key file belongs only to this runtime. Startup does not search private environment files. A normal restart keeps the existing host key and active memberships. If the key is lost, stop the owned server and explicitly start once with `BDE_RECOVER_HOST=1`: this revokes previous host credentials and writes a replacement key while retaining valid player memberships. Unset the recovery flag afterward to avoid rotating on every restart. No key is printed to the console.

Existing campaign sheets are preserved. Old prototype client IDs are not authenticated credentials: players must join and claim again. First creation of a room, or replacement of an expired room on restart, releases old claims without deleting sheets.

## Player and display lifecycle

- The host's room code admits at most seven player memberships. Names must be unique after case-insensitive normalization, 1–24 visible characters. A host who wants to play joins separately as an ordinary player.
- `POST /api/session/join` accepts `{code,label}` and returns the server-issued identity and opaque token. The browser stores it in tab-scoped session storage; refresh resumes, while a separate new tab normally joins separately. Storage-unavailable sessions work in memory until reload.
- Authenticated `GET /api/session/me` or `POST /api/session/resume` returns the same identity. Losing a credential requires joining again; the host can revoke the abandoned membership to free a seat.
- Host-only `POST /api/session/display` issues a spectator credential. It is read-only and cannot claim, roll, approve, or mint host/player authority. The dedicated `/display/` screen accepts this key through its own gate; see [Party surfaces](party-ui.md).
- Host-only `POST /api/session/revoke` accepts `{actorId}`. It invalidates that capability, releases its claimed character, and closes its sockets. It cannot revoke the calling host itself.
- Host-only `POST /api/session/new-room` creates a new room ID, code and host credential, invalidates all old memberships and releases claims. Durable receipts and Party state remain private history under the old room ID; the new room starts in a fresh lobby. Campaign sheets are retained.
- Rooms expire eight hours after creation. Requests then fail with a safe rejoin/restart instruction. A restart creates a fresh room if the previous one expired. Tests inject time to verify expiry without waiting eight hours.

## Transport and visibility

HTTP uses `Authorization: Bearer <token>`. Browser WebSockets use subprotocols `bde.session` and `bde.auth.<token>`, rather than URL credentials. The selected protocol is `bde.session`; the server never echoes the auth protocol. Role headers, role queries, client IDs and IP addresses grant no authority. Sockets recheck membership on incoming messages and every broadcast, so revocation/expiry also stops continued delivery.

Host, per-player and spectator projections run before serialization for REST snapshots, initial/reconnected sockets, broadcasts and player/public exports. Non-hosts cannot fetch approval queues, campaign context, AI logs, pending narration, raw image inventories or arbitrary new host endpoints. Own character inventory/resources/notes are visible to the claiming player; other players' sheets omit them. Unknown fields are private by default. Public exports neither write files nor expose export paths. Raw legacy image serving is host-only pending approved asset delivery.

Both apps use the explicit shared `apps/session-client.tsx` helper. It adds credentials only to same-origin `/api/` calls, handles expiry, and supplies WebSocket protocols. It never patches `window.fetch` or forwards the local key to an external audio endpoint. Larger workspace/package extraction remains in PLAN.

## Verification and limits

`npm test` uses disposable SQLite/export paths and blocked outgoing provider calls. Tests inspect actual HTTP bodies and WebSocket frames for forged roles, ownership, hidden markers, unauthenticated sockets, display denial, revocation, restart and new-room isolation. Unit tests check expiry, host recovery, token hashes and unknown-field projection.

Covered commands use [durable receipts and atomic acknowledgements](command-protocol.md). The [Party server loop](party-mode-api.md) adds phase validation, private choices and four actual process-restart recovery phases. The [Party UI](party-ui.md) adds separate host/display/player screens and pending-request recovery. Protocol tests do not establish rendered UI behavior: local browser use is disabled in Work settings. Physical phone and TV rehearsal remains outstanding.

For a source rollback, retain this repository's earlier revision and a disposable verification database snapshot. Do not reopen a live database with older code or expose legacy role-based auth on LAN. No real campaign migration/restore was performed; those operations require separate review under AGENTS.md.
