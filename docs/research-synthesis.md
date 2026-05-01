# Research Synthesis

This summary distills the project context from the three private/local research files reviewed on May 1, 2026:

- `ChatGPT_Context_Discussion.docx`
- `deep-research-report.md`
- `AI Dungeon Master Tool Search.docx`

The original files live outside this repository and should not be committed unless the user explicitly sanitizes and approves them.

## Core Conclusion

Black Dice Engine should not try to be one monolithic AI Dungeon Master app. The strongest design is a composed local-first stack: a GM/player interface, local model backends, deterministic game-state tools, campaign memory, and a local media pipeline.

This repository should become the custom orchestration layer and product shell around those pieces, not a fork of every tool.

## Architecture Direction

The research points to a decoupled architecture:

- A GM dashboard coordinates live play, narration, state review, memory retrieval, and media requests.
- Player companion clients receive only player-visible data.
- Local model adapters connect to tools such as Ollama, KoboldCpp, llama.cpp-compatible servers, or OpenAI-compatible local endpoints.
- ComfyUI handles serious local image generation and later experimental video workflows.
- State, dice, rules, inventory, faction standing, and resource changes are deterministic service responsibilities, not free-form model memory.
- Campaign memory should use structured records with source and visibility labels.

The most important product principle is that AI may propose narrative and state changes, but validated services apply permanent game state.

## Tooling Takeaways

Practical stack options from the research:

- `Open WebUI + Ollama`: best early local assistant path for campaign prep, notes, rules lookup, files, RAG, and general ChatGPT-like work.
- `SillyTavern + KoboldCpp + ComfyUI`: strongest existing local roleplay/GM stack for live scenes, lorebooks, characters, memory, and image hooks.
- `LibreChat`: useful if a more clearly open-source assistant server is needed.
- `Jan`: useful as a simple local desktop assistant and local API server.
- `LocalAI`: useful if one local API gateway for many modalities becomes more valuable than best-of-breed tools.
- `ComfyUI`: preferred local media engine for scenes, NPC portraits, props, maps, and eventually video workflows.

Black Dice Engine can borrow patterns from these tools while keeping its own architecture focused on TTRPG state, visibility, and table workflows.

## Hardware Constraints

The research assumes an NVIDIA RTX 5070 Ti with 16 GB VRAM.

Practical expectations:

- 8B local text models should be comfortable.
- 12B to 14B-class quantized models are realistic.
- Larger dense models require compromises such as heavier quantization, offload, or lower context.
- SDXL-style image generation should be comfortable.
- FLUX workflows may be possible with optimized or quantized setups.
- Local video generation should be treated as later-stage and asynchronous.

Design implication: Black Dice Engine should not block live play on slow media generation or oversized model calls.

## Rules And State

The model should not be trusted to remember or calculate game mechanics over long sessions.

Preferred approach:

- Use deterministic dice tools.
- Store state changes as explicit events.
- Validate structured AI output against schemas.
- Use local SRD-safe retrieval for rules reference where legally appropriate.
- Keep rules answers grounded in source material and tool results.
- Require GM approval for major state changes, reveals, or irreversible consequences.

## Memory And Visibility

Campaign memory should separate:

- `gm_only`
- `player_visible`
- `public_demo`

Every memory record should keep source, visibility, and confidence/confirmation status where useful. Imported content should be private by default. Demo content should be original and safe to share.

## Media Generation

Image generation is important to the project identity, but it should be routed through approval and asynchronous job tracking.

Preferred flow:

1. GM or AI proposes a media request.
2. Request validates against the asset schema.
3. GM approves or edits prompt.
4. Comfy router queues the workflow.
5. Generated files are stored outside the repo.
6. Only safe metadata or demo placeholders are committed.

Video generation remains a later roadmap item because it is more expensive, slower, and more VRAM-sensitive.

## Product Positioning

Black Dice Engine should be framed as:

> Local-first AI Game Master engine for dark, collaborative TTRPG campaigns.

It should feel like a table command center: live GM support, player sheets, deterministic state, campaign memory, and local scene generation working together.

## Build Priorities

Recommended early sequence:

1. Keep repo boundaries and safety rules clear.
2. Finalize schemas for scene packets, characters, state events, assets, and campaign memory.
3. Build a minimal game server with dice and state-event validation.
4. Prototype GM dashboard flows before adding heavy model orchestration.
5. Add player companion visibility controls early.
6. Add local model adapters after the deterministic loop is stable.
7. Add ComfyUI routing as asynchronous media jobs.
8. Keep portfolio demo mode based only on sample content.

## What To Avoid

- Do not build around a single brittle AI DM repo.
- Do not use Codex itself as the runtime AI GM; Codex is for building the software.
- Do not let the model directly mutate authoritative game state.
- Do not commit source PDFs, real campaigns, model files, generated media, or private notes.
- Do not make video generation a blocking requirement for the first usable version.
