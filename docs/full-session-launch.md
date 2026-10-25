# Full session startup

`npm run session` or `start-session.bat` builds the two shared packages, both browser apps and the game server using existing installed tools, then serves the full profile on loopback. The Windows wrapper resolves its script relative to itself and forwards failures. No working-directory assumption, dependency installation, environment-file discovery or external application startup is involved.

The existing configured database remains the default: `BDE_DB_PATH`, otherwise repository `_data/black-dice-engine.db`. Nothing is moved or deleted. For a separate demo, explicitly select a disposable directory:

```powershell
npm run session -- --data-dir "tmp/full demo" --port 4310
npm run session -- --services audio,comfy --data-dir "tmp/full demo"
node scripts/session-launch.mjs --check --data-dir "tmp/full demo"
```

`--check` requires existing builds and validates configuration/available ports without opening a database or starting optional services. `--build-only` builds without starting. `--no-build` uses existing emission. `--lan` explicitly binds the game server to all interfaces; child services remain loopback. `--port 0` is available except with the runtime monitor, which requires a fixed game port. `--services none` is the default; valid opt-in names are `audio`, `comfy`, `runtime`. Only selected services are additionally built and started. The monitor's existing backup behavior is not proven WAL-safe; enabling it does not resolve the remaining backup task.

Optional services receive process environment and must have their stores/providers configured explicitly. ComfyUI, LLM runners and Python TTS are managed separately. To load a chosen Node environment file, use `node --env-file=<chosen-file> scripts/session-launch.mjs ...`; neither the batch file nor launcher discovers one. Do not commit private environment files.

Preflight detects occupied/duplicate ports before opening game data and preserves the existing port owner. Startup failure stops only child services started by this launcher. Ctrl+C stops the launcher and its owned children. The lightweight [Party launcher](party-launch.md) remains the default for Party sessions and keeps its separate database and disabled optional adapters.

Synthetic tests start the built full launcher outside the checkout in a path with spaces, ignore an invalid fixture `.env`, exercise game/audio/router health, reject a conflicting second launcher before database creation, preserve the first owner, and confirm cooperative shutdown closes all owned listeners. External tools/models, private stores, live audio and physical/browser behavior are untested.
