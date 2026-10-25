# Archived planning snapshot

Retained for historical acceptance criteria; current priorities and known gaps are in [the Claude handoff](../CLAUDE-HANDOFF.md). Checkbox states reflect the original work log, not a fresh acceptance review.

# Black Dice Engine overhaul and Party Mode plan

Immediate scope is now the short [PARTY-PLAN.md](../../PARTY-PLAN.md). This document is the deferred overhaul backlog; stop feature/refactor work for the party and leave unverified acceptance items unchecked.

Status: implementation in progress. Prepared October 24, 2026 from the supplied product context and repository review. Completed boxes have evidence in [docs/overhaul-progress.md](../../docs/overhaul-progress.md); existing TODO checkmarks remain historical claims unless independently verified.

Build one complete, dependable Party Mode first, then use that working game to guide the wider engine refactor. Preserve the TTRPG experience. The near-term target is a Windows handheld/PC connected to a TV, with 6–7 simultaneous phone players and a 20–30-minute session. A short live-demo deadline should reduce scope, not trigger a whole-repository rewrite.

This document distills product and engineering implications only. The original pasted conversation, personal details, and unrelated party arrangements remain outside the repository. Execution is now authorized; this does not authorize dependency installation, cloud services, or migration of real campaign data.

## Product outcome and priorities

| Priority | Outcome | Completion evidence |
| --- | --- | --- |
| P0 | A complete Party Mode works without AI, image generation, TTS, or an internet connection | One host and seven phone clients finish a rehearsed game using prepared content |
| P0 | Phones are private controllers; the TV is a public display | Network-level checks show that unrevealed choices, private objectives, host credentials, and GM notes never reach other viewers |
| P0 | Concurrent actions, disconnects, and retries do not corrupt the round | Duplicate, late, conflicting, and resumed requests produce explicit, consistent outcomes |
| P1 | Engine responsibilities become easier to change and verify | Party Mode and the preserved TTRPG flow share proven infrastructure without sharing private state indiscriminately |
| P1 | Windows setup, persistence, errors, and recovery are dependable | Documented startup and restore rehearsals work with disposable demo data |
| P2 | AI, audio, media, richer content, and presentation improve the experience | Optional capabilities can fail or be disabled while a complete game still works |

## Current evidence and implications

These observations come from source inspection, not a running-system audit. Paths and behavior must be rechecked when implementation begins.

| Current evidence | Implication for the overhaul |
| --- | --- |
| `apps/gm-dashboard/src/App.tsx` is about 135 KB; `services/game-server/src/index.ts` is about 132 KB | Extract around responsibilities and observed friction, with characterization checks; file size alone does not determine the design |
| Both apps patch `window.fetch` to add a role header; `extractRoleFromRequest()` accepts that header/query value; WebSocket roles come from the URL | Role declarations are not authenticated identities; local session authority is an early requirement |
| `getSessionSnapshot()` returns campaign context, approval queues, memory, and a hard-coded table PIN; initial connections and `broadcast()` share snapshots | Private phone choices require server-side projections for host, public display, and individual players before live use |
| `persistState()` runs every 30 seconds and on shutdown; request-response deduplication is in memory | Acknowledged actions and resolved rounds need explicit durable commit boundaries and restart-safe idempotency |
| `/api/rolls` has two GET registrations with different response shapes | Capture actual route behavior and remove ambiguity deliberately when extracting handlers |
| SQLite opens during `db.ts` import; several prompts/assets resolve relative to source files | Tests and moves can accidentally open the wrong database or break resources; inject configuration and isolate initialization |
| Root npm workspaces include `apps/*` and `services/*`, but not `packages/*` | Shared packages need deliberate workspace/build wiring; the schema directory is not already an importable package |
| Service configs inherit `noEmit: true`; root build/lint use `--if-present` | Verify what builds actually emit and which workspaces participate before designing a production launcher |
| `start-session.bat` contains absolute paths, suppresses build output, and always starts external ComfyUI | Add a portable lightweight launch profile and visible failures; do not use this launcher for routine verification |
| The player companion uses Vite `base: "./"` and is served under `/player/` | Preserve development proxies and built asset/navigation behavior during app changes |
| `tests/README.md` is a placeholder; older docs mix planned and implemented capabilities | Establish a small executable verification baseline and reconcile documentation with evidence |

