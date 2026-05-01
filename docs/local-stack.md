# Local Stack

Black Dice Engine is planned as a local-first system running on a Windows gaming PC.

## Host Machine

The host machine should run:

- GM dashboard.
- Local game services.
- Local model endpoints.
- ComfyUI for media generation.
- Local campaign data directories outside Git.

## Candidate Runtime Pieces

- Web app: Next.js or Vite with TypeScript.
- Service layer: Node.js and/or Python.
- Realtime updates: WebSockets.
- Local database: SQLite.
- Dice presentation: optional dddice adapter first, local/open-source fallback later.
- Local LLMs: Ollama, KoboldCPP, or compatible local HTTP endpoints.
- Media generation: ComfyUI.
- Audio playback: local tagged music, ambience, and stinger library.
- Character visual consistency: optional ComfyUI reference/turnaround workflows during prep.
- Schemas: JSON Schema.

## Network Shape

Default development should bind services to `127.0.0.1`. Player companion access may require LAN binding later, but that should be explicit and documented.

## Local Data Roots

The repo should reference, but not contain, large/private data roots. Suggested roots:

```text
G:\AI-DM\02_models\
G:\AI-DM\03_campaigns\
G:\AI-DM\04_assets\
```

This machine currently uses a separate Ollama model root:

```text
G:\AI_Tools\OllamaModels
```

The exact paths can change per machine. Keep them configurable through `.env` and never commit their contents.

## Integration Principle

Adapters should hide tool-specific details. The GM dashboard should not need to know whether narration came from Ollama, KoboldCPP, or another local model runtime.
