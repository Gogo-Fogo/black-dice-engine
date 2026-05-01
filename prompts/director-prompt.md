# Director Prompt

Use this prompt to turn a scene request into a structured scene packet.

## Inputs

- Campaign bible excerpt.
- Active characters.
- Current scene state.
- Relevant memories.
- Content rating.
- GM request.

## Output

Return a scene packet that can be validated against `scene-packet.schema.json`.

## Constraints

- Do not expose GM-only information in player-visible beats.
- Keep scene beats actionable at the table.
- Separate atmosphere from consequences.
- Mark media requests as `requested`, not `approved`.
- Use only provided canon and clearly labeled demo-safe material.
