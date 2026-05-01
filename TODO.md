# Development Milestones And TODO

This file is the working build plan for Black Dice Engine. It should stay practical: short enough to scan, specific enough to turn into GitHub issues later.

## Current Focus

Get the private GitHub repository published, keep the scaffold clean, and turn the planning work into a small first playable loop.

## Immediate TODO

- [ ] Publish the repository to GitHub as private.
- [ ] Consider renaming the default branch from `master` to `main` before heavy collaboration starts.
- [ ] Confirm `_local-context/`, secrets, generated assets, model files, and real campaign data are ignored.
- [ ] Decide the first app stack: likely TypeScript with either Vite or Next.js.
- [ ] Decide the first service stack: likely Node.js/TypeScript first, Python only where it clearly helps.
- [ ] Convert these TODO items into GitHub issues after publishing.
- [ ] Create GitHub milestones for repo foundation, runtime spike, playable LAN MVP, and media integration.

## Large Milestones

### Milestone 0.1: Repository Foundation

Goal: make the repo safe, understandable, and GitHub-ready.

- [x] Create initial scaffold.
- [x] Add README, license, ignore rules, Codex instructions, docs, schemas, prompts, and sample campaign content.
- [x] Add private-context workflow and distilled project decisions.
- [x] Add rule requiring thorough GitHub descriptions.
- [ ] Publish private GitHub repository.
- [ ] Add GitHub repo description and topics.
- [ ] Create first GitHub project board or issue list.

### Milestone 0.2: Data Contracts And Campaign Design

Goal: define the structured language the apps, services, AI prompts, and database will share.

- [ ] Review and tighten all JSON schemas.
- [ ] Add examples for scene packets, state events, media jobs, memory entries, characters, and campaign bible files.
- [ ] Draft the first SQLite schema proposal.
- [ ] Define state-event validation rules for HP, resources, inventory, conditions, rolls, and visibility.
- [ ] Define player-visible, GM-only, and public/demo-safe content boundaries.
- [ ] Add a sample character-creation intake packet.
- [ ] Add a sample session packet for the sample campaign.

### Milestone 0.3: Local Runtime Spike

Goal: prove that a local game server can coordinate state and live updates.

- [ ] Add minimal game server scaffold.
- [ ] Add health check endpoint.
- [ ] Add WebSocket broadcast prototype.
- [ ] Add dice roller endpoint/service.
- [ ] Add state-event validation prototype.
- [ ] Add in-memory session state before introducing persistent SQLite writes.
- [ ] Add basic test coverage for schemas and state events.
- [ ] Add local dev scripts after the stack is chosen.

### Milestone 0.4: Playable LAN MVP

Goal: let the GM and three players use the system together on the same network.

- [ ] Create GM dashboard shell.
- [ ] Create player companion shell.
- [ ] Add phone-friendly character sheet view.
- [ ] Add player roll submission.
- [ ] Add GM roll log and state event approval view.
- [ ] Add HP, AC, inventory, conditions, notes, and resource tracking.
- [ ] Add WebSocket updates between dashboard and player phones.
- [ ] Test over LAN using at least one phone.
- [ ] Export a session summary to Markdown.

### Milestone 0.5: AI Narration And Memory Loop

Goal: make AI output structured, reviewable, and grounded in campaign state.

- [ ] Add scene-packet request/response flow.
- [ ] Add GM approval for risky state changes.
- [ ] Add memory-entry creation after scenes.
- [ ] Add campaign bible and active-scene context injection.
- [ ] Add local model adapter placeholder.
- [ ] Add optional ChatGPT/director-mode adapter placeholder.
- [ ] Add logging for AI input packets, output packets, tool calls, and validation failures.

### Milestone 0.6: Local Media Pipeline

Goal: route scene images through local ComfyUI without blocking gameplay.

- [ ] Add media job queue model.
- [ ] Add ComfyUI router service scaffold.
- [ ] Add workflow registry format.
- [ ] Add image prompt templates for scenes, portraits, items, and locations.
- [ ] Store generated media metadata in state while keeping actual files outside Git.
- [ ] Add async image job status updates to GM dashboard.
- [ ] Add cleanup policy for drafts, temp frames, failed jobs, and final assets.

### Milestone 0.7: Local Audio Pipeline

Goal: add music, ambience, and stingers without slowing live play.

- [ ] Add audio cue schema examples.
- [ ] Add local audio library path configuration.
- [ ] Add tagged audio asset metadata for music, ambience, and stingers.
- [ ] Add audio service scaffold.
- [ ] Add GM dashboard controls for play, pause, mute, fade, and override.
- [ ] Trigger ambience/music loops on scene start and scene change.
- [ ] Trigger one-shot stingers from reveals, traps, critical hits, and combat transitions.
- [ ] Keep generated or licensed audio files outside Git.
- [ ] Treat AI-generated audio as queued/prep-time content, not live per-turn generation.

### Milestone 1.0: First Portfolio Demo

Goal: demonstrate a complete safe sample session without private or copyrighted content.

- [ ] Build a guided demo using only the sample campaign.
- [ ] Include GM dashboard, player companion, dice/state updates, memory entry, and async image job placeholder or local ComfyUI call.
- [ ] Add screenshots or screen recordings that do not reveal private material.
- [ ] Add setup guide for a clean Windows machine.
- [ ] Add security notes for LAN use and optional remote access.
- [ ] Add a polished portfolio demo plan and README walkthrough.

## Long-Term Milestones

- [ ] Add persistent SQLite migrations.
- [ ] Add vector memory or retrieval layer for lore, rules, and session summaries.
- [ ] Add import service for user-owned notes, Markdown, and PDFs with source/license tracking.
- [ ] Add SillyTavern, Ollama, KoboldCpp, and ComfyUI integration adapters where useful.
- [ ] Add short cinematic video jobs as queued special events.
- [ ] Add AI-assisted music/ambience generation for prepared or queued scenes.
- [ ] Add Tailscale-friendly remote play guidance.
- [ ] Add backup, restore, export, and archive tools.
- [ ] Add stronger permissions for GM, player, spectator, and AI roles.
- [ ] Add campaign pacing, quest graph, reveal manager, and faction-state tooling.
- [ ] Add GitHub Actions checks once there is real code to test.

## Deferred For Later

- Native iOS or Android apps.
- Unity or 3D game client.
- Public cloud hosting as the core runtime.
- Supabase as a required backend.
- Vercel as the live local AI runtime.
- Custom model training.
- Full video-first gameplay.
- Paid/copyrighted module distribution.
- Public sharing of real campaign databases or private generated assets.
