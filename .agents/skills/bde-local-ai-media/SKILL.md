---
name: bde-local-ai-media
description: Implement or troubleshoot Black Dice Engine's local LLM adapter, prompt assembly, ComfyUI job routing, audio cues, or Kokoro TTS integration, including timeouts, job status, and graceful degradation.
---

# Local AI and media adapters

Inspect the relevant implementation in `services/game-server/src/ai-adapter.ts`, `services/comfy-router/`, `services/audio-service/`, or `services/tts-service/tts_server.py`, plus its server callers and `prompts/`. Consult `docs/local-stack.md` and latency/reliability decisions when changing resource scheduling or failure handling.

- Preserve provider selection and the local-first default. Existing optional remote adapter code is not permission to enable a cloud integration or send campaign context remotely. Use synthetic payloads for development checks.
- Keep prompt/schema file resolution valid from both source and built modules. Separate trusted instructions from imported narrative/context, and filter context for the intended audience before building a prompt.
- Treat completions as proposals and validate structured output before it can reach authoritative state or memory. Use the contracts workflow when output shape changes.
- Put bounded timeouts, cancellation, status reporting, and failure recovery around inference and service calls. Repeated UI polling must not submit duplicate GPU jobs, trigger duplicate narration, or play the same cue repeatedly.
- Preserve asynchronous job lifecycle and GM approvals for generated media. Distinguish queued, running, failed, cancelled, and completed states according to the actual contract; do not report success merely because submission returned HTTP 200.
- Keep model/checkpoint files, audio libraries, generated outputs, private inputs, and external ComfyUI installations outside edits. Code may refer to configured paths; this skill does not authorize reading or writing those folders.
- TTS import/configuration is standard-library-only. Explicit startup requires configured model/voices files, defaults to loopback and loads the backend after claiming its port. `--check` validates file presence without loading models or binding a port. Routine checks inject synthetic synthesis/encoding and reject optional backend imports; do not load real models, download voices or install Python/GPU dependencies for verification.
- Preserve path validation and the distinction between approved asset identifiers and arbitrary filesystem paths. Avoid leaking full local paths, private prompts, or provider secrets into player errors or broadcasts.

Verify adapter behavior with mocked or isolated synthetic responses: successful output, malformed data, timeout/unavailable service, repeated polling, and cancelled work as applicable. Only run real generation when the user's task calls for it and the relevant paths/actions are authorized. Report mocked checks separately from live integration results.
