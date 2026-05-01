# Game Server

Session coordinator for Black Dice Engine.

Current first-slice responsibilities:

- Health endpoint.
- Runtime status endpoint.
- Session snapshot endpoint.
- In-memory dice roll endpoint/log.
- WebSocket fanout for runtime and roll events.
- Sample campaign/session state for local UI development.

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
