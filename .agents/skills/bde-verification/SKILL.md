---
name: bde-verification
description: Verify Black Dice Engine code changes or refactors using its existing npm workspace checks, isolated demo data, and targeted browser/API tests without starting private campaign services or installing dependencies.
---

# Change verification

Inspect the diff and relevant `package.json` scripts before choosing checks. Root scripts provide `lint`, `build`, `test`, `build:party` and inventory. Tests are executable with isolated synthetic fixtures; see `tests/README.md`. Contracts and Node-only runtime configuration build before their consumers; eight workspaces currently participate. Confirm these facts against the checkout rather than assuming they remain unchanged.

## Select useful checks

- For a narrow change, run the affected workspace's existing lint/build scripts, for example `npm --workspace apps/player-companion run lint` and `npm --workspace apps/player-companion run build`.
- For shared-code or root configuration changes, run `npm run lint` and `npm run build` from the root, then confirm the intended workspaces actually participated. Both aggregate scripts use `--if-present`.
- Use existing installed dependencies. Missing dependencies or native-module incompatibility are limitations to report, not permission to run `npm install`, `npm ci`, `pip install`, or an `npx` command that downloads a package.
- For contract edits, parse the JSON and use an installed schema validator where applicable. Distinguish syntax, schema/reference validation, and runtime behavior in the report.
- For documentation/skill-only edits, check metadata, links, and consistency. Application builds and live services are unnecessary unless executable behavior also changed.

## Isolate behavioral verification

- Inspect initialization before starting/importing a service. `db.ts` is import-safe; explicit `openGameStore(path)` opens and initializes SQLite, while `createLegacyRepository(connection)` uses caller-owned state. The server entrypoint still opens its configured store on execution. TTS import/configuration is stdlib-only; explicit main startup loads the backend. Use injected synthetic synthesis and reject optional imports for routine Python checks; never use existing databases or real models.
- If a server check is needed, explicitly configure a disposable database under an ignored in-repo temporary directory, loopback binding, an unused port, and synthetic data before import/startup. Mock optional AI/media/audio calls and check startup for any remaining external side effects.
- Do not run the full launcher with its default database or historical download/generation helpers as general smoke tests. Launcher tests own disposable data/children; TTS tests use an existing Python 3.10+ interpreter and stdlib only. No install is authorized if Python is absent.
- For UI changes, inspect the relevant flow with available browser/computer-use tools on an isolated demo instance. Check phone width, error/loading states, reconnects, and `/player/` asset routing when affected. A screenshot alone does not verify state or authorization.
- Add focused tests only when needed to establish a meaningful changed invariant. Useful targets include permission denial, deterministic event application, replay/idempotency, persistence/restart, and malformed AI output.
- Clean up only processes and disposable fixtures created by the check. Do not kill existing session processes or remove user data.

Finish with `git diff --check`, review the intended changed paths, and report exactly what passed, failed, or was not exercised. Inspect newly added files as well as tracked diffs: `git diff` alone omits untracked additions. Separate pre-existing failures from regressions using evidence, without modifying unrelated code just to obtain a green result.
