# Branding

Black Dice Engine uses a black-and-gold d20 as its primary project mark, a clean presentation banner, and a separate info-pitch banner.

## Primary Project Mark

```text
docs/assets/branding/black-dice-engine-d20-lowres.png
```

Use the low-resolution d20 asset for:

- quick-loading docs pages
- issue/project board visuals
- dice roller visual reference
- icon-style thumbnails where the detailed mark remains readable
- places where a square-ish mark works better than a wide banner

This remains the default project mark, but it is no longer the main README hero.

## Presentation Banner

```text
docs/assets/branding/black-dice-engine-banner.png
```

Use the banner for:

- portfolio hero image
- project showcase thumbnails
- release headers
- demo video title card
- pitch deck title slide
- documentation landing pages
- GM dashboard splash screen

This is the cleaner title-led banner. Use it for:

- README hero art
- GitHub social preview image
- portfolio hero image
- project showcase thumbnails
- release headers
- demo video title card
- pitch deck title slide
- documentation landing pages
- GM dashboard splash screen

## Info-Pitch Banner

```text
docs/assets/branding/black-dice-engine-banner-info-pitch.png
```

Use the info-pitch banner for:

- portfolio case study sections
- pitch deck overview slides
- project pages that need feature callouts
- social posts or showcase images where the UI concept helps explain the product

Treat the info-pitch banner as concept and product-story art, not as a literal shipped UI screenshot. Future real screenshots should be labeled separately.

## Canonical Asset

```text
docs/assets/branding/black-dice-engine-d20.png
```

This is the high-resolution source art for the d20 mark.

## D20 Web/Preview Asset

```text
docs/assets/branding/black-dice-engine-d20-lowres.png
```

Use either the source or low-resolution version, depending on size needs, for:

- documentation art
- release notes and demo pages
- local lobby or main menu background
- dice roller visual reference

## Small Icon Guidance

The canonical d20 is detailed and works best at medium or large sizes. For small icons, favicons, tray icons, and phone home-screen icons, create a simplified derivative:

- black d20 silhouette
- gold `20` or `BDE` mark
- fewer ornamental details
- strong contrast at 32px to 128px

Do not use the full detailed key art directly where it becomes unreadable.

## Repository Boundary

This branding image is public project artwork and may live in `docs/assets/branding/`.

Do not place generated campaign art, private table art, player character references, adult/private assets, or ComfyUI outputs in this branding folder.

## GitHub Setup Note

After publishing the repository, set the GitHub social preview manually in the repository settings using `docs/assets/branding/black-dice-engine-banner.png`. Git cannot configure that repository setting by itself.
