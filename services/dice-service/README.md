# Dice Service

Planned deterministic dice and roll-history service.

Expected responsibilities:

- Parse roll expressions.
- Execute rolls.
- Record roll metadata.
- Support visibility settings.
- Return structured results for the game server.
- Keep roll truth local even when an external 3D dice presentation adapter is used.
- Support idempotency keys so reconnects do not duplicate rolls.

Optional visual presentation:

- dddice can be used first with free/default dice themes.
- Custom Black Dice Engine dice colors and textures are deferred until the playable loop works.
- A local/offline dice renderer should remain possible later.

No service implementation exists yet.
