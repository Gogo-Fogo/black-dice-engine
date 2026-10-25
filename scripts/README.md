# Scripts

- `party-launch.mjs`: lightweight Party build/check/start. See [Party startup](../docs/party-launch.md).
- `session-launch.mjs`: full-profile build/check/start with explicitly selected optional Node services. See [full session startup](../docs/full-session-launch.md).
- `inventory.mjs`: static maintained-source inventory; no application imports or services.
- `start-local-ai.ps1`: explicit Windows startup for existing ComfyUI/Ollama paths; hidden loopback processes, core image nodes, dedicated ignored output, no installation or port-owner replacement. See [tested setup](../docs/local-ai-upgrade-2026-10-25.md).
- `deepseek-campaign-check.mjs`: explicitly paid synthetic campaign verification. Requires existing remote consent/key and `--live`; never runs in routine tests or launchers. `--ledger=<name>` starts a separately capped ledger per spending authorization, `--long` runs the twelve-beat session and `--dry-run` sends nothing. See [live results and budget guard](../docs/deepseek-campaign-live-check.md).

Five obsolete download, live-generation, timing and source-rewrite helpers were removed after caller review. [Retirement notes](../docs/script-retirement.md) record each disposition and replacement. Routine startup and inventory perform no dependency installation, model download or live generation. The explicitly paid check above is separate.
