---
name: bde-contracts-state
description: Add or change Black Dice Engine JSON schemas, AI output contracts, deterministic state events, campaign memory structures, or GM/player/demo visibility rules across apps, services, and prompts.
---

# Contracts, state events, and visibility

Start with the relevant files under `packages/shared-schemas/`, their references and dialect, and the corresponding server/client types and prompt consumers. Read `docs/security-and-permissions.md` and the relevant decision document for memory, character, campaign, or content-rating work.

- Identify the full producer/consumer path: prompt or request, runtime validation, proposed event, authorization/approval, state application, persistence, and audience-specific serialization. A schema on disk does not prove the runtime validates payloads against it.
- Distinguish required and optional fields deliberately. Check nullability, enums, numeric bounds, identifier formats, extra properties, and compatibility with stored records and existing clients.
- Keep JSON Schema, TypeScript types, API/WebSocket payloads, prompt examples, and sample content consistent. Do not add a generator or validator dependency merely to change a contract; use existing tooling or seek approval when a new dependency is necessary.
- Validate model output as untrusted input before applying it. Parse failures, unknown event kinds, invalid targets, and out-of-range resource changes need explicit handling. A TypeScript cast or successful `JSON.parse` is not schema validation.
- Keep event application explicit and auditable. Memory canonization and significant reveals retain their review/approval behavior; narrative prose alone must not silently mutate inventory, HP, conditions, or canon.
- Preserve `gm_only`, `player_visible`, and `public_demo` distinctions. Check filtering before prompt construction, exports, media routing, HTTP responses, and WebSocket delivery. Private information sent to a browser cannot be protected by presentation code.
- Fixtures and prompt examples must be original demo material. Do not derive examples from private source documents or live campaign state.

Verify valid and invalid examples with the applicable installed validator when available; check references resolve under the declared dialect. If only JSON syntax was checked, say so explicitly. For behavioral changes, verify event acceptance/rejection and audience filtering, not just schema syntax. Update `packages/shared-schemas/README.md` when contracts are added or renamed.