Relevant existing guidance: [AGENTS.md](../../AGENTS.md), [architecture](../../docs/architecture.md), [core architecture](../../docs/decisions/core-architecture.md), [runtime reliability](../../docs/decisions/runtime-reliability.md), [player companion](../../docs/decisions/player-companion-strategy.md), [latency policy](../../docs/decisions/latency-and-performance-policy.md), and [project skills](../../docs/agent-skills.md).

## Delivery sequence and scope control

Critical path: **baseline → trusted sessions and private projections → authoritative party loop → TV/phone experience → rehearsal**. Broader package/layout cleanup follows a working slice. Extract only the modules needed to make the early slice safe and testable.

| Stage | Depends on | Delivery boundary |
| --- | --- | --- |
| 0. Baseline | None | Known behavior, demo fixtures, and explicit implementation scope |
| 1. Session/state foundation | 0 | Trusted identity, audience filtering, durable commands |
| 2. Party game loop | 1 | Complete headless game with prepared content |
| 3. TV and phones | 2 | One playable end-to-end UI slice |
| 4. Lightweight release rehearsal | 3 | Go/no-go decision based on a complete rehearsal |
| 5. Root/shared-code refactor | Stable slice from 4 | Portable, coherent workspace and resource layout |
| 6. Engine and TTRPG separation | 5 | Two verified modes using a small shared runtime |
| 7. Optional capability improvements | 6, except small necessary fixes | AI/media/audio remain optional and bounded |
| 8. Maintenance and release workflow | Incremental; finalize after 6 | Repeatable checks, current docs, and recovery procedures |

If time runs short, retain preset choices, prepared narration, plain dice results, and simple scoring. Cut secret objectives, free-form actions, elaborate animation, optional audio, and generated content before cutting privacy, authoritative state, recovery, or the ability to finish a game. Do not take an untested mode to the event merely because a deadline exists.

## Stage 0 — Establish a safe, truthful baseline

- [x] **BASE-01:** Inventory the implemented apps, service entrypoints, routes, WebSocket messages, persistence helpers, timers, external calls, and startup scripts. Distinguish working behavior from planned service README placeholders.
- [x] **BASE-02:** Run existing workspace lint/build checks with installed dependencies; record failures, participating workspaces, actual emitted artifacts, and Windows/Node/native SQLite compatibility. Do not install or upgrade dependencies as an incidental repair.
- [x] **BASE-03:** Define an isolated synthetic demo session and explicit temporary database/output paths. Audit initialization before importing or starting services; keep existing `_data`, real campaigns, model folders, and external asset stores untouched.
- [x] **BASE-04:** Characterize the existing join/claim, roll, state approval, snapshot, reconnect, and summary-export behavior at meaningful interfaces. Include the duplicate roll-route behavior and current failure cases rather than silently treating them as desired contracts.
- [x] **BASE-05:** Write the first Party Mode rules in a short demo-safe design note: player count, five-round starting format, simultaneous submission, timeout/default action, deterministic resolution order, scoring/danger, and ending conditions. Rehearsal determines whether five rounds fit 20–30 minutes.
- [x] **BASE-06:** Map new work to this plan and reconcile relevant `TODO.md` items as they are verified. Keep existing TTRPG work visible instead of replacing its roadmap wholesale.

Gate: known baseline, disposable test setup, agreed working rules, and explicit separation between verified behavior and assumptions.

## Stage 1 — Trusted local sessions and private state (P0)

- [x] **CORE-01:** Extract only the configuration, session authorization, view projection, and command-commit seams needed for the party slice. Keep one coordinating game-server process and the current stack.
- [x] **CORE-02:** Introduce server-issued local session credentials and membership. A room code/PIN admits players; a separate host capability grants controls. Client IDs, role headers, role query parameters, and LAN IP addresses do not grant authority.
- [x] **CORE-03:** Define join, resume, revoke, room expiry, and new-game credential behavior. Bind the same authenticated identity to HTTP requests and WebSocket connections; redact credentials and avoid raw tokens in join URLs, exports, or diagnostics.
- [x] **CORE-04:** Add explicit host, public-display/spectator, and per-player projections. Filter before serialization on initial join, REST reads, reconnect, broadcasts, error messages, and exports. Apply the policy to existing endpoints as well as new party routes.
- [x] **CORE-05:** Remove the hard-coded PIN from shared snapshots. Validate character/seat ownership on the server; reject cross-player claims/actions and attempts to impersonate host/admin.
- [x] **CORE-06:** Define versioned command/event/snapshot contracts with `sessionId`, mode, round/stage identifiers, actor identity, request ID, and revision where appropriate. Validate incoming data at runtime; schema files and TypeScript casts alone do not enforce a contract.
- [x] **CORE-07:** Scope idempotency to session, authenticated actor, command kind, and request ID. Reusing an ID with a different payload produces a conflict; replaying an accepted request returns its prior result without reapplying effects.
- [x] **CORE-08:** Persist the state transition, recorded random outcomes, revision, and idempotency result atomically before acknowledging and broadcasting. On persistence failure, keep the authoritative prior state and surface an actionable host error.
- [x] **CORE-09:** Add denial/leakage checks for forged roles, another player's credentials/seat, stale sessions, spectators, hidden fields, unauthenticated WebSockets, and replayed requests. Observe actual response/frame payloads, not only rendered DOM.

