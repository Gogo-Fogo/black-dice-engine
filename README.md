# Black Dice Engine

Local-first AI Game Master engine for dark, collaborative TTRPG campaigns.

Black Dice Engine turns a local gaming PC into an AI-powered tabletop RPG command center, combining live GM narration, player phone sheets, deterministic game-state tracking, campaign memory, and local scene generation.

## What It Is

Black Dice Engine is an experimental local-first toolset for running tabletop RPG campaigns with AI assistance. It is designed to keep the core campaign experience on the host machine while giving players lightweight companion views, shared character sheets, and structured state updates.

The goal is not to replace a human table. The goal is to help a GM or solo/group table keep pacing, continuity, atmosphere, rules state, and campaign memory under control.

## Problem It Solves

AI-assisted games can drift, forget details, invent contradictory state, or leak private material into remote services. Traditional virtual tabletop tools can also leave narration, memory, image generation, and rules bookkeeping split across many disconnected apps.

Black Dice Engine aims to make those pieces work together:

- The GM gets live narration support and deterministic state tools.
- Players get phone-friendly sheets and table state.
- The campaign gets structured memory instead of loose chat history.
- Local models and local media pipelines stay outside the repository.
- Generated content is routed through clear schemas and permissions.

## Local-First Architecture

This project is designed around a Windows gaming PC acting as the table host.

Planned local flow:

1. The GM dashboard sends table context, scene requests, and rules/state actions.
2. Game services validate dice, state events, character data, and campaign memory.
3. Local model adapters talk to tools such as Ollama, KoboldCPP, or other local inference runtimes.
4. The Comfy router sends approved scene/art prompts to a local ComfyUI instance.
5. Player companion clients connect over the local network for sheets, rolls, status, and limited scene updates.

Remote services should be optional and explicit. Secrets, private campaign data, paid PDFs, downloaded models, generated media, and personal notes should remain outside this repo.

## Main Features

Planned capabilities include:

- GM dashboard for live narration, scene control, and adjudication.
- Player companion app for phone/tablet character sheets.
- Deterministic dice and rules event service.
- Structured game-state service with auditable state events.
- Campaign memory service for canon, summaries, locations, factions, NPCs, and unresolved threads.
- ComfyUI routing layer for local image and video generation.
- Import service for user-owned notes and campaign material, with strict privacy boundaries.
- Shared JSON schemas for AI output and cross-service data.
- Prompt templates for GM narration, scene direction, memory canonization, and content rating.

## Planned Stack

The stack is intentionally not locked yet. Current likely direction:

- Windows-first local development.
- TypeScript for web apps and shared schemas.
- Next.js or Vite for the GM dashboard and player companion.
- Node.js or Python services where each makes sense.
- WebSockets for live table updates.
- SQLite for local structured state and memory indexes.
- Local LLM adapters for Ollama, KoboldCPP, or compatible endpoints.
- ComfyUI for local media generation workflows.
- JSON Schema for structured AI output contracts.

No dependencies are installed in this scaffold.

## What Is Intentionally Not Included

This repository should not contain:

- AI model files or downloaded checkpoints.
- Real campaign databases or private table notes.
- Generated images, generated videos, or ComfyUI outputs.
- Private PDFs, purchased adventures, rulebooks, or copyrighted campaign text.
- API keys, secrets, tokens, local credentials, or `.env` files.
- Large asset packs or personal media libraries.

Use local folders outside the repo for heavy/private material:

- `G:\AI-DM\02_models\`
- `G:\AI-DM\03_campaigns\`
- `G:\AI-DM\04_assets\`

## Safety And Legal Note

Only commit code, docs, schemas, prompts, config examples, and demo content that you have the right to share. Do not commit copyrighted adventure text, private campaign data, paid PDFs, extracted rulebooks, proprietary images, player personal data, secrets, or generated material that should remain private.

Sample content in this repo should remain original, generic, and SRD-safe/demo-safe.

## Project Status

Early scaffold / experimental.

This repository currently defines the project shape, documentation, schemas, prompt templates, and safe sample content. It does not include production apps, installed dependencies, model integrations, or a complete runtime.

## Decision Docs

The working product decisions live in `docs/decisions/`. Start with:

- `project-vision.md`
- `core-architecture.md`
- `mvp-scope.md`
- `database-and-memory-design.md`
- `latency-and-performance-policy.md`
- `campaign-design.md`
- `character-creation.md`

## Roadmap Summary

Near-term:

- Finalize architecture boundaries and data contracts.
- Build minimal game server and dice/state services.
- Create a GM dashboard prototype.
- Create a player companion prototype.
- Add campaign memory ingestion for demo-safe content.
- Add local ComfyUI workflow routing with placeholders.

Later:

- Add local model adapter support.
- Add session replay and timeline tools.
- Add permissions for player-visible and GM-only information.
- Add portfolio demo mode using only sample content.
- Harden security, backups, exports, and import workflows.
