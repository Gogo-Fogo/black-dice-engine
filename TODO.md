# Development Milestones And TODO

This file is the working build plan for Black Dice Engine. It should stay practical: short enough to scan, specific enough to turn into GitHub issues later.

## Current Focus

Keep the private GitHub repository clean and turn the planning work into a small first playable loop.

The active Party Mode and project-wide overhaul sequence is in [PLAN.md](PLAN.md). Use its staged checkboxes for this work; retain the milestones below as the existing feature/history backlog and reconcile them as behavior is verified. Evidence is recorded in [docs/overhaul-progress.md](docs/overhaul-progress.md).

## Immediate TODO

- [x] Publish the repository to GitHub as private.
- [x] Rename the default branch from `master` to `main`.
- [x] Confirm `_local-context/`, secrets, generated assets, model files, and real campaign data are ignored.
- [ ] Set `docs/assets/branding/black-dice-engine-banner.png` as the GitHub social preview manually.
- [x] Decide the first app stack: `Vite + React + TypeScript`.
- [x] Decide the first service stack: `Node.js + TypeScript` first.
- [x] Decide the first package manager: `npm`.
- [x] Decide to start with one local server and split later if needed.
- [x] Review runtime reliability contracts before the first server implementation.
- [x] Review mobile web companion and QR join strategy before the first dashboard implementation.
- [ ] Convert these TODO items into GitHub issues.
- [ ] Create GitHub milestones for repo foundation, runtime spike, playable LAN MVP, and media integration.

## Large Milestones

### Milestone 0.1: Repository Foundation

Goal: make the repo safe, understandable, and GitHub-ready.

- [x] Create initial scaffold.
- [x] Add README, license, ignore rules, Codex instructions, docs, schemas, prompts, and sample campaign content.
- [x] Add private-context workflow and distilled project decisions.
- [x] Add rule requiring thorough GitHub descriptions.
- [x] Publish private GitHub repository.
- [x] Add GitHub repo description.
- [x] Add GitHub repo topics.
- [ ] Add GitHub social preview image from `docs/assets/branding/black-dice-engine-banner.png`.
- [ ] Create first GitHub project board or issue list.

### Milestone 0.2: Data Contracts And Campaign Design

Goal: define the structured language the apps, services, AI prompts, and database will share.

- [ ] Review and tighten all JSON schemas.
- [ ] Add examples for scene packets, state events, media jobs, memory entries, characters, and campaign bible files.
- [ ] Draft the first SQLite schema proposal.
- [ ] Define state-event validation rules for HP, resources, inventory, conditions, rolls, and visibility.
- [ ] Define player-visible, GM-only, and public/demo-safe content boundaries.
- [ ] Add examples for runtime status, client session, permission policy, backup manifest, and error events.
- [ ] Add dice roll schema/examples for local roll truth and optional dddice presentation.
- [ ] Add a sample character-creation intake packet.
- [ ] Add visual identity examples for accepted character reference assets and local generation history.
- [ ] Add a sample session packet for the sample campaign.

### Milestone 0.3: Local Runtime Spike

Goal: prove that a local game server can coordinate state and live updates.

- [x] Add minimal game server scaffold.
- [x] Add health check endpoint.
- [x] Add WebSocket broadcast prototype.
- [x] Add WebSocket heartbeat and reconnect status prototype.
- [x] Add dice roller endpoint/service.
- [x] Add AI adapter with Ollama and OpenAI support.
- [x] Wire AI narration generation into auto-narrate flow.
- [x] Add /api/ai/propose-action endpoint for AI scene proposals.
- [x] Add /api/director-mode/draft with real AI director guidance.
- [x] Add /api/local-model/draft with real AI narration.
- [x] Add state-event validation prototype.
- [x] Add runtime status prototype.
- [ ] Add player-safe error event prototype.
- [x] Add in-memory session state before introducing persistent SQLite writes.
- [ ] Add basic test coverage for schemas and state events.
- [x] Add local dev scripts after the stack is chosen.

### Milestone 0.4: Playable LAN MVP

Goal: let the GM and three players use the system together on the same network.

- [x] Create GM dashboard shell.
- [x] Create player companion shell.
- [x] Add phone-friendly character sheet view.
- [x] Add player roll submission.
- [x] Add GM roll log view.
- [x] Add recent table event history view.
- [x] Add state event approval view.
- [x] Add GM controls for HP, conditions, and resources.
- [x] Add HP, AC, inventory, conditions, notes, and resource tracking.
- [x] Add WebSocket updates between dashboard and player phones.
- [x] Add QR-code join panel to the GM dashboard.
- [x] Replace the prototype fixed PIN with server-issued local membership credentials (PLAN CORE-02–05; API/frame evidence in docs/overhaul-progress.md).
- [x] Add visible connected/reconnecting/disconnected status.
- [x] Add stale-client presence view for GM.
- [x] Make covered synchronous command handling durable and actor/payload scoped, with atomic state/outcome/revision receipts and restart replay (PLAN CORE-07–08; tests and limits in docs/command-protocol.md).
- [x] Test over LAN using at least one phone.
- [x] Export a session summary to Markdown.

