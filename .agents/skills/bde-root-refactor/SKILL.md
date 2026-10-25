---
name: bde-root-refactor
description: Refactor Black Dice Engine at the repository root, including npm workspaces, shared packages, TypeScript configuration, startup paths, and extraction of large app or server modules. Use for structural changes that span workspace boundaries.
---

# Repository and root refactoring

Read root `AGENTS.md`, root `package.json`, `tsconfig.base.json`, and the manifests/configuration of affected workspaces. Read `docs/decisions/core-architecture.md` when changing service responsibilities. Treat source code and manifests as evidence of current behavior; several architecture documents describe future work.

## Map the change

- Inspect Git status and identify the requested structural outcome. Preserve unrelated edits.
- Trace imports, package scripts, Vite proxies, static routes, prompt/schema loading, database paths, and Windows launch commands before moving code. Search code and maintained docs, excluding dependencies, outputs, private context, and local data.
- Record the affected paths and compatibility requirements in a concise move/extraction plan. Carry out authorized, reversible changes in small slices.

For an architecture survey or a refactor with competing extraction options, read [architecture-survey.md](references/architecture-survey.md). Use [codebase-design](../codebase-design/SKILL.md) for interface tradeoffs and [review-and-simplify-changes](../review-and-simplify-changes/SKILL.md) for a focused review of the resulting diff. A routine file move does not need a full architecture survey.

## Repository-specific constraints

- Workspace globs are `packages/*`, `apps/*`, and `services/*`, in dependency build order. `packages/contracts` has real app/server consumers; `packages/runtime-config` is Node-only with four service consumers. `packages/shared-schemas` remains JSON/docs without a manifest. Check each maintained package README for emitted-entrypoint imports and build prerequisites. New packages still need deliberate manifests, consumers and build wiring; follow dependency/tooling approval rules.
- Apps use React/Vite and TypeScript; services use Node ESM with `NodeNext`. Preserve each environment's module resolution and valid emitted import paths. A root aggregate command uses `--if-present`, so success does not prove every intended package was checked.
- The game server serves the built companion under `/player/`; the companion uses Vite `base: "./"`. Check both Vite development proxies and built static paths when moving client or server files.
- `services/game-server/src/db.ts` has no import-time store/configuration access. Server startup passes the validated root-relative database path to `openGameStore`; `createLegacyRepository` accepts a caller-owned SQLite connection. Preserve the default path, WAL/FULL settings and shared command transaction. Tests must explicitly open owned demo paths or in-memory stores and close them.
- The AI adapter resolves `prompts/` relative to its module. Other services also resolve local resources from `import.meta.url`. Check source execution and built execution separately.
- `start-session.bat` delegates to `scripts/session-launch.mjs`, preserving the configured/default database. Optional Node services require explicit selection; external models/tools never start automatically. Test with disposable data paths and an allowlisted environment. Five obsolete helpers were retired after caller review; see `docs/script-retirement.md` before considering any historical script restoration.
- Extract responsibilities from large `App.tsx` and server `index.ts` files using existing seams. Preserve route ordering, middleware, permission checks, snapshot filtering, WebSocket envelopes, event application, and persistence timing. Do not combine behavior changes with mechanical moves unless the task requires them.
- Share browser-safe contracts/helpers without making frontend bundles depend on server modules, secrets, filesystem APIs, or database initialization. Reuse dice presentation separately from authoritative roll generation.

## Verify the result

Use `$bde-verification` if available, or inspect and run the affected workspace's existing lint/build commands directly. Check moved-path references, resource resolution, and relevant observable behavior; compilation alone cannot prove path or protocol compatibility. Update setup/architecture docs that describe changed behavior. Report the final boundaries, checks performed, and remaining limitations. A request to collect or edit this skill does not itself authorize a project refactor.