Gate: an ordinary phone or public display cannot obtain host authority or another player's hidden state, and an acknowledged synthetic command survives restart without duplicate effects.

## Stage 2 — Complete Party Mode without AI (P0)

Target flow: `lobby → briefing → choosing → locked → reveal → resolving → round summary → choosing or ending`. Pause is host-controlled metadata that freezes deadlines; it must not create an alternate way to apply a round twice.

- [x] **PARTY-01:** Add a party session model with roster, active participant set, round/stage, deadline, choices, reveal status, recorded rolls, shared outcome/score, and ending status. Keep authoritative state on the server.
- [x] **PARTY-02:** Implement lobby join, unique player labels, ready state, host start, and a bounded 6–7-player configuration. Let the host participate through a normal player seat while keeping host authority separate, so no extra dedicated GM is required. Define when late arrivals may enter: lobby or the next round, never silently midway through locked choices.
- [x] **PARTY-03:** Add a small, original scenario pack with prepared openings, preset choices, consequences, round summaries, and endings. Use generic demo characters; no real names, imported campaign notes, or copyrighted adventure text.
- [x] **PARTY-04:** Accept simultaneous private choices with explicit acknowledgement. Allow a player to replace an unlocked choice; record only one final choice per participant and round.
- [x] **PARTY-05:** Freeze the required participant set when a round begins. Resolve all-submitted, server deadline, and host force-lock through one atomic transition so racing triggers cannot double-lock or double-resolve.
- [x] **PARTY-06:** Define a visible default/pass action for missing submissions, disconnects, and timeouts. The host can extend, pause, resume, or skip according to rules; phones do not authoritatively advance timers.
- [x] **PARTY-07:** Reveal choices only after lock and according to the chosen reveal sequence. Before reveal, expose only permitted aggregate readiness; do not leak secret choices through event logs, public animations, or AI prompts.
- [x] **PARTY-08:** Resolve actions in a stable documented order using authoritative recorded dice and explicit rules. Persist each outcome once; replay/restart reuses outcomes rather than rerolling.
- [x] **PARTY-09:** Implement the simplest scoring/danger model that makes choices matter, with tie handling, early termination if applicable, final results, and a clear restart/new-game path. Avoid requiring full character creation or a complete TTRPG ruleset.
- [x] **PARTY-10:** Persist the complete party lifecycle, including active phase, locked submissions, resolved outcomes, and deadline/pause state. On restart, require a deliberate host resume policy rather than expiring multiple rounds in the background.
- [x] **PARTY-11:** Verify a complete headless game, seven concurrent submissions, duplicate/late/out-of-stage commands, disconnect/resume, restart during lock/reveal/resolution, and end/new-game isolation.
- [x] **PARTY-12:** Treat secret roles/objectives and free-form actions as follow-up options. If added, keep objectives private and resolve custom text through explicit bounded rules or host adjudication; AI must not be required for progress.

Gate: a host plus seven synthetic players can finish from lobby to ending with all optional services disabled and with stable results after retries or restart.

## Stage 3 — Shared TV, private host controls, simple phones (P0)

Proposed first implementation: keep the two existing app workspaces. Add a public-display entry/route to the dashboard app and mode-specific views to the companion. A third display app is a later option only if measured build/ownership needs justify it.

