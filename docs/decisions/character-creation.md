# Character Creation

Character creation should produce more than a sheet. It should create the source of truth for a player character's mechanics, personality, memory hooks, and visual identity.

## Quick Forge (new players, under a minute)

For a new game or a drop-in player, the phone join screen offers **Create a new character**. It is the fast path; the full intake below stays the path for prep-time characters.

1. Four tap-first questions: how they want to play (role), ancestry (or "Surprise me"), up to two personality traits, then optional presentation, look and name.
2. The game server builds three distinct proposals for that role at the party's current level. Mechanics are deterministic (standard array by class priority, +2/+1 ancestry bonus, HP from hit die, AC from armor type, class skills, gear and resources), so every sheet is valid without the AI.
3. The local LLM writes flavor only (name, appearance, personality, hook, visual tags) with a 10-second budget and strict JSON. Template flavor covers it when no model is running. Names must be original and avoid earlier proposals and existing party members.
4. Each proposal queues two portrait designs on the local ComfyUI (`COMFYUI_BASE_URL`, checkpoint `BDE_FORGE_CHECKPOINT`, 832x1216, 4 steps) into `output/bde/forge/`. Portraits appear on the cards as they finish; the player can pick before they do.
5. The player picks a proposal and portrait design, asks for three others (classes rotate each round), or changes their answers. The pick becomes a party member claimed by that device, with the portrait prompt stored for later visual-canon work.

Portraits are served through `/api/comfy-image`, which proxies ComfyUI's `/view` and only allows files under its `bde/` output folder.

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
