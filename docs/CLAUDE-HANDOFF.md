# Claude handoff — October 25, 2026

Read `AGENTS.md` first, then this file. This handoff covers the accumulated Party reliability/refactor work, incoming Mac feature adaptations, campaign continuity, character creation and local AI/media upgrades. Historical check counts in other reports describe their own checkpoints; the latest pre-publication source suite is 182 tests.

## Current product and boundaries

- Party Mode is a complete prepared-content host/display/phone game with optional AI/media/audio disabled. It has its own database and launcher. Keep it separate from the full campaign profile.
- Full TTRPG uses `/host/?mode=ttrpg` and `/player/?mode=ttrpg`. The table Stage is `/host/?mode=ttrpg&view=stage`, with a separate spectator identity; `/display/` remains the Party display.
- Host, spectator and player sessions have server-checked credentials. Audience projections, authenticated asset delivery and WebSocket filtering keep GM notes, pending AI drafts, private choices and unapproved portraits out of other clients.
- Durable command receipts, payload-conflict checks and database transactions preserve retries and acknowledged state across restart. Party rounds, pause/resume and reconnects are covered by isolated tests. Backups, diagnostics and measured resource pressure were added.
- No TTS is wanted for the event. Automatic dashboard speech is disabled. Existing explicit speech controls are retained; do not enable/download voice models by default.

## What changed

### Structure and startup

Shared browser contracts live in `packages/contracts`; Node-only runtime configuration lives in `packages/runtime-config`. Apps use extracted hooks/panels; the server uses focused session, command, projection, state, media and campaign modules. Database imports are safe until explicitly opened. Services emit runnable JS with NodeNext paths. Root lint/test prerequisites build the shared packages first.

Use `scripts/party-launch.mjs` / `start-party.bat` for Party, and `scripts/session-launch.mjs` / `start-session.bat` for full sessions. Optional external runtimes are explicit. Five obsolete machine-specific rewriting/download/generation helpers were removed after caller review; see `script-retirement.md`. Skills and their licenses/source notices are in `.agents/skills/`.

### Incoming branches

