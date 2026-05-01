# Runtime Service

Future service for health checks, resource awareness, reconnect state, backup status, and graceful degradation.

Planned responsibilities:

- expose `/health` and runtime status data
- track service availability for game server, dice, state, memory, LLM, ComfyUI, audio, and import tools
- report queue depth and resource pressure
- prevent heavy jobs from blocking live play
- support client heartbeat and reconnect status
- record error events with player-safe visibility
- trigger or report manual/session backup status
- drive the GM dashboard status strip

The runtime service should help the table keep playing when a non-critical subsystem fails.
