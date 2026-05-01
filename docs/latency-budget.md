# Latency Budget

Black Dice Engine should feel responsive at the table. Local AI can still be slow, so the product should separate fast state actions from slower creative generation.

## Target Feel

- Dice rolls: immediate.
- Character sheet updates: immediate.
- State event validation: under 250 ms where possible.
- Player companion updates: under 500 ms on LAN.
- Short narration assist: 2 to 6 seconds depending on local model.
- Long scene generation: 10 to 30 seconds depending on local model.
- Image generation: asynchronous, with GM approval and progress states.
- Video generation: asynchronous background work.

## Design Guidance

- Do not block deterministic game state on image/video generation.
- Stream narration where possible.
- Let the GM accept, edit, or reject AI output.
- Cache stable memory retrieval results during a scene.
- Keep player clients updated with state changes even while AI work continues.

## Metrics To Capture Later

- Roll latency.
- WebSocket round-trip.
- Model prompt and completion time.
- Memory retrieval time.
- ComfyUI queue and render time.
- Time from GM action to player-visible update.