The phone tab redesign (`629722f`, PR #1), dashboard/TV redesign (`40d5b64`, PR #2), Character Forge (`f30d4c9`) and Dice Styles (`7499bfa`) were manually adapted into the refactored modules before publication. The original branch tips and the two pre-squash UI branches are reconciled in Git history with a deliberate `ours` merge: the working implementation already contains their intended features, while their old unauthenticated route calls and monolithic components must not replace it. This is not a claim that the incoming files were copied verbatim. Archive tags retain feature branch history after integration.

Phone tabs are Play/Sheet/Table/Lore. Dashboard tabs are Stage/Run/Media/Audio/System. Forge has bounded authenticated drafts, three proposals, rerolls, optional flavor and portraits, transactional selection and automatic claim. Six cosmetic dice styles and a practice/calibration lab do not change authoritative server totals. Browser-only imports remain lazy.

Archive tags on GitHub use `archive/feature/<branch-name>-2026-10-25` for `character-forge`, `dice-styles`, `gm-dashboard-tv-scene` and `player-companion-ux-overhaul`. The retired feature branch pointers can be removed after those tags and main are published; all original commits remain reachable. The old `backup/pre-description-rewrite` pointer was preserved separately as the **local-only** tag `archive/local/pre-description-rewrite-2026-10-25`; its historical rewritten lineage was not added to the publication push. No runtime, model, generated output or campaign data was removed during cleanup.

### Campaign continuity and DeepSeek

Actual roll outcomes use the real DC; unknown difficulty stays unresolved. Group context includes all participants. Audience-filtered memory, attempted actions and GM-approved consequences reach AI context. A deterministic progress ledger records objectives, clues, obstacles, milestones and scene completion; completed work is retained across restart. The GM approves authoritative effects; the model cannot freely mutate state.

Director instructions distinguish offered routes from traversed routes, a stalled scene from a closed scene, and an earned payoff from an extra mandatory gate. These controls reduce loops but do not prove reliability over hours of play.

The purchased DeepSeek provider remains active in this PC's ignored configuration. Official DeepSeek requests disable thinking for short interactive replies; empty/token-truncated completions fail with sanitized errors. There are no automatic paid retries/fallbacks. See `deepseek-campaign-live-check.md` for synthetic scenario evidence and limitations.

**Budget:** user authorized $0.50 maximum for this test session. The shared live harness has used all 16 allowed calls: 15 campaign checks plus one Forge flavor request. Conservative usage estimate is $0.0134742; this is not an account invoice. Do not reset reservations or make further paid calls without new authorization. `npm test` uses synthetic providers and does not need API keys.

### Character artwork and mechanics

Only normalized, bounded PNG portraits can become approved references. GM approval controls sharing with companions, other players and Stage. Reference metadata/hash/seed feed later generation. Tests cover permission denial, exact approved bytes, persistence and replay.

Forge's choose endpoint now accepts a bounded 750 KB JSON envelope before Express's default parser; real portraits previously exceeded the default 100 KB body limit. Full-caster and half-caster slots, warlock pact slots, fighter Action Surge availability and hide armor AC were corrected. Existing characters are not rewritten.

These are **quick-start characters**, not complete 5e builds. Since the follow-up below, Forge also adds a deterministic `build`: subclass, SRD background, attacks, spellcasting picks, class features and Ability Score Improvements. Its picks are defaults for GM review. The synthetic table was level five; its saved sheets correctly use that level even though the independent flavor proposal started at level three.

### Local models and image pipeline

Installed official portable Ollama 0.40.11 without replacing the old desktop installation. Installed Qwen3.5 4B and 9B alongside existing models. Added FLUX.2 Klein distilled 4B using existing Qwen3 text encoder and Flux2 VAE; the existing ComfyUI 0.31.0 core supports this workflow. No Python/npm dependency installation was performed. No old models were deleted.

Forge and the workflow registry now use committed Flux2 templates instead of requesting an absent SDXL checkpoint. Reference workflows use `VAEEncode -> ReferenceLatent -> BasicGuider`. Three real 768x1024 portraits completed in 32.3 seconds total including first load. A real reference scene also completed through the router. Likeness and genre details can drift; this is reference conditioning, not guaranteed identity preservation.

An explicit `BDE_DIRECTOR_MODE_MODEL` now actually selects loopback Ollama, with thinking off and unload-after-reply to release GPU memory. Failure does not fall back to paid inference. **Both Qwen variants failed the manual continuity/genre gate** in two synthetic scenarios: they suggested unnecessary access obstacles or unrelated sci-fi complications. The 9B replies took 4.9/4.3 seconds. Leave the director override empty so DeepSeek remains active. A local call with image models resident timed out; shared-GPU scheduling remains a concern.

`scripts/start-local-ai.ps1` starts hidden loopback runtimes from explicit existing paths, preserves occupied ports and downloads nothing. See `local-ai-upgrade-2026-10-25.md` for versions, hashes, startup and evidence. Local models/runtime executables and generated examples are deliberately excluded from Git; a Mac/other PC must configure its own existing tools. Do not assume these Windows paths or models exist there.

## Verification and rollout limits

- Publication checkpoint: root `npm run lint` and `npm run build` passed all eight workspaces; `npm test` passed **182/182** after history reconciliation. Vite retains the documented >500 KB chunk warnings. The restricted sandbox could not connect to isolated localhost servers or create a test symlink; rerunning the same suite outside those restrictions passed in 24.3 seconds. No implementation changes were needed for that environment failure. Earlier, 33 affected checks passed against emitted modules. `git diff --check` also passed after whitespace-only cleanup in newly tracked files.
- Real generation was performed locally with original synthetic characters. Their flavor used one real DeepSeek call and was then replayed for authenticated HTTP/persistence checks. Three images were saved, approved, fetched through spectator credentials and preserved across restart.
- Local-only outputs: ignored `tmp/character-creation-results/sheets.html`, `sheets.json`, three portraits and `reference-scene.png`. HTML renders the actual sheet component statically; it is not an interactive browser test. These artifacts will not appear on GitHub.
- Browser automation is disabled in this Work environment. Actual phone gestures, PNG canvas normalization, responsive layouts, WebGL dice, cellular access and TV/HDMI still need a physical-device smoke test. Earlier Party layout/network checks do not establish the new campaign UI.
- Existing live Party process and approved temporary Cloudflare tunnel were preserved. Changes are not hot-deployed into that process. Its profile deliberately disables campaign inference. Do not start another server on its port or switch databases without a deliberate rollout.

## Recommended next work

1. **Rehearse the full campaign on disposable data and real devices.** Verify host, Stage, two phones, Forge selection/upload/approval, shared portraits, rolls, approved narration/progress and reconnect. Start only explicitly selected services with isolated paths. Do not open real campaign data for a smoke test.
2. **Complete quick-start character choices.** Implement validated spells, subclasses/backgrounds, attacks and ability progression if needed for play; otherwise label the sheets clearly and have the GM review them.
3. **Expand continuity checks.** Test long synthetic sessions, competing objectives, failed checks with alternative routes, payoff delivery and scene transitions. Director prompt assembly currently reuses the scene-packet director prompt as part of short guidance; inspect that contract mismatch before trying another local-model switch. Two scenarios are not a broad model benchmark.
4. **Serialize/schedule GPU work.** Check director/image overlap, cold loads, timeouts and queue cancellation before enabling a local director. The hosted director avoids that GPU competition today.
5. **Improve reference fidelity.** Evaluate several characters across multiple scenes and group shots; preserve the approval/privacy boundary. Do not promise perfect identity or swap to heavier/newer weights without checking VRAM, runtime compatibility and user authorization.
6. **Reduce remaining technical debt deliberately.** Large Vite bundle warnings, some compact UI code, broader CI and deferred acceptance items remain. The original backlog is preserved under `archive/overhaul-plan-2026-10-24.md`; use `../PARTY-PLAN.md` for the short event checklist.

## Safe commands and operational rules

Use existing dependencies: `npm run lint`, `npm run build`, `npm test`. Build contracts/config before direct workspace commands. Never run the paid live harness as a normal test. Avoid default full-session startup during verification because it opens the configured/default persistent database.

Do not commit `.env`, host/display keys, databases/backups, tunnel URLs, original attachments, private campaign sources, generated artwork, downloaded models or portable binaries. Preserve the existing local copies; they are not cleanup targets. A public tunnel URL changes on restart and is not part of the handoff. No pushes should include local access sheets or credentials.

## Follow-up session — October 25, 2026 (Claude)

Rehearsed in a browser on a disposable server (`--data-dir tmp/rehearsal --port 4410`, local ComfyUI only). Covered host, two 375 px phone views, Forge, real FLUX portraits, GM approval, sharing with the other phone and Stage, roll call, roll, reload and server restart. These are browser emulations, not physical devices.

Fixed:
- **Forge UI was unusable on phones.** `forge.css` and `dice.css` used design tokens and primitives (`--surface`, `--line`, `.btn`, `.segmented`, `.chip-row`, `.spinner`, …) that the adapted stylesheet never defined. The global full-width gold `button` style overrode the rest. Role cards rendered dark on dark, and Dice Lab chips were each full width. Tokens are now defined in `styles.css`; `forge.css` restores the primitives and opts `.forge`/`.lab` buttons out of the global style.
- **No manual roll call.** PR #2's "Call for a roll" form was lost in the adaptation, so a DC could only be set by approving an AI proposal. `RollCallPanel` (Run tab) restores it on the existing `/api/set-action`.
- **Phone modifiers ignored proficiency.** `abilityModifier` now adds the proficiency bonus when the called check names one of the character's skills. Example: a level 5 wizard rolling Arcana goes from +4 to +7.
- **Character builds.** `services/game-server/src/character-builds.ts` adds a validated `Character.build` (contracts `isCharacterBuild`), visible only to the owning player. ASIs now raise the primary ability. Sorcerers get Draconic Resilience AC/HP, Bardic Inspiration equals the CHA modifier, and background skills merge into the skill list. Proposal cards show a one-line build summary.
- **Director prompt contract.** Guidance has its own `prompts/director-guidance-prompt.md`. Proposal `action` text is now flagged as public once approved. See `deepseek-campaign-live-check.md` for the second paid authorization (33 calls, about $0.022 of $0.50).

Verification: `npm run lint`, `npm run build`, and `npm test` (183/183) passed, plus forge/service-config against emitted modules.

Still open or noticed:
- A physical phone, TV and LAN rehearsal is still needed.
- Resolved in the readiness pass below: TV display keys in TTRPG mode, heavy dice models on phones.
- The seeded default party in `services/game-server/src/index.ts` uses names such as "J'Epstein" and "Shlomo Ahkim". Review them against the demo-safe content rule.
- GPU scheduling (item 4 above) is unchanged. The director remains hosted, so there is no contention today.
- `.claude/launch.json` defines the disposable `rehearsal` preview and is not committed.

## Readiness pass — October 25, 2026 (Claude)

A second rehearsal used live DeepSeek and local ComfyUI on a loopback-only throwaway server (`--data-dir tmp/rehearsal-ai --port 4411`). It covered: AI proposal approved into a roll call, DeepSeek Forge flavor with real portraits, a phone roll, AI roll narration, director guidance, separate-TV pairing and a restart. About four paid calls.

- **AI roll narration never ran with a hosted provider.** It was gated on the optional `BDE_LOCAL_MODEL_ENDPOINT`, and the test helper always set that endpoint, which hid the bug. Narration now runs when a provider is chosen explicitly (`BDE_LLM_PROVIDER`) or the local-model service is set. An unconfigured install still makes no outgoing calls. Template narration names the called check ("Athletics") instead of its ability.
- **Separate TV device.** Stage → **TV on another device** shows the TV address and a **six-character single-use pairing code**: 10-minute lifetime, burns after five misses, cleared by a new room (`/api/session/display-code` is host-only; `/api/session/pair-display` is unauthenticated). The full display key remains as a fallback. Built for a SteamOS handheld on HDMI, where typing a 43-character key is impractical.
- **Phones show Success/Miss against the DC.** `projectRoll` now passes the public action outcome, and socket roll broadcasts to non-hosts go through the same projection.
- **Expertise** doubles proficiency for the listed skills (rogue Stealth +7 → +10).
- **GM party cards** show an expandable build summary for review.
- **Dice:** Auto now picks the light Tumble style. Classic 3D downloads 10–32 MB per die over the table Wi-Fi.

Verification: lint/build pass; `npm test` 186/186; affected suites also pass against emitted modules. See [party room setup](party-room-setup.md) for the operator checklist.

Host PC note: Windows only allows Node inbound on Private networks. A Wi-Fi profile left as Public blocks phones and the TV.
