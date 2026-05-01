# Branding

Black Dice Engine uses a wide concept banner for presentation and a black-and-gold d20 as its project mark.

## Presentation Banner

```text
docs/assets/branding/black-dice-engine-banner.png
```

Use the banner for:

- README hero art
- GitHub social preview image
- portfolio hero image
- project showcase thumbnails
- release headers
- demo video title card
- pitch deck title slide
- documentation landing pages
- GM dashboard splash screen

Treat the banner as concept/key art, not as an exact product screenshot. Future real UI screenshots should be labeled separately.

## Canonical Asset

```text
docs/assets/branding/black-dice-engine-d20.png
```

This is the high-resolution source art for the d20 mark.

## D20 Web/Preview Asset

```text
docs/assets/branding/black-dice-engine-d20-lowres.png
```

Use the low-resolution asset for:

- icon-style thumbnails
- secondary docs art
- issue/project board visuals
- quick-loading docs pages
- dice roller visual reference

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

After publishing the repository, set the GitHub social preview manually in the repository settings using the presentation banner. Git cannot configure that repository setting by itself.
