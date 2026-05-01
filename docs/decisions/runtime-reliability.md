# Runtime Reliability

Black Dice Engine should fail softly during a live session. A missing model, stalled image job, dropped phone connection, or ComfyUI error should not freeze the table.

## Reliability Principles

- Keep the live turn loop independent from slow or fragile services.
- Show system status clearly in the GM dashboard.
- Prefer degraded modes over hard failures.
- Persist state changes before broadcasting them.
- Make reconnection normal, not exceptional.
- Keep backup, restore, and export workflows boring and visible.

## Resource Governor

The runtime should track local pressure before launching expensive work.

Track:

- active local text model
- model context size
- ComfyUI busy/idle status
- image/video/audio job queue depth
- GPU/VRAM mode where available
- disk free space for assets and temp outputs
- current runtime mode: `fast`, `scene`, `cinematic`, `prep`, or `offline`

Rules:

- Do not start video jobs during combat fast path.
- Do not start generated audio jobs during live turns.
- Do not run multiple heavy media jobs at once by default.
- Prefer queued/background jobs when resource pressure is unknown.
- Warn the GM before a requested action may slow the session.

## Connection Resilience

Player companion clients should expect Wi-Fi drops, phone sleep, page reloads, and browser tab switching.

Minimum behavior:

- visible connection status
- heartbeat/ping tracking
- reconnect attempt with backoff
- session resume by client id and player id
- stale client cleanup
- no duplicate state events on reconnect

Player actions should be idempotent where possible. If a roll or state event was already accepted, a repeated client message should return the existing result instead of creating a second event.

## Backups And Rollback

The database should support session safety before it supports fancy features.

Minimum behavior:

- manual backup before major sessions
- automatic backup at session start
- automatic backup at session end
- export session summary to Markdown
- keep backup manifests with source database, timestamp, version, and notes
- never store backups inside Git

State events should make rollback and replay possible. Direct mutation of hard-truth state should be avoided outside migration scripts.

## Roles And Permissions

Roles should be explicit even on LAN.

- `gm`: full session control, private notes, approval, reveal, backup/export
- `player`: own sheet, own private notes, public scene, allowed rolls/actions
- `spectator`: read-only public scene and public rolls
- `ai`: can propose narration, state changes, media jobs, memories, and audio cues; cannot apply hard state directly
- `admin`: local runtime setup and dangerous maintenance actions

Every outbound message should pass visibility checks before reaching a client, prompt, export, or media workflow.

## Error UX

Errors should tell the GM what failed and what still works.

Examples:

- LLM unavailable: keep dice/state/player sheets running and offer manual narration.
- ComfyUI unavailable: keep text flow running and queue or skip images.
- Audio unavailable: continue silently and show the failed cue.
- Phone disconnected: keep session running and mark that player as reconnecting.
- Disk low: pause new media jobs and recommend cleanup.

Do not expose stack traces to player clients. Keep detailed errors in local logs with redaction for secrets and private source content.

## First Implementation Target

For the first playable runtime, implement:

- `/health` endpoint
- runtime status object
- WebSocket heartbeat
- client reconnect status
- error event log
- manual session backup placeholder
- dashboard status strip

That is enough to make failures visible before building heavier AI/media integrations.