- [x] **UX-01:** Separate the host control surface from the TV display. The TV shows public scene text, room join information, readiness counts, reveal, recorded dice, and public results; it never mounts a GM-data-powered view and hides its panels with CSS.
- [ ] **UX-02:** Establish the display's read-only session identity and public projection. Test mirror versus extended-display operation so private host windows cannot accidentally become the shared screen.
- [ ] **UX-03:** Build a distance-readable TV layout with restrained motion, strong contrast, concise round instructions, and enough space for seven players. Test the actual TV/display scaling before calling it ready.
- [ ] **UX-04:** Build the phone flow: scan QR or enter short LAN URL/code → choose display name → join/ready → see choices → submit/update → receive acknowledgement → wait/reveal → see result.
- [ ] **UX-05:** Keep one prominent action per phone state, usable touch targets, accessible labels/focus, reduced-motion support, text alternatives to audio/dice animation, and clear error/recovery messages.
- [ ] **UX-06:** Display connection, pending/accepted submission, stale round, timeout/pass, and reconnect state explicitly. Restore the same seat and accepted choice after refresh or phone sleep without automatically stealing another character.
- [x] **UX-07:** Add host start, pause/resume, deadline extension, force-lock/pass, advance, ending, and restart controls with safeguards proportional to their consequences. Keep these off the public display.
- [x] **UX-08:** Replace global fetch patches with an explicit session-aware request client, preserving pending request IDs and error semantics. Extract reusable connection lifecycle logic without coupling React rendering to authoritative game rules.
- [ ] **UX-09:** Verify the built companion under `/player/`, the new display route, QR joining, development proxies, refresh/navigation, missing assets, and expired credentials on real mobile browsers.

Gate: one complete demo session works through rendered host/TV/phone flows, and network inspection confirms private data stays on the intended device.

## Stage 4 — Lightweight Windows launch and live rehearsal (P0)

- [x] **RUN-01:** Add a documented Party profile that starts only the required server and built web surfaces. AI narration, ComfyUI, generated audio/video, TTS model loading, and their polling/submission paths are disabled by default, not merely hidden.
- [x] **RUN-02:** Make the launcher resolve the repository from its own location, show build/start failures, check ports, and stop only processes it owns. Preserve the existing launcher until its replacement is verified.
- [x] **RUN-03:** Resolve the inherited `noEmit` service-build behavior and choose a verified startup command. Do not assume a successful `tsc` invocation produced runnable server JavaScript.
- [x] **RUN-04:** Serve the required built TV/player/host assets without relying on development-only ports or internet CDNs. Make local bind versus intentional LAN exposure explicit; document scoped Windows firewall setup without weakening the firewall globally.
- [x] **RUN-05:** Provide a host checklist for power, dock/HDMI, TV scaling/audio, phone charging, same-network connectivity, displayed LAN address, and guest Wi-Fi client isolation. Include a manual join address when QR fails.
- [ ] **RUN-06:** Test with seven independent clients and at least two physical phones where available. Rehearse one full 20–30-minute session on the intended host/display; simulation alone does not prove room Wi-Fi or mobile sleep behavior.
- [ ] **RUN-07:** Exercise a sleeping phone, refresh during submission, repeated taps, host pause, Wi-Fi loss/rejoin, server restart, absent AI/media/audio services, and a failed persistence write using disposable data.
- [x] **RUN-08:** Measure command-to-acknowledgement and public state-update latency under seven-client load. Start with the existing under-one-second state-update target; report observed p95/max and hardware/network conditions rather than assuming handheld performance.
  Evidence: five rounds, seven concurrent players plus host/display, 75 measured acknowledgements and delivery to all nine sockets. Isolated loopback source p95/max: acknowledgement 20.30/22.65 ms, delivery 20.07/22.34 ms on Node 24.13.0/Windows/Ryzen 5 7600X3D. [Conditions and limits](../../docs/diagnostics.md); physical Wi-Fi/browser acceptance remains RUN-06/QA-02.
- [ ] **RUN-09:** Keep a rehearsed working build and demo database snapshot, document recovery/new-game steps, and freeze nonessential changes before live use. If the complete-loop/privacy gate fails, use the fallback activity instead of improvising a last-minute rewrite.

Live-demo gate: a full offline/optional-services-disabled game passes rehearsal, private data remains private, retries/reconnect work, and a host can recover without editing files or running a database command.

## Stage 5 — Root layout, shared contracts, and frontend refactoring (P1)

