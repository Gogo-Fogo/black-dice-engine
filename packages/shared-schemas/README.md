# Shared Schemas

JSON schemas for structured data shared across Black Dice Engine apps, services, prompts, and tests.

Current schemas:

- `character-portrait-v1.schema.json` — runtime character reference metadata; see [upload and generation flow](../../docs/character-artwork.md). The broader `character.schema.json` remains a separate design contract.

- `capability-state-v1.schema.json` — additive optional-service flags and observed health state, referenced by runtime status.

- `ai-action-proposal.schema.json` — bounded structured suggestions, accepted skill/ability and difficulty values; never an authoritative state event.
- `scene-packet.schema.json`
- `character.schema.json`
- `character-intake.schema.json`
- `campaign-bible.schema.json`
- `campaign-design.schema.json`
- `backup-manifest.schema.json`
- `client-session.schema.json`
- `content-rating.schema.json`
- `error-event.schema.json`
- `permission-policy.schema.json`
- `state-event.schema.json`
- `asset.schema.json`
- `audio-cue.schema.json`
- `media-job.schema.json`
- `memory-entry.schema.json`
- `runtime-status.schema.json`
- `table-protocol-v1.schema.json` — versioned command, durable event and snapshot envelopes; route payloads and compatibility are described in `docs/command-protocol.md`.
- `party-command-v1.schema.json` — required Party command identity/round/stage metadata; runtime transition and role validation are in the Party service/reducer. See `docs/party-mode-api.md` for private/public state fields.

These are early contracts and should evolve as prototypes land.

The adjacent [contracts workspace](../contracts/README.md) now provides shared Party/session/command and TTRPG host/audio TypeScript types and pure runtime guards to both apps and the server. This directory remains a schema collection without an npm manifest; paths and `$id` values are unchanged. Targeted tests compare protocol enums/identifiers, but full source/schema generation and remaining TTRPG/AI/media consolidation are still open tasks.

`scene-packet.schema.json` accepts the existing generated `memory` beat alongside description/choice/threat/clue/consequence. The ID/dialect remain unchanged. `sceneBeatKinds` supplies the server/client TypeScript/runtime enum; `host-responses.test.mjs` checks schema enum parity and all three generated-packet queue routes. Other schema/runtime parity remains under ROOT-03.

The complete AI action proposal schema value is maintained in `packages/contracts/src/ai-action.ts`; `ai-actions.test.mjs` compares this JSON artifact against it, checks valid/malformed examples and exercises the actual server parser with mocked completions. Updating this contract requires updating the JSON artifact from `aiActionProposalSchema` after building contracts; the test fails on drift. This targeted source/artifact consistency does not establish full runtime validation for the other schemas.

The runtime schema now describes actual clients/queue pressure and optional measured process/host resources, replacing unimplemented model/VRAM/disk placeholders. Resource fields agree with the shared TypeScript guard and an actual isolated host response in `resource-monitor.test.mjs`; no GPU readiness is inferred. Full schema/runtime generation remains ROOT-03.

`campaign-progress-command.schema.json` documents GM ledger and consequence commands. Runtime validation is `isProgressCommand`; role checks, correction reasons and receipt replay are enforced by the server.

- `character-forge-flavor.schema.json`: bounded player-visible flavor for three Forge proposals; invalid output falls back to templates without changing character mechanics.
