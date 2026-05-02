# Image Prompt Templates

These templates are the human-readable companion to `image-prompt-templates.json`. Generated images should be stored outside this repository.

## Template Set

### `scene-reveal`

Purpose: first-pass scene art for a location reveal or moody exploration beat.

```text
Dark cinematic tabletop RPG scene, {location}, {time_of_day}, {weather}, {tone}, practical environmental detail, grounded fantasy atmosphere, readable composition, no text, no watermark.
```

Negative:

```text
text, watermark, logo, blurry anatomy, low-detail faces, modern clothing, duplicate limbs, UI overlay.
```

### `portrait-variant`

Purpose: prep-time portrait or visual-canon generation for recurring characters.

```text
Portrait of {subject_name}, {role}, {distinctive_features}, {expression}, moody practical lighting, grounded dark fantasy, expressive face, consistent silhouette, no text, no watermark.
```

Negative:

```text
text, watermark, celebrity likeness, copyrighted character design, extra faces, distorted hands, mismatched eyes.
```

### `location-study`

Purpose: environmental still focused on layout, landmarks, and atmosphere rather than an action beat.

```text
Dark fantasy location study of {location}, {landmarks}, {lighting}, {mood}, rich material texture, grounded scale cues, no text, no watermark.
```

Negative:

```text
text, watermark, map labels, UI framing, modern signage, oversaturated neon, duplicated architecture.
```

### `item-clue`

Purpose: close-up prop shot for clues, relics, loot, and handout-style reveals.

```text
Detailed close-up of {object_name}, {material_detail}, {context_detail}, dramatic side lighting, grounded dark fantasy prop study, no text, no watermark.
```

Negative:

```text
text, watermark, floating UI, modern packaging, duplicate objects, toy-like proportions.
```

## Safety Notes

- Avoid real player likenesses unless explicitly approved.
- Avoid copyrighted characters, logos, or proprietary setting references.
- Keep prompts aligned with the active content rating.
- Keep GM-only reveals, hidden threats, and unrevealed clues out of player-visible image prompts.