- [x] **ROOT-01:** Review maintenance hot spots after the vertical slice. Compare candidate extractions by caller simplicity, behavior ownership, and testability; prioritize real duplication rather than a target number of files or services.
- [x] **ROOT-02:** Introduce `packages/*` workspace membership only as actual shared packages gain manifests and real consumers. Plan candidate `packages/contracts` and browser-safe client helpers; keep `packages/shared-schemas` references and IDs stable or migrate them explicitly.
- [ ] **ROOT-03:** Establish one maintained contract source with runtime validation and TypeScript consumption. Evaluate existing tools before proposing a new validator/generator dependency; get approval before adding one.
  Progress: shared TTRPG host types now replace the dashboard/server copies, with audio types reused by the audio service. Bootstrap, host WebSocket frames, reports/logs and save/scene/memory confirmations validate nested values. Table/media, scene/draft, audio and character response paths now adopt the shared guards too; malformed confirmations retain prior state and pending IDs. Generated memory beats now agree across producer, shared enum, server validator and schema, restoring all three scene queues. AI proposal/toggle responses now validate too; structured proposals have a maintained schema and explicit confirmed host application. The server audio-cue path now validates library and matching playback confirmations with a ten-second deadline, shared concurrent requests and shutdown cancellation. Comfy prepare/submit/status now share a validated router job contract; polling reads the actual nested/comfyStatus envelope, checks identity and ignores duplicate/stale completions. Remaining optional-service/persistence consumers, typed producers and full JSON Schema parity keep ROOT-03/04 open. See [contracts](../../packages/contracts/README.md).
- [ ] **ROOT-04:** Remove duplicated app/server protocol types and share stable WebSocket envelopes, identifiers, error shapes, and audience-specific contracts. Never import Node filesystem, server configuration, SQLite, or private prompts into browser packages.
- [ ] **ROOT-05:** Split dashboard concerns into the application shell, host/session controls, public display, party views, TTRPG panels, connection hooks, and optional capability panels. Keep mode-specific state out of generic layout components.
  Progress: code split finished: App composes focused host/session, connection, reports, narration, gallery, media/audio, character/table and scene/AI owners; Party/public display remain separate. All 64 source/emitted-service tests and eight workspace lint/build checks pass. Checkbox remains open for rendered acceptance under the shared definition of done; browser use is currently disabled. Continue ROOT-03/04 meanwhile. [Ownership and verification](../../docs/dashboard-refactor.md).
- [x] **ROOT-06:** Split companion concerns into join/resume, transport, party controller, TTRPG sheet, dice presentation, and focused UI components. Preserve pending-request/reconnect behavior through each extraction. Evidence and rendered-check limits: [companion refactor](../../docs/companion-refactor.md).
- [x] **ROOT-07:** Consolidate genuinely shared dice/audio presentation with explicit resource ownership and cleanup. Keep authoritative roll generation in the server; keep phone audio optional and prevent duplicated playback on rerender/reconnect. Evidence and rendered-check limits: [shared dice presentation](../../docs/shared-dice-presentation.md).
- [x] **ROOT-08:** Centralize validated configuration and resource-path resolution. Preserve the intended database location when moving modules; remove hard-coded external paths and bogus fallback paths without moving or deleting existing user data. Evidence: [runtime configuration](../../docs/runtime-configuration.md), [full startup](../../docs/full-session-launch.md), [retired helper audit](../../docs/script-retirement.md).
- [x] **ROOT-09:** Verify ESM/NodeNext imports, app TypeScript settings, service emission, workspace build order, asset paths, and source/built prompt lookup. Update `.env.example` documentation without reading or editing the private `.env`. Evidence: [runtime configuration and build verification](../../docs/runtime-configuration.md).
- [x] **ROOT-10:** Retire one-off rewrite helpers and obsolete scripts only after checking callers and documenting replacements. Preserve intentional demo content, licenses, and agent-skill provenance. Evidence: [caller review and replacements](../../docs/script-retirement.md).

Gate: every included workspace is explicitly verified; both apps and the lightweight launcher still work after relocation/extraction; shared packages have useful consumers and clean browser/server boundaries.

## Stage 6 — Engine services and a proven game-mode interface (P1)

Candidate server organization: bootstrap/config, local identity, command handling, persistence, audience projections, HTTP routes, WebSocket delivery, mode logic, and optional adapters. Keep these as modules inside the game-server process unless deployment isolation has a demonstrated benefit.

