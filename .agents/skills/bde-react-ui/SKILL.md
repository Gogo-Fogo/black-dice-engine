---
name: bde-react-ui
description: Implement or refactor Black Dice Engine's React/Vite GM dashboard and mobile player companion, including WebSocket hooks, session state, QR joining, Three.js dice, and browser audio.
---

# GM dashboard and player companion

Read the affected app's manifest, Vite configuration, `src/App.tsx`, and styles. For changes to phone joining or permissions, also read `docs/decisions/player-companion-strategy.md` and `docs/security-and-permissions.md`.

- Preserve the distinction between the GM control surface and the phone-first player view. Hidden GM content must be filtered by the server before delivery; hiding it in JSX is insufficient.
- Trace the current REST calls and WebSocket envelope handling before extracting API clients, hooks, or components. The apps currently duplicate several types; compare them against the server and JSON schemas rather than choosing one copy as authoritative without checking.
- Keep role/session credentials explicit in the relevant requests. If replacing an existing global fetch wrapper, trace all its callers and preserve request options and credential behavior. Do not introduce new global fetch patches.
- Give WebSocket effects clear ownership of sockets, timers, reconnect attempts, and cleanup. Check React development remounts, stale callbacks, duplicate messages, and reconnect snapshots. Preserve the server's request identifiers and version handling where implemented.
- Dashboard extraction is in progress under `src/ttrpg/`; see `docs/dashboard-refactor.md`. Its host connection hook uses the shared `LiveConnection`; read-only diagnostic panels and the dice overlay are separate. Keep host data out of the public Party display and preserve advanced-mode conditions. Host envelope checks are not full nested protocol validation; do not describe ROOT-03/04 or ROOT-05 as complete on that basis.
- Dice animation displays the server's result. It must not generate a second authoritative outcome. Both apps use `apps/dice-presentation.mts` and `apps/dice-audio.mts`; keep overlay-owned models/materials/textures, renderers, listeners, animation frames and per-sound timers explicitly disposed. Late model completion must release resources without reviving a closed overlay. No module-import preload or automatic phone playback.
- Preserve browser audio unlock behavior and GM playback controls. Clean up audio resources and avoid starting repeated ambience loops on rerenders.
- Keep the companion usable at narrow phone widths with touch controls, visible loading/errors, accessible names, and keyboard focus. Check the existing `/player/` built route as well as the Vite development URL when navigation or assets change.
- Prefer the current React/CSS/Three.js stack. New UI libraries, state frameworks, or dependency installs follow the root repository approval rules.

Run the affected app's existing `lint` and `build` scripts. For meaningful UI changes, inspect the demo UI through available browser tools using synthetic session data; do not connect to a real campaign for screenshots. Existing `vercel:react-best-practices` guidance can complement a multi-component change when available; the application remains a local Vite app.
