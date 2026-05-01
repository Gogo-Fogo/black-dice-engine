# AGENTS.md

Instructions for Codex and other coding agents working in this repository.

## Scope

- Edit only inside this repository unless the user explicitly approves another path.
- Do not touch model folders, real campaign folders, generated assets, secrets, private PDFs, or user-owned source material.
- Keep heavy and private local data outside the repo, especially:
  - `G:\AI-DM\02_models\`
  - `G:\AI-DM\03_campaigns\`
  - `G:\AI-DM\04_assets\`
- Do not delete user data.

## Repository Hygiene

- Never commit `.env` files, API keys, tokens, local credentials, private database files, generated media, or downloaded AI models.
- Prefer small, reviewable changes.
- Keep documentation updated when behavior, architecture, schemas, or setup steps change.
- Ask before introducing new frameworks, package managers, service runtimes, or large dependencies.
- Do not install dependencies unless the user explicitly asks.

## Content Rules

- Use placeholder/demo content only.
- Do not add copyrighted campaign text, paid adventure excerpts, private campaign notes, rulebook dumps, or private PDFs.
- Keep committed sample content original, generic, and SRD-safe/demo-safe.
- Keep real campaign imports and private table material out of Git.
- When source context files are provided, follow `docs/context-file-workflow.md`: summarize durable decisions instead of committing raw source documents.

## AI Output And Schemas

- Use schemas for structured AI output.
- Prefer deterministic state events over free-form state mutation.
- Keep GM-only, player-visible, and public/demo-safe content clearly separated.
- When adding prompts, include constraints that prevent leaking private campaign data into generated player output.

## Safety Defaults

- Treat the local network as semi-trusted.
- Avoid exposing services beyond localhost or the LAN without explicit user approval.
- Require confirmation before adding cloud integrations, telemetry, account systems, or remote sync.