- [ ] **ENGINE-01:** Extract `index.ts` responsibility by responsibility, preserving middleware/route order and observable response shapes. Resolve duplicate routes with intentional compatibility decisions and client updates.
  Progress: table reads and host summary/export formatting now have focused owners with injected readers/clock and explicit export paths. The unreachable second GET roll handler is removed; the first compact response remains compatible and existing app POST/snapshot consumers need no migration. Source/emitted synthetic checks cover authentication, projections, export failure and no non-host disk writes. Remaining mutations, context/capabilities and socket delivery keep this task open. [Extraction boundaries](../../docs/server-refactor.md).
  State event application/summarization and approval routes are now extracted too, retaining the existing transaction/deferred-effect boundary. Shared event validation blocks malformed queued initiative from clearing a sheet. Source/emitted fixtures verify state kinds, approval rollback with no memory export, retry/rejection/restart and malformed persisted proposals. Character/claim/roll/control and remaining context/capability/socket responsibilities keep the checkbox open.
  Character creation and claim/release handlers now have focused installers at their original route positions. Source/emitted fixtures verify defaults/validation, identity/note privacy, atomic creation/switch/release failure, stale revision races and old-claim replay after reassignment without reclaiming. Roll/control, context/memory, capabilities and socket delivery remain.
  Action, narration-toggle, scene/save and roll handlers now share a focused route installer at their original position. Accessors retain the existing rollback-owned controls; real-server verification covers final-roll/action/narration atomic rollback and exact restart replay. Optional side effects remain deferred through the existing command boundary. Context/memory, capability orchestration and socket delivery keep ENGINE-01 open.
- [ ] **ENGINE-02:** Define a small mode interface from the working Party Mode and existing TTRPG needs: initial state, validated commands, state transitions/events, allowed actions, audience projections, and completion. Keep transport and SQLite outside mode rules.
- [ ] **ENGINE-03:** Move party rules into the first mode implementation; adapt the existing TTRPG flow as the second consumer before declaring the interface reusable. Avoid speculative plugins or a general scripting framework.
- [ ] **ENGINE-04:** Extract shared membership, dice, ordered command application, revision checks, persistence, and filtered delivery. Keep party secrets, objectives, and scoring inside party logic; keep TTRPG approvals, characters, and campaign canon inside TTRPG logic.
- [ ] **ENGINE-05:** Namespace stored state/events, request IDs, timers, and caches by session/mode. Define explicit new-session and mode-switch behavior that cannot reinterpret party data as campaign state.
- [x] **ENGINE-06:** Add versioned, non-destructive database migrations and synthetic migration fixtures. Review backup/restore and compatibility before any separately authorized migration of real data.
  Evidence: a shared checksummed migration runner atomically adopts compatible legacy/authority/command schemas without rewriting records; incompatible, foreign and future versions fail closed. Six source/emitted fixtures cover rollback, exact records/credentials/receipts, compatible extra columns, WAL-aware online backup and independent disposable restore. [Compatibility and backup review](../../docs/schema-migrations.md) identifies the existing runtime direct-copy limitation. No real data was accessed or migrated; full product backups remain CAP-10.
- [x] **ENGINE-07:** Add bounded event/history retention and restart-safe command replay. Keep enough durable outcome data for recovery without treating the current truncated UI logs as a complete audit journal.
  Evidence: the private journal retains 5,000 commit envelopes globally by insertion order at startup/commit; trimming shares the command transaction and history windows report truncation. Exact receipts, fingerprints, checkpoints and outcomes remain durable independently. Five source/emitted cases cover global bounds, failed retention rollback, Party resolution replay without reroll/publication, and actual-server restart with an evicted roll envelope. [Policy and limits](../../docs/command-history.md): metadata is bounded, total database size is not; no user/domain records or files expire.
- [x] **ENGINE-08:** Inject clock, randomness, repository access, and optional adapters where isolation changes testability. Remove import-time database/model side effects from testable domain modules and close owned timers/sockets on shutdown.
  Evidence: import-safe explicit/injected stores preserve the command transaction and repair required asset status persistence. The lifecycle owner injects time, scheduled work and service transport; TTRPG dice accept deterministic samples. All four intervals and owned HTTP/WebSocket/audio/request work stop before final persistence/store close, with bounded drain and a nonzero outcome on save failure. Source and emitted actual-server shutdown checks pass with an authenticated socket and stalled synthetic audio request. [Store](../../docs/game-store.md), [lifecycle and dice](../../docs/server-lifecycle.md). Session/revision-bound generation during ordinary gameplay remains CAP-02/05.
- [ ] **ENGINE-09:** Rehearse the original TTRPG path after each extraction: join/claim, roll, propose/approve state, update sheets, reconnect, and export a filtered summary.

Gate: both modes run through the same small infrastructure, preserve distinct rules/privacy, and pass behavior-based recovery and compatibility checks.

