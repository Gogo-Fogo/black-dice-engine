# Core Architecture

Black Dice Engine should be a local-first web system coordinated by one game server.

Phones, the GM dashboard, AI services, databases, and media engines should not talk to each other in a tangled mesh. The dashboard and phones talk to the local game server; the game server coordinates everything else.

## Primary Flow

```text
GM dashboard / player phones
-> local game server
-> dice/state/memory/AI/media services
-> database and asset folders
-> WebSocket updates back to clients
```

## Runtime Roles

- `GM Dashboard`: main screen for narration, scene control, party state, image/video/audio queues, hidden notes, and GM approvals.
- `Player Companion`: phone-first sheet/controller for HP, stats, inventory, rolls, current scene, handouts, and submitted actions.
- `Game Server`: session coordinator and single API boundary for clients.
- `Runtime Service`: health checks, resource status, reconnect state, backups, and recoverable error reporting.
- `Dice Service`: deterministic roll parsing and roll history.
- `State Service`: authoritative state-event validation and application.
- `Memory Service`: campaign bible, scene summaries, lore retrieval, and canon updates.
- `Dice Presentation Adapter`: optional 3D dice renderer such as dddice; never the sole source of roll truth.
- `Comfy Router`: asynchronous image/video job routing to local ComfyUI workflows.
- `Audio Service`: local music, ambience loop, and stinger playback control.
- `Import Service`: private/local ingestion of open material, user notes, and user-owned documents.

## AI Roles

- `ChatGPT / GPT Director Mode`: optional high-intelligence director for prep, hard rulings, major scene planning, memory canonization, and complex narrative choices.
- `Local LLM`: fast live narrator, offline fallback, style pass, lore consistency helper, and lower-cost summarizer.
- `Deterministic Validator`: rules/state/permissions checker. This is not an LLM-first responsibility.
- `Human GM`: final authority over major reveals, irreversible state changes, table tone, and private content.

## Tool Boundary

The LLM can propose:

- narration
- dice calls
- state changes
- memory updates
- image/video prompts
- audio mood cues
- reveal suggestions

The game server validates and applies:

- HP/resource changes
- inventory
- gold
- conditions
- initiative
- quest flags
- faction standing
- visibility rules

Optional presentation adapters display:

- 3D dice animations
- roll sounds/effects
- branded dice themes

They do not replace the local dice service, roll history, or state-event audit trail.

The primary player surface is the mobile web companion. Discord is deferred as an optional bridge, not a replacement for the first player app.

The runtime layer validates operational safety:

- whether a subsystem is available
- whether a heavy media job should run now or queue
- whether a client is connected, reconnecting, or stale
- whether a failure should degrade gracefully or block an action

## Local-First Default

Default development should assume:

- Windows host PC.
- Local database.
- Local WebSocket server.
- Local assets.
- Local ComfyUI.
- Local model endpoints where configured.
- Local backup/export path.
- QR-code LAN join flow for player phones.
- Optional cloud/director calls only when explicitly enabled.

## Cloud Later

Vercel and Supabase may be useful later for portfolio demos, remote companion experiments, hosted auth, or sync. They are not core runtime requirements for the first build because the GPU, database, media pipeline, and private assets live on the local PC.