### Milestone 0.5: AI Narration And Memory Loop

Goal: make AI output structured, reviewable, and grounded in campaign state.

- [x] Add scene-packet request/response flow.
- [x] Add GM approval for risky state changes.
- [x] Add memory-entry creation after scenes.
- [x] Add campaign bible and active-scene context injection.
- [x] Add local model adapter placeholder.
- [x] Add optional ChatGPT/director-mode adapter placeholder.
- [x] Add logging for AI input packets, output packets, tool calls, and validation failures.

### Milestone 0.6: Local Media Pipeline

Goal: route scene images through local ComfyUI without blocking gameplay.

- [x] Add media job queue model.
- [x] Add ComfyUI router service scaffold.
- [x] Add workflow registry format.
- [x] Add image prompt templates for scenes, portraits, items, and locations.
- [x] Store generated media metadata in state while keeping actual files outside Git.
- [x] Add async image job status updates to GM dashboard.
- [x] Add cleanup policy for drafts, temp frames, failed jobs, and final assets.
- [x] Add resource pressure checks before starting expensive media jobs.
- [x] Add character visual-canon job type for portrait variants, turnaround sheets, and accepted reference packs.
- [x] Add real ComfyUI workflow submission and polling via comfy-router.
- [x] Add auto-finalization of running media jobs when ComfyUI completes.
- [x] Wire local ComfyUI portable installation to comfy-router.
- [x] Switch scene and portrait workflows to SDXL Lightning (4-step, ~7GB) after NetaYume 9.89GB caused system freeze.
- [x] Download `sdxl_lightning_4step.safetensors` to ComfyUI checkpoints folder.

### Milestone 0.7: Local Audio Pipeline

Goal: add music, ambience, and stingers without slowing live play.

- [x] Add audio cue schema examples.
- [x] Add local audio library path configuration.
- [x] Add tagged audio asset metadata for music, ambience, and stingers.
- [x] Add audio service scaffold.
- [x] Add GM dashboard controls for play, pause, mute, and volume.
- [x] Trigger ambience/music loops on scene start and scene change.
- [x] Trigger one-shot stingers from reveals, traps, critical hits, and combat transitions.
- [x] Keep generated or licensed audio files outside Git.
- [x] Treat AI-generated audio as queued/prep-time content, not live per-turn generation.

### Milestone 0.8: Runtime Reliability

Goal: make failures visible and recoverable before adding heavier integrations.

- [x] Add runtime service scaffold.
- [x] Add `/health` endpoint.
- [x] Add runtime status object.
- [x] Add service health checks for game server, dice, state, memory, media, audio, and model adapters.
- [x] Add GM dashboard status strip.
- [x] Add player client heartbeat.
- [x] Add reconnect/resume flow.
- [x] Authenticate room-code admission and resumed membership instead of relying on the prototype fixed PIN (PLAN CORE-02–05; rendered QR flow still needs rehearsal).
- [x] Add prototype in-memory idempotency keys for rolls and submitted actions; durable conflict-safe behavior remains open in PLAN CORE-07–08.
- [x] Add error event log with visibility labels.
- [x] Add degraded-mode behavior for unavailable LLM, ComfyUI, audio, and import services.
- [x] Add manual backup placeholder.
- [x] Add session-start and session-end backup plan.
- [x] Bind game-server role/permission checks to authenticated identities; forged roles are denied in API/WebSocket tests (PLAN CORE-02–05, CORE-09).

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
- [ ] Add optional Discord bridge after the mobile web companion is useful.
- [ ] Add backup, restore, export, and archive tools.
- [ ] Add stronger permissions for GM, player, spectator, and AI roles.
- [ ] Add runtime resource governor for local model, media, audio, disk, and queue pressure.
- [ ] Add Black Dice Engine custom dice theme after the MVP roll loop works.
- [ ] Evaluate Qwen Image Edit, multi-angle LoRA, Flux/Kontext turnaround, IP-Adapter, and ControlNet workflows for character consistency.
- [ ] Add campaign pacing, quest graph, reveal manager, and faction-state tooling.
- [ ] Add GitHub Actions checks once there is real code to test.
- [ ] Create a simplified high-legibility banner/social-preview image.

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
