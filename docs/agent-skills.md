# Project agent skills

The repository-scoped collection lives in `.agents/skills/`. It matches the current React/Vite/TypeScript apps, npm workspaces, Express/WebSocket game server, SQLite persistence, JSON Schema contracts, and local AI/media adapters. It adds workflows; collecting these skills does not refactor application code or enable services.

## Included collection

| Skill | Use it for | Example request |
| --- | --- | --- |
| [bde-root-refactor](../.agents/skills/bde-root-refactor/SKILL.md) | Root layout, workspace/config changes, shared-code extraction, large module splits, startup/resource paths | `Use $bde-root-refactor to extract shared browser contracts while preserving the current build and startup behavior.` |
| [bde-react-ui](../.agents/skills/bde-react-ui/SKILL.md) | GM dashboard, phone companion, React hooks, WebSocket clients, Three.js dice and browser audio | `Use $bde-react-ui to extract the companion connection lifecycle into a hook.` |
| [bde-realtime-server](../.agents/skills/bde-realtime-server/SKILL.md) | Express handlers, session permissions, snapshots/broadcasts, request deduplication, SQLite/recovery | `Use $bde-realtime-server to fix duplicate state application after reconnect.` |
| [bde-contracts-state](../.agents/skills/bde-contracts-state/SKILL.md) | JSON schemas, AI proposals, deterministic events, memory and audience filtering | `Use $bde-contracts-state to add a demo-safe state-event contract and verify its consumers.` |
| [bde-local-ai-media](../.agents/skills/bde-local-ai-media/SKILL.md) | Local LLM, ComfyUI jobs, audio/TTS adapters, timeouts and failure handling | `Use $bde-local-ai-media to handle an unavailable local model without blocking rolls.` |
| [bde-verification](../.agents/skills/bde-verification/SKILL.md) | Existing workspace checks, isolated demo API/UI verification, root refactor validation | `Use $bde-verification to verify this change without using the current campaign database.` |
| [security-best-practices](../.agents/skills/security-best-practices/SKILL.md) | Explicit security review of React, Express, browser JavaScript/TypeScript, or Python | `Use $security-best-practices to review the player session and WebSocket authorization boundary.` |
| [codebase-design](../.agents/skills/codebase-design/SKILL.md) | Interface design, responsibility ownership, useful abstractions, and testable module seams | `Use $codebase-design to compare interfaces for extracting game-state orchestration.` |
| [diagnosing-bugs](../.agents/skills/diagnosing-bugs/SKILL.md) | Hard failures, intermittent behavior, performance regressions, and reproducible diagnosis | `Use $diagnosing-bugs to trace a reconnect failure with isolated demo data.` |
| [review-and-simplify-changes](../.agents/skills/review-and-simplify-changes/SKILL.md) | Review a diff for reuse, correctness, efficiency, and unnecessary complexity; optionally simplify | `Use $review-and-simplify-changes to review the current diff without applying fixes.` |
| [information-architecture-navigation](../.agents/skills/information-architecture-navigation/SKILL.md) | GM/player navigation, task grouping, labels, search, and findability | `Use $information-architecture-navigation to improve the dashboard's scene and party navigation.` |
| [web-interface-guidelines](../.agents/skills/web-interface-guidelines/SKILL.md) | Code-level UI accessibility, focus, forms, motion, touch, and responsive review | `Use $web-interface-guidelines to audit the player companion controls.` |

The six `bde-*` skills are project-authored. `security-best-practices` is installed from the [OpenAI curated skill](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices); its bundled license and references are retained. Catalog/source review and installation date: October 24, 2026. Upstream downloads are snapshots, not automatically updated integrations.

Five more skills were reused from the owner's other local projects: module design, debugging, and diff review from `Gym_App`; navigation and pinned web UI rules from `tsvetanski-portfolio`. Gym_App's architecture-survey approach also informs the root-refactoring reference. Copies retain their licenses and supporting references, with local adaptations for the existing tools, privacy boundaries, and task scope. Recorded upstream revisions and adaptations are listed in [third-party notices](../.agents/skills/THIRD_PARTY_NOTICES.md).

The portfolio's brand/recruiter rules, Next.js launcher and screenshot scripts, and Gym_App's SwiftUI/iOS tooling were not imported. The architecture workflow uses this project's existing `docs/decisions/`; it does not require a new glossary/ADR system, CDN report, or interview before implementing an already authorized refactor. Parallel-agent guidance in the reused skills is optional and requires an explicit user request for delegation.

Read root `AGENTS.md` first. Skills do not authorize dependency installation, changes to private data, cloud enablement, or publishing. Current code sometimes differs from planning documents; inspect implementations before relying on a planned boundary.

## Discovery and use

Codex discovers repository skills in `.agents/skills/` and can select them when a request matches their descriptions. You can also mention a skill explicitly with `$skill-name`. The collection is available on the next turn; if it does not appear, restart Codex. See [official skill documentation](https://learn.chatgpt.com/docs/build-skills).

The skills are instruction-only apart from upstream reference assets. They do not install application packages, models, browser binaries, new runtimes, or service integrations. For a root refactor, the main checks are existing `npm run lint` and `npm run build`, plus targeted compatibility checks chosen from the actual diff.

## Complementary skills already available in this environment

These are optional environment capabilities, not vendored dependencies of the project skills:

- `vercel:react-best-practices`: React/TypeScript review after changes across multiple components. Its React guidance does not require deploying the Vite apps to Vercel.
- `computer-use:computer-use`: inspect a running demo UI when direct browser tooling is insufficient.
- `openai-docs`: current official OpenAI adapter/API guidance when working on the optional remote provider.
- `skill-creator` and `skill-installer`: maintain this collection or add a deliberately chosen skill.

## Optional upstream skills reviewed

The [OpenAI curated catalog](https://github.com/openai/skills/tree/main/skills/.curated) also includes the following relevant options, which are not installed in this repository:

- [Playwright](https://github.com/openai/skills/tree/main/skills/.curated/playwright): reusable browser automation if a compatible CLI/browser setup is already available or separately authorized. Its package/browser installation steps remain subject to `AGENTS.md`.
- [GitHub CI repair](https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci): investigate GitHub Actions failures when the project has applicable checks and an authenticated connection.
- [GitHub review comments](https://github.com/openai/skills/tree/main/skills/.curated/gh-address-comments): address comments on a requested pull request.

Cloud deployment and hosted-agent frameworks are outside the current local runtime skill collection. Add them only if the project takes on that work.
