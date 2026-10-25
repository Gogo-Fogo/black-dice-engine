# Architecture

Black Dice Engine is planned as a local-first tabletop RPG command center. A Windows host machine runs the GM dashboard, local services, model adapters, and media routing. Player devices connect to limited companion views over the local network.

## Implemented overhaul boundaries

Party Mode now runs as a prepared, deterministic five-round game inside the coordinating game-server process. Server modules own configuration, local capability-based sessions, audience projections, durable command commits and Party rules/recovery. Separate host/TV/phone views default to Party Mode; TTRPG views load on explicit mode selection. The [Party launcher](party-launch.md) serves built assets with AI/media/audio disabled. Rendered/physical acceptance remains open; see [progress evidence](overhaul-progress.md).

The [contracts workspace](../packages/contracts/README.md) supplies browser-safe Party/session/command data and runtime guards to both apps and the server. It does not import the server or own rules, database access, authentication or visibility decisions. [Runtime configuration](../packages/runtime-config/README.md) is a separate Node-only package used by four services, with no I/O or implicit environment-file loading. `packages/shared-schemas` remains a schema collection with stable IDs, not an npm workspace. Participating workspaces are these two packages, two apps and four Node services; dice/state/memory/import directories still describe planned responsibilities.

The [game store](game-store.md) now opens explicitly at server startup. Its import-safe module accepts a caller-owned connection for isolated repository checks; authority, receipts and legacy rows retain one SQLite transaction boundary. Default/configured paths and table formats are preserved.

The [versioned migration runner](schema-migrations.md) owns legacy and authority/command tables, adopts compatible unversioned layouts without rewriting rows, and atomically records additive versions with checksums. Startup refuses incompatible/future schemas before configuring WAL. The game-server online backup owner now creates checksummed snapshots from the open SQLite connection, validates integrity/schema read-only and supports disposable restore rehearsals. Runtime operations forward host credentials; automatic session scheduling and measured resource pressure remain open. See [backups](backups.md).

[Command metadata retention](command-history.md) bounds the private journal to 5,000 envelopes globally at startup/commit while preserving exact receipts and complete recovery checkpoints. Trimming joins the command transaction; it cannot turn an accepted retry into a new action. Recent UI logs and retained envelopes are explicitly incomplete history; total database size is not bounded by this metadata policy.

[Table read routes and pure host summary formatting](server-refactor.md) now have focused owners. The compact GET roll response remains compatible after removal of its unreachable duplicate; full records still come from projected snapshots/frames. Existing session access/projection middleware precedes the installer, and non-host summaries never enter the private host file-export path. Further entrypoint extraction remains ENGINE-01 work.