## Stage 7 — AI, content, media, audio, and operational quality (P1/P2)

- [x] **CAP-01:** Make capability flags and health status explicit per runtime profile. Distinguish disabled, configured, reachable, ready, busy, and failed; a configured URL alone is not a successful health check.
  Evidence: additive capability observations carry enabled/configured flags, explicit state and check time; bounded shared refresh probes AI model advertisement and audio/router/TTS identity/readiness. URLs alone remain configured; observations expire, errors are generic, Party makes no probes, and only the host can refresh. Five source/emitted fixtures include dashboard labels and privacy. [Readiness meaning and limits](../../docs/capability-health.md).
- [x] **CAP-02:** Put narration behind a bounded timeout/cancellation interface with prepared fallback text. Bind a response to its session/round/revision and discard stale completions after advancement, reset, or cancellation.
  Evidence: automatic roll narration and host drafts share a ten-second whole-completion owner with two replaceable slots, caller/shutdown cancellation and session/mode/round/stage/revision checks. Five source/emitted cases cover ignored abort, every scope dimension, reset/advancement, current results and no generation on receipt replay. [Behavior and limits](../../docs/narration.md). Comfy/TTS consolidation and audible playback remain CAP-05/09.
- [x] **CAP-03:** Validate structured AI outputs against contracts, redact logs, and preserve audience/source labels in prompt assembly. AI may suggest prose or proposed events; it cannot decide authoritative rolls, private visibility, scores, or canon without the mode's validation/approval path.
  Evidence: structured actions retain strict parsing and explicit validated host application. Four input builders share audience-aware source assembly; public narration excludes private/player-only events and inherits fact-container visibility, while GM guidance preserves source labels. Wrong-audience narration is refused before transport. Canary, actual route, maintained-prompt and state-authority fixtures pass against source/emitted services. [Policy and limits](../../docs/diagnostics.md).
