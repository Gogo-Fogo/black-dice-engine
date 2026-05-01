# Portfolio Demo Plan

The portfolio demo should show the promise of Black Dice Engine without exposing private campaign data or copyrighted material.

## Demo Goals

- Show the GM dashboard controlling a live scene.
- Show player companion sheets updating over the local network.
- Show deterministic dice and state events.
- Show campaign memory retrieval.
- Show a local scene generation request routed through placeholder ComfyUI workflow metadata.
- Use the Black Dice Engine d20 key art as the project thumbnail, splash image, and portfolio visual anchor.

## Demo Content

Use only `campaigns/sample-campaign` or similarly sanitized original material.

Use public branding assets from `docs/assets/branding/` for project presentation.

Avoid:

- Real campaign notes.
- Paid adventure references.
- Private player information.
- Private generated media.
- Model files or local checkpoints.

## Suggested Demo Flow

1. Open a sample scene at the Lantern Gate.
2. Have a player roll to inspect a strange signal.
3. Apply a state event that changes faction suspicion.
4. Retrieve a memory about the Glassfen Coast.
5. Request a scene image using a placeholder workflow.
6. Show that generated outputs would be stored outside the repo.

## Success Criteria

- The demo is understandable in under five minutes.
- No private or copyrighted content is needed.
- The local-first architecture is obvious.
- The project looks like an engine, not just a chatbot wrapper.
