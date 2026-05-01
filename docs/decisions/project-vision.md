# Project Vision

Black Dice Engine is a local-first AI Game Master engine for dark, collaborative TTRPG campaigns.

The project is not an "AI chatbot for D&D." It is a tabletop command center that coordinates narration, player companion screens, deterministic state tools, campaign memory, local scene generation, and optional high-intelligence director assistance.

## Product Shape

The finished experience should feel like:

- A GM dashboard for live session control.
- Player phone sheets/controllers over the local network.
- A visual novel / tabletop hybrid with generated scene art.
- A campaign database that remembers what actually happened.
- A local media pipeline for images and rare cinematic clips.
- A toolchain that can adapt legal/open material, private notes, and player backstories into playable sessions.

## Core Promise

Black Dice Engine turns a local gaming PC into an AI-powered tabletop RPG command center.

It should help a table:

- Run scenes with fast narration.
- Track mechanics without relying on AI memory.
- Keep campaign continuity over many sessions.
- Generate dark fantasy scene art and character visuals.
- Let players use phones for sheets, rolls, actions, and handouts.
- Keep private campaigns, models, generated assets, and secrets outside Git.

## Codex Role

Codex is part of the project workflow, but it is not the live game table.

Use Codex as the engineering partner:

- Build and maintain the repo.
- Write schemas, prompts, services, tests, docs, and adapters.
- Create ComfyUI routing helpers.
- Build import/export tools.
- Debug the stack.
- Keep changes small and reviewable.

The live game should run in Black Dice Engine's dashboard/player companion UI. ChatGPT or local models may act as director/narrator brains through explicit integrations.

## Portfolio Positioning

The portfolio-worthy contribution is the orchestration system:

```text
player input
-> GM reasoning
-> dice/rules/state tools
-> memory update
-> scene/image job
-> campaign log
-> next turn
```

The project should show architecture, schemas, state control, latency design, and a playable demo. It should not claim ownership of third-party tools such as local model servers or image engines.

## Non-Goals

- Do not build "AI Skyrim" first.
- Do not start with Unity or a native mobile app.
- Do not make video generation a blocking live-loop feature.
- Do not make the LLM the source of truth for mechanics.
- Do not publish private campaigns, paid PDFs, model weights, secrets, or private/adult generated assets.
