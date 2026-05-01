# Latency And Performance Policy

Latency will make or break the live table experience.

## Core Rule

```text
Text first.
State instantly.
Images async.
Videos queued.
```

The game should never wait for image or video generation before the GM can respond with text.

## Targets

- Player action to visible response start: under 3 seconds when possible.
- Full text response: under 10 seconds for normal play.
- State update: under 1 second.
- Scene image: 10 to 60 seconds, asynchronous.
- Video: queued for special moments, not expected during normal turns.

## Runtime Modes

- `Fast Mode`: text only or existing images. Default for combat and quick table flow.
- `Scene Mode`: text responds first, image generates in background.
- `Cinematic Mode`: boss reveals, visions, major story beats, and short queued clips.
- `Prep Mode`: slower high-quality generation before or after sessions.
- `Director Mode`: optional ChatGPT/GPT call for hard rulings, planning, memory canonization, and major scenes.

## Combat Fast Path

Combat should prioritize:

- instant dice
- instant HP/resource updates
- short narration
- no video
- rare image generation
- deterministic tool results

Combat text should be direct and actionable, not a long novel every turn.

## GPU Budget

The target machine has strong local GPU capability, but 16 GB dedicated VRAM is still a real ceiling. Do not design the live loop around running a large local text model and heavy image/video generation at the same time.

Practical defaults:

- 8B or 12B quantized local model for live play.
- SDXL-class image generation first.
- FLUX/video workflows later and selectively.
- Image-to-video for short clips after a strong still image exists.

## Job Queues

Image and video generation should be represented as jobs:

```json
{
  "jobId": "scene_023_image",
  "type": "image",
  "priority": "normal",
  "status": "queued",
  "linkedSceneId": "scene_023"
}
```

Clients receive job status updates over WebSockets. Long-running jobs must not block the state or narration loop.
