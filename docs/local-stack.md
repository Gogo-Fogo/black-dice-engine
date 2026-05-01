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
- Local LLMs: Ollama, KoboldCPP, or compatible local HTTP endpoints.
- Media generation: ComfyUI.
- Schemas: JSON Schema.

## Network Shape

Default development should bind services to `127.0.0.1`. Player companion access may require LAN binding later, but that should be explicit and documented.

## Local Data Roots

The repo should reference, but not contain, these data roots:

```text
G:\AI-DM\02_models\
G:\AI-DM\03_campaigns\
G:\AI-DM\04_assets\
```

## Integration Principle

Adapters should hide tool-specific details. The GM dashboard should not need to know whether narration came from Ollama, KoboldCPP, or another local model runtime.
