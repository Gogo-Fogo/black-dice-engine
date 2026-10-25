# Runtime configuration

Private Node-only workspace shared by the game server, audio service, Comfy router, runtime service and AI adapter. It performs no I/O, dotenv discovery, model loading or service startup. It derives the repository root from its module URL; both `src/` and `dist/` have the same relative depth. `packages/contracts` remains browser-safe and does not import this package.

- `readRuntimeConfig(env?, root?)` preserves the game server configuration interface and data defaults.
- `readServiceConfig(service, env?, root?)` validates the selected auxiliary service port, defaults to loopback and resolves its configured resources.
- `readAiConfig(env?, root?)` centralizes adapter defaults/provider names, prompt paths and explicit off-host consent. `BDE_ALLOW_REMOTE_AI=1` is required for a selected non-loopback AI endpoint; Party always disables endpoint/key use before a provider call.
- `readRuntimeProfile(env?)` accepts only `party` or `full`.

All relative paths resolve against the repository root, not cwd. An absent optional data store stays empty; it never becomes cwd. Defaults for the existing database, exports and runtime backups remain `_data/black-dice-engine.db`, `_exports` and `_backups`. No migration moves data. Ports are decimal integers 0–65535; zero supports isolated ephemeral checks. Base endpoints require HTTP(S) and reject embedded credentials, query strings and fragments. Config errors identify the variable without echoing its value.

Consumers import `../../../packages/runtime-config/dist/index.js` at the same relative depth from service source and emission. Like contracts, this works with existing installed tools without running an install or relying on a newly created workspace link. The root pretest/prelint and relevant development prerequisites build it; aggregate build orders packages before apps/services, and the Party launcher builds/verifies it before starting the server. The local manifest/lock metadata records four real service consumers without changing external dependency versions.

Node services no longer auto-load `.env` from cwd or an ancestor. Supply process environment or explicitly invoke Node with `--env-file=<chosen-file>`; [.env.example](../../.env.example) lists the active names. The game server compatibility seam remains `services/game-server/src/config.ts` for existing imports. Comfy direct submissions require `BDE_COMFY_API_BASE`; configuring only the router no longer enables a hidden hard-coded 8188 endpoint.

ROOT-08 configuration/startup work is complete; the portable launcher and explicit TTS startup are documented in the root setup guides. Remaining optional adapter behavior belongs to the capability tasks. This package does not repair raw-copy backup/WAL consistency, add provider access, enable LAN/cloud services or establish rendered-device readiness.
