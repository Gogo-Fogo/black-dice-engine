# Roadmap

Black Dice Engine is currently an early scaffold. This roadmap is directional and should evolve as prototypes teach us what is actually useful at the table.

## Phase 0: Repository Foundation

- Create project scaffold.
- Define docs, schemas, prompts, and demo-safe sample content.
- Establish privacy and content boundaries.
- Keep all heavy/private data outside Git.

## Phase 1: Local Runtime Spike

- Add minimal game server.
- Add dice service prototype.
- Add state event validation.
- Add basic WebSocket session updates.
- Add local development scripts.

## Phase 2: GM Dashboard Prototype

- Build scene control view.
- Add roll log and table state panes.
- Add AI narration request flow.
- Validate AI responses against schemas.
- Add manual GM approval before applying major state changes.

## Phase 3: Player Companion Prototype

- Add player character sheet views.
- Add player roll submission.
- Add visibility controls for GM-only and player-visible data.
- Test on phones over LAN.

## Phase 4: Campaign Memory

- Add campaign bible storage.
- Add session summary capture.
- Add memory canonizer workflow.
- Add retrieval for NPCs, locations, factions, and unresolved plot threads.

## Phase 5: Local Media Pipeline

- Add ComfyUI router service.
- Add local audio service design for music, ambience, and stingers.
- Add workflow registry.
- Add prompt templates for scenes, portraits, props, and locations.
- Store generated outputs outside the repo.

## Phase 6: Demo And Hardening

- Build portfolio demo mode using sample campaign content only.
- Add tests around schemas and state events.
- Add backup/export guidance.
- Review security posture for local network usage.
