# Dice Rolling And Presentation

Black Dice Engine should separate dice truth from dice presentation.

## Decision

The internal dice service owns roll parsing, roll execution, roll history, visibility, idempotency, and state-event integration.

External 3D dice tools may present rolls, but they should not become the only source of truth for campaign mechanics.

## Initial Presentation Adapter

Use dddice as an optional first-pass visual dice presentation layer.

Initial behavior:

- use dddice free/default dice themes first
- do not require custom Black Dice Engine dice art for MVP
- do not block the playable LAN loop on dddice integration
- keep rolls logged in the local database
- keep player-visible and GM-only roll visibility in Black Dice Engine

Later behavior:

- create a Black Dice Engine dice theme with black metal, antique gold numbers, gothic engraving, and optional crit/fail effects
- explore dddice theme editor/API for custom dice
- keep a local/open-source fallback renderer for offline/local-first play

## Truth Layer

The dice service should eventually support:

- notation parsing such as `1d20+5`, `2d20kh1`, and damage expressions
- advantage/disadvantage
- private GM rolls
- player-visible rolls
- contested checks
- roll history
- idempotency keys so reconnects do not duplicate rolls
- links from rolls to state events

## Presentation Layer

The presentation layer may show:

- 3D dice animation
- roll sounds
- critical success/failure effects
- player-specific dice colors later
- Black Dice Engine branded dice later

If the presentation layer fails, the numeric roll should still complete and display in the roll log.

## Privacy And Secrets

Do not commit dddice API keys or user account tokens.

If dddice requires account configuration, store it in a local `.env` file or local user settings outside Git.