- [x] **CAP-04:** Keep optional remote providers explicitly opt-in. A provider selector or fallback must not send private local campaign context to a cloud endpoint automatically.
  Evidence: selected non-loopback AI endpoints (including LAN/Ollama and OpenAI defaults) require `BDE_ALLOW_REMOTE_AI=1`; Party overrides consent and makes no calls. Transport rejects redirects and never switches providers after failure. Pure configuration checks and nine isolated fake-fetch source/emitted adapter environments verify refusal before transport and selected-provider behavior. [Policy and limits](../../docs/runtime-configuration.md#remote-ai-consent). No cloud service was enabled or contacted.
- [x] **CAP-05:** Remove direct scattered ComfyUI/TTS calls from gameplay handlers. Route optional work through adapters with bounded queues, cancellation, deduplication, and late-result handling; Party profile must make zero generation calls when disabled.
  Evidence: speech, automatic scene submission and manual router requests now have bounded admission/deadlines, deduplication, scope/shutdown cancellation and late-result checks. Manual submission records durable admission before network work, survives restart without resubmission, and persists confirmed router IDs. Host controls explain uncertain attempts. 142 source/emitted tests pass; real GPU cancellation, approved serving and audible playback remain CAP-06/07/09. See [optional work](../../optional-work.md).

- [ ] **CAP-06:** Keep media generation asynchronous and audio cached/prepared. Reserve GPU-heavy work for explicit prep/full profiles; measure on the actual host instead of inheriting a desktop VRAM assumption for the handheld.
- [x] **CAP-07:** Restrict asset serving to approved visible records; validate paths and content types and avoid exposing an entire external output directory. Keep generated files, local libraries, and models outside Git and outside this refactor's write scope.
  Evidence: raw `/images` serving and directory enumeration are removed. Approved-record content requires session credentials, audience checks, canonical root containment and type/signature/size validation; approval is host-only and durable. Gallery images use authenticated reads with owned blob URLs. Synthetic tests cover traversal/junction escape, malformed/oversized files, approval rollback, role visibility, restart and URL cleanup. Physical rendering remains a separate release gate. See [asset delivery](../../docs/asset-delivery.md).
- [ ] **CAP-08:** Create optional scenario-pack validation and authoring guidance for original/demo-safe content, difficulty, content rating, pacing, safe target selection, and replay variation. Keep content separate from executable game rules.
- [ ] **CAP-09:** Make TTS/music/ambience host-controlled, non-blocking, interruptible, and independently mutable. Support silence, readable text, reduced motion, and browser autoplay recovery.
- [x] **CAP-10:** Add real backup manifests, restore validation, player-safe errors, bounded/redacted diagnostics, and measured resource pressure. Perform restore rehearsals only on disposable copies, with real-data operations separately reviewed and authorized.
  Evidence: online WAL snapshots, published hash/schema manifests, authenticated read-only validation and disposable restore; automatic process start/graceful-end snapshots with failure recovery. Bounded metadata-only logs survive export failure. Host memory/event-loop measurements influence optional admission; GPU remains unmeasured. [Backup limits](../../docs/backups.md), [diagnostic policy and measurements](../../docs/diagnostics.md). No real-data operation was performed.
  Progress: authenticated online SQLite snapshots now include WAL state, checksummed/versioned manifests, bounded listing and read-only integrity/schema validation. Runtime backup requests delegate credentials to the database owner; raw copying and its unauthenticated startup timer are removed. Disposable restoration and denied-player cases pass. Automatic session backups, broader diagnostic bounds and measured resource pressure remain open.

Gate: optional capability failure never prevents a legal command, phase transition, text reveal, reconnect, or game ending.

## Stage 8 — Verification, documentation, and maintainable delivery

- [x] **QA-01:** Establish an executable test command using existing dependencies/built-in facilities where practical. Cover rules, authorization, projections, idempotency, persistence failure/restart, migrations, and stage-transition races; avoid tests that merely mirror filenames or implementation details.
  Evidence: `npm test` runs 112 behavior checks in source and emitted-service modes using existing tools. Rules, authority/projections, exact receipt replay, transaction failure/restart, migrations and concurrent last-choice/lock/deadline behavior have synthetic fixtures. See [verification matrix](../../docs/verification-matrix.md). Browser/device work remains QA-02 and the release gates; CI remains QA-04.
- [ ] **QA-02:** Add an isolated seven-client integration harness and a small browser flow for host/display/phones. Keep synthetic fixtures and ensure failures leave no live database changes or orphaned processes.
- [x] **QA-03:** Document the verification matrix: valid/invalid commands, seven simultaneous users, private-state leakage, timeout/pass, duplicate/conflicting retries, stale revisions, sleeping phone, server restart, optional-service absence, fresh build/start, and preserved TTRPG flow. Evidence and explicit rendered/physical limits: [verification matrix](../../docs/verification-matrix.md).
- [ ] **QA-04:** Add CI checks for participating workspaces and safe fixtures once local commands are reliable. CI must not require private environment files, models, campaign databases, or generated media.
- [ ] **QA-05:** Update README status, architecture, mode rules, schema docs, setup/launch profiles, troubleshooting, and roadmap to describe verified behavior. Replace stale planned-stack/prototype statements without marking untested work complete.
- [ ] **QA-06:** Keep commit/PR scopes small: characterization, foundation fixes, party rules, UI, launch, then broader extraction. Include changed behavior, checks, limitations, and compatibility notes; follow the repository's pre-push disclosure requirements.
- [ ] **QA-07:** Use the project skills selectively: root refactor/design for boundaries; server/contracts for authority and events; UI/navigation/interface review for screens; local AI/media for adapters; verification and simplify-review for each completed slice.

## Shared definition of done

- [ ] The requested slice has an observable user outcome and a focused diff; unrelated cleanup is deferred.
- [ ] Affected workspace checks pass, or specific pre-existing failures and blocked checks are recorded. Root/shared changes also verify all intended workspace participation and emitted artifacts.
- [ ] Behavior checks cover the changed invariant, including relevant failure, privacy, persistence, and reconnect cases.
- [ ] UI changes are inspected in a rendered demo at phone and TV sizes; code-only review and simulated clients are labeled as such.
- [ ] Documentation and contracts match the implementation; the plan's checkbox is checked only after its stated behavior is verified.
- [ ] No private source context, live campaign records, secrets, downloaded models, or generated media are added to Git; no unapproved dependency/runtime/cloud change is bundled in.
- [ ] Recovery/rollback steps are concrete for changes to protocols, paths, storage, or launch behavior; user data is not deleted or migrated implicitly.

## Deliberately deferred

Native phone apps, a 3D game client, public hosting, account providers, remote sync, telemetry, Discord integration, vector/RAG infrastructure, custom model training, and cinematic generation are outside the initial party overhaul. Existing long-term items remain in [TODO.md](../../TODO.md); revisit them after the complete local game and preserved TTRPG mode are dependable.