The same [server extraction](server-refactor.md#state-event-application-and-approval-routes) separates state event application/summarization from approval HTTP routes. The owner uses current-character, record and publish hooks; existing middleware still owns validation/authority and atomic capture/restore/deferred effects. A shared event guard rejects malformed queued data before application. Roll/control routes, context/capabilities and socket delivery remain in the entrypoint.

[Character creation and claim/release routes](server-refactor.md#character-creation-claims-and-release) also use focused installers at their original registration positions, sharing the existing party and record/publish/persist hooks. Identity normalization, revision checks, exact replay and rollback stay in the existing middleware. Roll/control, context/capabilities and socket extraction remain open.

The [server lifecycle owner](server-lifecycle.md) supplies injected time/service requests and owns the four intervals, cancellation and bounded HTTP/WebSocket shutdown before final persistence. Pure TTRPG dice now accept injected die outcomes; authoritative outcomes continue through the existing durable command boundary.

## Maintenance review after the Party slice

| Observed hotspot | Candidate interface and caller benefit | Ownership/testing tradeoff and order |
| --- | --- | --- |
| Party shapes/validation duplicated in the former `apps/party-contract.ts` and server modules; identity duplicated in the session gate | One browser-safe contracts entrypoint, with shared guards/types for producer and receivers | First extraction, now implemented. Keep transitions and projection values server-owned; corruption/receipt/recovery tests exercise the same guards. Keep SQLite/prompts outside the package. |
| Shared browser connection/command modules already serve both apps, but remain loose files under `apps/` | Client helper package once complete ownership/dependencies are clear | Existing seams have meaningful tests. Packaging alone is lower priority than conflicting contracts. Keep React lifecycle separate from pure connection ownership. |
| Large TTRPG `App.tsx` files mix panels, connection effects, dice and optional capabilities | Focused model/transport/presentation modules used by a small shell | Reduce caller state/effect complexity while preserving claim/roll/audio ownership. Avoid splitting solely by file size; rendered verification is still required. |
| Server `index.ts` retains TTRPG routes, mutable collections and optional asynchronous effects | Mode-specific routes/rules behind durable commands/projections | Higher compatibility risk than pure contracts. Preserve middleware/route order, transaction-before-broadcast and errors; rehearse TTRPG after each move. |
| Game-server configuration is centralized, but other services derive paths/settings independently | Validated service configuration and startup resource lookup | Keep database/default paths stable and audit initialization before imports. Do not combine extraction with a data move or real service/model startup. |

Selected sequence: shared contracts, then focused client/TTRPG/server extractions based on observed responsibilities. Build, source/built protocol and launcher tests constrain each move. Protocol/schema unification, the mode interface and panel extraction remain PLAN tasks. The browser setting currently prevents rendered inspection, so builds cannot establish the complete frontend gate.

## Design Goals

- Keep private campaign data local by default.
- Separate narrative generation from deterministic state changes.
- Make AI output structured, validated, and auditable.
- Keep player-visible data separate from GM-only notes.
- Keep models, generated assets, private PDFs, and real campaign databases outside Git.

## Planned Components

### GM Dashboard

The GM dashboard is the main control surface for scene framing, table state, narration requests, image/video requests, dice logs, and memory review.

### Player Companion

The player companion is a phone/tablet interface for character sheets, status, dice rolls, private notes, and player-visible scene data.

### Game Server

The game server coordinates sessions, WebSocket connections, permissions, and service calls.

### Runtime Service

The runtime service tracks health, resource pressure, reconnect state, backup status, and recoverable errors so the table can keep playing when optional subsystems fail.

### Dice Service

The dice service owns roll parsing, randomization, roll history, and roll visibility.

### State Service

The state service owns deterministic state events. AI may propose state changes, but validated events should be applied through explicit rules.

### Memory Service

The memory service stores and retrieves canon, summaries, unresolved threads, NPC facts, locations, faction state, and session history.

### Comfy Router

The Comfy router translates approved scene generation requests into local ComfyUI workflow calls.

### Audio Service

The audio service controls local music, ambience, and stingers. It should use cached/local files first, keep playback under GM control, and avoid blocking narration or state updates.

### Import Service

The import service will handle user-owned notes and campaign material. It must preserve privacy boundaries and never assume imported content is safe to commit.

## Data Flow

1. The GM creates or updates a scene in the dashboard.
2. The game server gathers current state, relevant memory, active characters, and safety/content settings.
3. Prompt templates request structured AI output.
4. Output is validated against shared schemas.
5. State changes are applied as explicit events.
6. Player-visible updates are broadcast to companion clients.
7. Optional image/video requests are routed through ComfyUI after GM approval.
8. Optional audio cues start loops, crossfade moods, or play one-shot stingers from the local audio library.
9. Runtime status, reconnect state, and recoverable errors are broadcast to the GM dashboard.

## Repository Boundary

This repo contains code, docs, schemas, config examples, prompts, and demo content. It does not contain real campaign data, local model files, generated media, private PDFs, or secrets.

Action controls and roll routes are installed through `ttrpg-action-routes.ts` with live control accessors, explicit collections and the existing command deferral/persistence hooks. [Boundaries and rollback proof](server-refactor.md#action-controls-and-rolls) describe the extraction; optional orchestration inside the installer still needs CAP-02/05 consolidation.

Automatic narration and host local-model drafts share an injected, bounded presentation owner. [Narration scope](narration.md) documents ten-second deadlines, current session/mode/round/stage/revision checks, prepared fallback, cancellation and generic stale-draft errors. Optional media/speech orchestration remains separate CAP-05 work.

Optional service status now uses the injected [capability health owner](capability-health.md), with explicit profile/configuration flags, bounded read-only observations and stale evidence expiry. The existing runtime timer refreshes it; host-only manual refresh cannot mutate the authoritative table revision. Player/display projections keep service details out.

Asset bytes now use authenticated [approved-record delivery](asset-delivery.md); raw external-directory serving/enumeration is removed. Host approval persists before publication, and player/display audiences remain filtered.

The game server owns [online backups](backups.md) at process startup/graceful shutdown and authenticated manual operations. Its extracted [diagnostic/resource owners](diagnostics.md) bound and redact operational records, tolerate export failure, and measure memory/event-loop pressure for optional admission. GPU capacity and physical network/browser latency require separate rehearsal.
