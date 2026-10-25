# Game Server

Session coordinator for Black Dice Engine.

Current first-slice responsibilities:

- Health endpoint.
- Runtime status endpoint.
- Session snapshot endpoint.
- In-memory dice roll endpoint/log.
- WebSocket fanout for runtime and roll events.
- Sample campaign/session state for local UI development.

Character forge (quick character creation from the phone):

- `GET /api/character-forge/options` — questions and choices, plus the party level.
- `POST /api/character-forge/sessions` — `{ clientId, answers }` → three proposals; portraits queue on ComfyUI.
- `GET /api/character-forge/sessions/:id?clientId=` — refreshes portrait status.
- `POST /api/character-forge/sessions/:id/reroll` — three new proposals for the same answers.
- `POST /api/character-forge/sessions/:id/choose` — creates and claims the character.
- `GET /api/comfy-image` — serves ComfyUI output from its `bde/` folder only.

Uses `COMFYUI_BASE_URL`, `BDE_FORGE_CHECKPOINT` and the existing LLM settings. Works without either: template flavor and initials instead of portraits. See `docs/decisions/character-creation.md`.

Near-term additions:

- Session lifecycle and permission checks.
- State-event validation.
- Heartbeat/reconnect coordination.
- Player-safe error propagation.
- Calls into dice, state, memory, runtime, and media services.

Run with:

```text
npm --workspace services/game-server run dev
```
