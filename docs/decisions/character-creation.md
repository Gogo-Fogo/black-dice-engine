# Character Creation

Character creation should produce more than a sheet. It should create the source of truth for a player character's mechanics, personality, memory hooks, and visual identity.

## Two-Part Flow

1. Player fills out identity, story, mechanics, and visual details.
2. The system converts that input into:
   - playable character sheet
   - AI personality/canon card
   - portrait prompt
   - full-body/token prompt
   - database record
   - party relationship hooks
   - future continuity references

## Shared Art Style First

Before final character art, define shared campaign style:

- campaign/world tone
- rendering style
- level of detail
- portrait format
- background type
- lighting mood
- color grading
- silhouette readability
- brush texture
- stylization level
- UI/card framing

This prevents each character from looking like they came from a different project.

## Player-Friendly Form

Keep the first form approachable:

- name
- race/species
- class/subclass
- what they look like
- what they wear/carry
- personality
- what they want
- what they fear
- secret
- relationship to party
- reference images/sketches
- must include
- avoid

## Full Structured Form

The system can expand the full record:

- name
- race/species
- class/subclass
- gender/presentation
- age range
- body type
- height/build
- party role
- face/vibe
- hair
- eyes
- skin/markings
- clothing/armor
- weapons/items
- magic/effects
- personality
- quirks
- habits/mannerisms
- voice/speech style
- flaw
- fear
- goal
- secret
- favorite object
- symbol/motif
- relationship to party
- backstory in one sentence
- color palette
- pose
- must include
- avoid
- references

## Reference Handling

References should be labeled:

- exact reference
- loose reference
- do-not-copy reference
- sketch
- weapon/item reference
- mood reference

Each upload should identify what it controls:

- face
- armor
- weapon
- pose
- color
- mood
- symbol
- body type

## Visual Canon Generation Pass

Character creation may include an optional prep-time visual canon pass. This is where the player and GM turn the character intake form, sketches, and references into approved art references before live play.

Recommended flow:

1. Generate portrait and full-body variants from the player intake.
2. Let the player accept, reject, or regenerate batches.
3. Generate a turnaround/reference set for accepted designs: front, three-quarter, side/profile, back, expression, combat pose, and key item views where useful.
4. Store accepted references as asset records linked to the character.
5. Keep rejected variants in local history only, with cleanup controls.
6. Use accepted references later for scene images, tokens, handouts, first/last-frame video prompts, and NPC relationship art.

Candidate ComfyUI approaches:

- Qwen Image Edit 2511 or similar image-edit workflows for preserving identity through edits.
- Multi-angle LoRA workflows for front/profile/three-quarter/back view generation.
- Flux/Kontext-style turnaround workflows for stylized model sheets.
- IP-Adapter, ControlNet, OpenPose, depth, or reference-image workflows for pose and composition control.
- Character-specific LoRA training only later, after enough approved reference art exists.

This pass should be queued or prep-time work, not a live-turn requirement. The goal is continuity, not perfect production art on the first try.

## Continuity Lock

Once the player accepts character art, store:

- final portrait
- accepted turnaround/reference images
- final prompt
- negative prompt
- seed/settings when available
- color palette
- motifs
- reference notes
- avoid list

Future images should use these records to preserve continuity.
