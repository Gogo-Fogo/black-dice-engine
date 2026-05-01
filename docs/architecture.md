# Architecture

Black Dice Engine is planned as a local-first tabletop RPG command center. A Windows host machine runs the GM dashboard, local services, model adapters, and media routing. Player devices connect to limited companion views over the local network.

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

## Repository Boundary

This repo contains code, docs, schemas, config examples, prompts, and demo content. It does not contain real campaign data, local model files, generated media, private PDFs, or secrets.
