# Incoming feature integration

Fetched remote changes and adapted them to the existing refactor:

| Remote revision | Feature | Local integration |
| --- | --- | --- |
| `629722f` / PR #1 | Phone companion tabs | Play, Sheet, Table and Lore retain authenticated sessions, durable commands and the campaign journal. |
| `40d5b64` / PR #2 | Dashboard tabs and TV Stage | Stage, Run, Media, Audio and System wrap extracted panels. The TV and its host preview both fetch with spectator credentials. |
| `f30d4c9` | Character Forge | Four questions, three character proposals, rerolls, optional AI flavor, two local portrait designs per proposal, durable selection and automatic claim. |
| `7499bfa` | Dice Styles | Six cosmetic styles, device preference, practice lab and 3D face calibration. The saved server total remains visible. |

The incoming features were adapted into the refactored modules, replacing their older route/authentication code. Publication reconciles their branch tips with the already adapted implementation; see [Claude handoff](CLAUDE-HANDOFF.md) for the merge strategy and current verification.

## Use

- Host: `/host/?mode=ttrpg`; Stage → **Open on TV** opens `/host/?mode=ttrpg&view=stage` with a separate saved spectator credential. No host credential appears in the URL. Normal `/display/` remains the Party display.
- Phone: `/player/?mode=ttrpg`; Sheet → **Create a new character** or **Dice styles and practice lab**. Direct lab URL: `/player/?mode=ttrpg&lab=dice`.
- Choosing a Forge character releases the player's previous claim and claims the new sheet. A selected generated image is resized and normalized through the same PNG pipeline as uploads. The GM must approve it in Run → Character portraits. Only the approved reference is shared with other players and the TV or pinned into later scene generation.
- The Stage shows only public-approved assets, approved portraits and audience-filtered progress/memory. Private AI drafts and pending narration are never fetched by it. Mark a consequence or memory `public_demo` when it should appear there.
- Automatic dashboard speech is disabled. Narration remains readable; explicit speech controls remain available. The TV does not request TTS.

## Forge behavior and limits

Drafts are persisted in SQLite metadata, expire after two hours, and are scoped to the authenticated member and room. Body-supplied client IDs confer no authority. A member retains at most ten recent drafts with a ten-second creation cooldown and ten rerolls per draft. Selection participates in the existing transactional command receipt: storage failure restores the previous party and exact retries survive restart without duplicate characters.

Character mechanics use the incoming quick-start templates, not a complete level-by-level rules engine; the GM should review higher-level spells, resources and equipment. Flavor accepts only the bounded structure in `packages/shared-schemas/character-forge-flavor.schema.json`; invalid/unavailable AI output falls back to templates. Prompts use a generic public brief rather than private campaign notes.

In the full profile, Forge queues six ComfyUI portraits using the configured Comfy endpoint and the committed FLUX.2 Klein portrait template. The absent SDXL checkpoint dependency was replaced; see [local AI upgrade](local-ai-upgrade-2026-10-25.md). Jobs are polled with bounded requests; provider failures leave character creation available without art. Pending generation interrupted by restart fails visibly instead of polling forever. The Party profile makes no Forge AI or image requests.

Dice styles are presentation only; the lab generates practice values locally and sends no rolls to the server. Three.js loads lazily. Missing WebGL falls back to Tumble, and uncalibrated or missing 3D models use generated numbered dice. Reduced motion preserves the readable result. New renderer resources, animation frames and device listeners have cleanup ownership.

## Verification and rollout

The existing live Party process was not restarted. Use the normal launcher after rebuilding/restarting when ready to load the new server routes. No dependencies were installed during the incoming-feature regression checks. Subsequent separately authorized model provisioning, real GPU generation and paid API checks are documented in [local AI upgrade](local-ai-upgrade-2026-10-25.md).

Verification: all eight workspace lint/build checks passed and the full source suite passed **178/178 tests**, using isolated demo databases and synthetic provider replies. Production builds retain the existing large-bundle warnings. Browser automation is disabled in this Work environment, so real phone gestures, visual layout and GPU animation performance still need a device smoke test.
