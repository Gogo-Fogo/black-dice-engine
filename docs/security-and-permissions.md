# Security And Permissions

Black Dice Engine is local-first, but local does not mean risk-free. Player devices, browser clients, imported files, and local services still need clear trust boundaries.

## Defaults

- Bind services to localhost during development.
- Expose LAN access only when needed for player devices.
- Keep secrets in local `.env` files, never in Git.
- Keep private campaign data outside this repository.
- Treat imported content as private unless marked demo-safe.

## Visibility Boundaries

Data should be labeled by audience:

- `gm_only`: hidden from players.
- `player_visible`: safe for current table participants.
- `public_demo`: safe for screenshots, portfolio demos, and repository samples.

## Permission Checks

Before sending data to a player client, generated prompt, media workflow, or export, services should check visibility and source labels.

## Roles

- `gm`: full session control, private notes, reveals, approvals, backup/export.
- `player`: own sheet, own private notes, public scene, submitted actions, allowed rolls.
- `spectator`: read-only public scene and public rolls.
- `ai`: proposed narration, state events, media jobs, memories, and audio cues only.
- `admin`: local runtime setup, dangerous maintenance, user/session management.

AI output should never bypass role and visibility checks.

## Dangerous Data

Never commit or expose:

- Secrets and API keys.
- Real campaign databases.
- Private notes.
- Paid PDFs or copied adventure text.
- Model checkpoints.
- Generated private images or videos.
- Player personal information.

## Implemented Local Session Boundary

The game server now issues host, player and read-only display capabilities; role declarations no longer authenticate a request. See [local session access](local-session-access.md) for joining, credential storage, resume/revoke/expiry, host recovery, projections, verification and remaining limits. The default bind is loopback. Tests cover actual response/frame filtering, not only UI visibility.

## Remaining Hardening

- Explicit host allowlist for LAN binding.
- Read-only demo mode.
- Redaction tools for logs and exports.
- Local backup and restore workflows.
- Review async/legacy adapter mutations outside the covered durable command boundary; synchronous table/Party commands already commit state/outcomes/receipts atomically.
- Player-safe error messages with private details kept in local logs.
