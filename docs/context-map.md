# Context Map

This repo uses private context files as source material, then commits only distilled project docs.

## Private Sources

The current private context set is stored outside Git or under ignored folders:

- `ChatGPT_Context_Discussion.docx` / `_local-context/ChatGPT_Context_Discussion.md`
- `deep-research-report.md`
- `AI Dungeon Master Tool Search.docx`

These files should not be committed raw.

## Source Roles

- `Architectural assessment`: deep technical blueprint for local AI DM architecture, hardware limits, state tracking, memory, and multimodal workflows.
- `Local stack research`: practical tooling roadmap across local model servers, roleplay frontends, assistant UIs, and ComfyUI.
- `ChatGPT context discussion`: product decisions, Codex role, repo branding, MVP scope, database design, phone companion idea, mature content policy, storage policy, and GitHub safety rules.

## Public Docs Created From Context

- `docs/research-synthesis.md`: high-level combined research summary.
- `docs/decisions/project-vision.md`: product identity, Codex role, and portfolio positioning.
- `docs/decisions/core-architecture.md`: system boundaries and runtime responsibilities.
- `docs/decisions/mvp-scope.md`: first playable milestone.
- `docs/decisions/database-and-memory-design.md`: hard truth, soft memory, prompt memory, and asset metadata.
- `docs/decisions/latency-and-performance-policy.md`: live play timing, runtime modes, and async media policy.
- `docs/decisions/content-rating-policy.md`: mature campaign settings and table boundaries.
- `docs/decisions/asset-and-storage-policy.md`: repo boundary, generated media policy, and cleanup controls.
- `docs/decisions/codex-permissions-policy.md`: safe Codex workspace practices.
- `docs/decisions/campaign-design.md`: campaign setup, act planning, quest graph, and content library direction.
- `docs/decisions/character-creation.md`: player intake, visual references, and character continuity.

## Rule

When new private context is added, summarize decisions into docs, schemas, or prompts. Do not copy long raw passages into the repo.
