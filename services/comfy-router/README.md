# Comfy Router

Local media routing service for explicitly configured ComfyUI. Registry entries may still be placeholders; configuration alone does not prove generation works.

Endpoints:

- `GET /health`
- `GET /api/workflows`
- `GET /api/prompt-templates`
- `GET /api/jobs`
- `POST /api/jobs/prepare`
- `POST /api/jobs/:id/submit`
- `GET /api/jobs/:id/status`

Registry and prompt templates resolve relative to the repository independently of cwd: `comfy-workflows/registry.json` and `prompts/image-prompt-templates.json`. Workflows declare IDs, type, label/description, scheduling, visibility, prompt template, workflow path, output category and tags. Preparation resolves a workflow and template and returns warnings/readiness; it does not execute a workflow.

Submission requires explicit `BDE_COMFY_API_BASE` configuration and a non-placeholder readable workflow JSON. `BDE_COMFY_OUTPUT_ROOT` records the configured external destination; routine checks must never inspect real outputs or run generation. Router jobs are process-local and not durable across restarts. Do not treat readiness or HTTP success alone as generated-file availability.

The shared contracts workspace owns `RouterJob` and the response guards. Prepare/submit return `{ ok: true, job }`; status returns `{ ok: true, job, comfyStatus, error }`. The game-server client validates these envelopes and matching identities before state changes. Status uses `comfyStatus` and `job.status`, not a top-level `status`. Completed router jobs retain the game server's existing metadata-recording path; approved file ingestion and safe asset serving remain separate requirements.

`tests/service-config.test.mjs` checks actual preparation/status producers from unrelated cwd in source and emitted modes with outgoing calls blocked. `tests/media-router.test.mjs` checks injected successful/malformed/mismatched confirmations and poll ownership. Neither executes a workflow, accesses private outputs or establishes GPU compatibility. Build shared packages first through the root build; no dependency installation is needed for the existing relative emitted-entrypoint imports.

Character workflows now consume an approved PNG reference and pinned seed through IPAdapter Advanced. Upload failure blocks submission; confirmations never include the raw reference. Prompt replacement preserves JSON values. Character completions use the reported SaveImage output inside the configured bde directory, followed by private GM preview and explicit player sharing. See [character artwork](../../docs/character-artwork.md) for setup, limits and branch integration status.
