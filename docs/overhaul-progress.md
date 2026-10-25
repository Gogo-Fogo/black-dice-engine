# Overhaul progress and baseline evidence



Evidence ledger for [PLAN.md](../PLAN.md). The full 81-task objective remains active. No real campaign database, private environment file, model, or external media store was opened. No dependency was installed or upgraded.



## Baseline slice — October 24, 2026



Windows, Node **v24.13.0**; installed `better-sqlite3` reports SQLite **3.53.0** in memory.



| Check | Before | After |

| --- | --- | --- |

| Root lint | Audio/game-server duplicate path imports; Comfy router missing `negativePrompt` and unavailable `BodyInit` type | All six workspaces pass |

| Root build | Same service failures; both web apps built | All six workspaces pass |

| Service emission | Four configs inherited `noEmit: true` | Four real `dist/index.js` artifacts with NodeNext imports |

| Native SQLite | Unknown compatibility | In-memory query and disposable file tests pass |

| API characterization | No harness | Source and emitted-server flows pass against isolated loopback instances |



Participating workspaces: GM dashboard, player companion, audio service, Comfy router, game server, runtime service. Dice/state/memory/import services have README placeholders, not npm manifests. Python TTS loads models on import and was not started. Both Vite bundles still warn above 500 kB.



## Completed task evidence



| Task | Evidence |

| --- | --- |

| BASE-01 | [Generated source inventory](source-inventory.md): entrypoints, routes, WebSocket hooks/broadcasts, timers, helpers, external calls and startup hazards. Refresh with `npm run inventory`, which never imports services. |

| BASE-02 | Failures and repairs above; six-workspace lint/build; four emitted service files; native SQLite query; source/built API checks. |

| BASE-03 | Tests allocate unique ignored `tmp/*` databases/exports before imports. Child environment is allowlisted; outgoing fetch is blocked. Cleanup closes handles/sockets and terminates only the test-owned child. |

| BASE-04 | `tests/legacy-api.test.mjs` exercises snapshot, role denial/declaration, claim/conflict, roll validation/replay/payload conflict, actual first GET-roll shape, proposal/approval/HP change, WebSocket initial frame/reconnect and isolated Markdown export. |

| BASE-05 | [Original five-round rules](party-mode-rules.md) cover 6–7 seats, simultaneous lock/reveal, default pass, deadlines, immutable seat order, d6, danger/points/ties and endings. Timing requires rehearsal. |

| BASE-06 | PLAN tracks execution. TODO retains TTRPG work; fixed-PIN, declared-role and in-memory dedup claims are reopened or qualified against observed behavior. |

| RUN-03 | Four configs explicitly emit JS. Game-server `start` runs `node dist/index.js`. The API harness launches that emitted entry without a TypeScript loader and checks API/WebSocket/export behavior. Other services and the Party launcher are not yet rehearsed. |



## Baseline defects and subsequent corrections



The baseline exposed the following legacy defects. The session-access slice below replaces insecure characterization expectations with denial/redaction checks; durable command and Party requirements remain open:



- Fixed in session-access slice: unauthenticated snapshots/player WebSocket frames exposed campaign context and the fixed `BD20` code.

- Fixed in session-access slice: declared `x-bde-role: gm` granted approval authority.

- Fixed in the durable-command slice: request receipts are persisted with canonical payload-conflict checks and exact restart-safe results.

- The first duplicate GET `/api/rolls` strips record IDs; the later full-log handler is unreachable.

- Fixed for covered synchronous commands in the durable-command slice: an outer transaction includes all legacy table writes, state, random outcomes, revision and receipt.



At this baseline checkpoint, browser rendering, seven clients, physical phones/Wi-Fi and a complete Party game were not covered. The subsequent Party server slice covers seven simulated clients and a complete headless game; physical rehearsal remains open. The durable-command slice verifies automatic command recovery without an explicit save.



## Configuration compatibility



Game-server configuration is now pure and injectable. Source and built modules resolve the same repository root. Default database remains `_data/black-dice-engine.db`; `BDE_EXPORT_ROOT` redirects exports. No existing files were moved or migrated.



Game server defaults to loopback; set `BDE_HOST=0.0.0.0` explicitly for LAN. Machine-specific media paths and the erroneous secret-file fallback are removed; optional endpoint/store settings are empty until supplied. It no longer searches a parent directory for `.env`: pass process variables or use Node's explicit `--env-file` option as documented in `.env.example`. No private environment file was read/edited. Other service configuration is not yet centralized.



## Session-access slice — October 24, 2026



Implemented the authority in `session-authority.ts`, access middleware in `session-http.ts`, allowlist views in `projections.ts`, and explicit browser client/join gate in `apps/session-client.tsx`. Existing server routes and socket delivery use these modules; they are not unused scaffolding. Both apps have removed their global fetch patches and send server-issued capabilities explicitly. Built host assets are available at `/host/`; companion remains `/player/`.



| Task | Evidence |

| --- | --- |

| CORE-02 | Server-issued, random host/player/display tokens; persisted hashes; room-code join; actual forged-header/query denial and distinct host-only approval. Host key lives in the ignored local `.host.key` file and never in QR links/logs. |

| CORE-03 | Join/resume/revoke/new-room HTTP routes, actual socket revocation, same-credential HTTP/socket use, actual process restart with same actor/claim, new-room stale-token denial; injected-time expiry and host recovery tests. Lifecycle and local HTTP limitations documented in [local session access](local-session-access.md). |

| CORE-04 | Allowlist projections on old REST routes, initial/reconnect frames, broadcasts and public exports; blocked legacy pending narration/context/log/image reads; actual private canary absence in other viewers' frames and safe error responses. Future Party routes must use this boundary and add their own secret-choice projections/tests. |

| CORE-05 | Random room code replaces `BD20`; non-host snapshots omit table PIN; claims, releases, rolls and proposals bind to authenticated ownership. Test requests forging another actor or host are rejected. |

| CORE-09 | Actual bodies/frames verify forged roles, another actor's seat/action, unauthenticated sockets, spectator writes, hidden fields, revocation, stale-room credentials, same-command replay and conflicting payload denial. Tokens are absent from captured diagnostics and frames. |



Verification: all six workspace lint/build checks pass; eight test cases pass against both source and built server. The integration case covers multiple HTTP requests, two launches, player/display sockets and denied handshakes. Its legacy restart step calls save-now deliberately; it does **not** satisfy durable automatic acknowledgement. No optional provider request occurred, no new dependency was added, and fixtures/processes were cleaned up.



Rendered UI inspection was attempted on an isolated built demo, but CUA reported local browser use disabled in Work settings. UI/physical rehearsal boxes stay open. Both Vite bundle-size warnings remain. The subsequent durable-command slice closes the CORE infrastructure gate for synthetic TTRPG commands; Party commands need their own validation and privacy checks.



## Durable-command slice — October 24, 2026



| Task | Evidence |

| --- | --- |

| CORE-01 | Configuration, membership/access, projections and command validation/store/boundary are separate modules used by the coordinating Express server. No new runtime or dependency. |

| CORE-06 | Versioned command metadata, snapshot metadata and private committed-event envelopes; documented JSON Schema plus actual runtime version/identity/stage/revision/payload guards and HTTP malformed/stale tests. Existing domain logs remain compatible. Party-specific round contracts follow with the Party model. |

| CORE-07 | Durable receipt key includes room, mode, authenticated actor, route/kind and request ID. Tests cover changed payload conflicts, exact replay after restart and ownership release, and no revision increment or repeated effects. |

| CORE-08 | One SQLite transaction saves all legacy collections, full command state, recorded outcomes, next revision, receipt and event before queued broadcasts/exports or HTTP success. Fault injection at both receipt and event insertion rolls back previous writes; observed state/revision stay unchanged, rejected rolls never broadcast, and same-ID retry succeeds. A process crash without save-now preserves HP/claims/revision and the exact earlier random roll. Completed action clearing is included before commit. |



See [command protocol](command-protocol.md) for covered routes, migration rules and limits. Optional asynchronous adapters remain outside this synchronous domain boundary; later capability tasks still apply. Memory exports and optional roll presentation are queued after commit; their failures cannot change acceptance. SQLite WAL uses FULL synchronization; physical power-loss/corruption testing remains open.



Verification: ten tests pass against both source and emitted JavaScript. All six workspaces pass lint; all six build (the server build was rerun after fixing a control-restore type error). Two Vite chunk warnings remain. The local-connection sandbox requires reviewed loopback access for integration tests. No providers, real databases or private files were accessed; no dependencies installed.



## Party server loop — October 24, 2026



The server now installs Party routes, deadline ticking and per-viewer initial/reconnect/broadcast projections. `party-game.ts` owns immutable rules/content; `party-service.ts` validates commands, commits candidates through the shared durable store and publishes only after commit. See [Party API and recovery policy](party-mode-api.md).



| Task | Evidence |

| --- | --- |

| PARTY-01 | Versioned persisted roster, frozen participants, round/stage, deadline/pause, private choices, outcomes/history, scores/danger and ending. Runtime restore validation checks nested records before projection. |

| PARTY-02 | Authenticated unique labels, seven-seat bound, six-or-seven-ready start, separate host player credential, next-round admission for a late seventh seat. API test uses all seven memberships. |

| PARTY-03 | Five original scenes with prepared prompts, labeled options and deterministic plain-text consequences/endings. No private/copyrighted campaign material or provider request. |

| PARTY-04 | Private acknowledged choices and replacement until lock; raw choices never broadcast before reveal. Replaying an older accepted choice receipt does not replace a newer choice. |

| PARTY-05 | All-submitted, server deadline and force-lock share one reducer transition. Concurrent seven-player API submissions and repeated lock rejection; unit deadline tick cannot lock twice. Frozen participant set ignores a mid-round late arrival. |

| PARTY-06 | Default pass for missing seats; host skip records all unresolved seats as pass; persisted pause/resume/extend freezes server deadlines. Tests cover exact deadline, paused elapsed time and no dice on pass. |

| PARTY-07 | Host/display/other-player views expose only aggregate readiness until reveal; only a player's own accepted choice is private. REST and actual initial/reconnect/live frames inspected. No private choice event or AI prompt is produced. |

| PARTY-08 | Ascending immutable seat order; authoritative d6 and every outcome committed together. Exact thresholds/danger-clamp tests plus live restart/replay return the saved resolution without reroll. |

| PARTY-09 | Five rounds, explicit personal score/shared danger, three endings, shared ties, new-room credential and state isolation. Test score totals equal recorded history. |

| PARTY-10 | Full lifecycle committed; unfinished game durably pauses on startup. Actual process restarts preserve choosing submissions, locked secrecy, revealed choices and resolved dice; host resume required. |

| PARTY-11 | Five-round headless HTTP game with seven concurrent phone sockets plus host/display; duplicates, late/out-of-stage/denied commands, disconnect/reconnect, all four recovery phases, ending/new-room isolation. |

| PARTY-12 | Secret roles/objectives and custom text explicitly deferred. Payload allowlists accept only the bounded prepared choices; no AI-required adjudication path. |



Verification: **15 tests pass against source and emitted JavaScript**. Six workspace lint/build checks pass, with the existing two Vite chunk warnings. Disposable fixtures and test-owned child servers are cleaned up. Seven-client evidence is protocol simulation, not a phone/Wi-Fi/TV or pacing rehearsal. **28 of 81 actionable tasks are checked**; Stage 3 rendered surfaces and the physical-demo gates remain open. No new dependency, private-data access or provider request.



## Party UI and client lifecycle — October 24, 2026



The existing apps now default to Party Mode, with a separate public display route and lazy-loaded TTRPG mode. See [Party UI setup and recovery](party-ui.md). Server rules remain authoritative; browser code displays recorded outcomes and never rolls or advances deadlines locally.



| Task | Evidence |

| --- | --- |

| UX-01 | `/host/`, `/display/` and `/player/` select separate role trees. Display access requires its own spectator credential and never imports/mounts the GM view. Static React markup verifies absence of host/private-choice controls; HTTP tests load built routes/assets, and actual REST/socket tests verify public projections. Rendered layout and physical screen placement remain unverified. |

| UX-07 | Host controls cover legal start/advance/ending phases, pause/resume, extension, force-lock/pass, skip and new room. Skip/new room default to disabled until explicit checkbox confirmation; start requires six ready seats. Static markup tests cover phase controls, safeguards and absence on TV. Actual command tests cover the underlying authorization/transitions. Interactive click verification remains open. |

| UX-08 | Explicit session-aware client, room/member-scoped persisted command queue and React-independent socket owner. Tests verify exact same-ID/body retry after response loss and refresh, single-flight retry, definitive versus ambiguous errors, malformed replies, storage failure, stale socket callbacks, cleanup/remount, bounded reconnect, silent socket replacement and revocation. The seven-client API test loses a reply after server commit and confirms replay adds no effect/revision. |



Implemented but still unchecked: read-only TV setup, responsive phone/TV styles, QR/manual join, ready/choice/update/acknowledgement/results, saved-session recovery and visible connection/pending state. **UX-02–06 and UX-09 remain open** because their rendered or physical requirements have not passed. CUA again reports **Local browser use is disabled in Work settings**; no alternate browser automation was used to bypass that setting. Source/static/protocol checks do not establish accessibility, QR scanning, phone sleep behavior, TV scaling, HDMI privacy, Wi-Fi reliability or 20–30-minute pacing.



Verification: **20 tests pass against both source and emitted JavaScript**, and all six workspaces pass lint/build. Built-route tests fetch every referenced script/style asset. Initial Party bundles are about 252.51 KB (host/display, gzip 80.89 KB) and 226.54 KB (phone, gzip 70.80 KB); the two lazy TTRPG chunks still exceed Vite's 500 KB warning threshold. All test fixtures use disposable databases and loopback with outgoing provider calls blocked. No dependencies installed or private data accessed.



**31 of 81 actionable tasks are checked; 50 remain.** The Stage 3 rendered-flow gate and Stage 4 live rehearsal remain open. The broad root/package extraction and optional capability work are still pending; this slice adds shared browser modules without claiming a finished workspace refactor.



## Lightweight Windows Party launch — October 24, 2026



Added `start-party.bat`, `scripts/party-launch.mjs`, `npm run party` and `npm run build:party`. The original full-stack launcher remains intact. [Launch/setup/recovery guidance](party-launch.md) distinguishes actual automation from the physical rehearsal checklist.



| Task | Evidence |

| --- | --- |

| RUN-01 | Party launcher builds only the dashboard, companion and game server, then imports the emitted server into its own Node process. Party runtime configuration overrides inherited optional endpoints/raw stores; authenticated optional routes return `CAPABILITY_DISABLED`, AI adapter returns before fetch, narration cannot be restored/enabled, and media polling is not registered. Seven-client source/built games finish with configured provider canaries and outgoing requests blocked. No external service/model starts. |

| RUN-02 | All launcher/build paths derive from the script location. Actual launcher tests start from a different directory with spaces, preserve the same authority/seat after restart, and refuse an occupied port before creating the conflicting data directory while its owner remains reachable. A synthetic installed compiler exits 7; visible error and exit 1 prove startup stops. No port/PID/name-based process termination or background server exists. The Windows batch wrapper passes help and ephemeral-port preflight from outside the repo. |

| RUN-04 | The one emitted server serves `/host/`, `/display/`, `/player/` and their local script/style assets. Launcher validates asset references before startup; HTTP tests load all routes/references. Default loopback overrides inherited LAN settings; `--lan` is explicit. Docs explain one-port access, active-adapter/manual address fallback and a Private-profile/program/port/local-subnet firewall rule; no firewall changes were made or physically tested. |

| RUN-05 | Host checklist covers power/sleep/dock/HDMI, extended-display privacy, actual scaling/audio, charging, same network, address/VPN checks, guest isolation, physical QR/manual joining, full-session rehearsal and fallback. Publishing the checklist does not claim those physical steps passed. |



Verification: **25 tests pass against source and emitted JavaScript**. All six workspaces build and pass lint; the dedicated three-workspace Party build also passes. The existing two lazy TTRPG chunk warnings remain. Tests clean their own disposable databases/processes/compiler fixtures. Default `_data/party` and legacy data were not opened; no private `.env`, provider, model, campaign store or dependency install was involved. The default Party directory is ignored by Git, including its local exports/key.



**35 of 81 actionable tasks are checked; 46 remain.** RUN-06–09 and the Stage 3 rendered/physical gate remain open. The launcher does not establish real-phone/Wi-Fi/TV readiness, latency targets, a rehearsed backup/restore or a frozen release. Full-profile optional adapter hardening remains separate work; direct legacy server startup keeps its compatibility profile.



## First shared workspace and maintenance review — October 24, 2026



| Task | Evidence |

| --- | --- |

| ROOT-01 | [Architecture maintenance review](architecture.md#maintenance-review-after-the-party-slice) compares duplicated contracts/validation, loose shared client modules, large TTRPG views, remaining server responsibilities and service configuration. It records caller benefits, ownership/testing risks and extraction order. Chose actual duplicate Party/session shapes before speculative client packaging or a service split. |

| ROOT-02 | `packages/contracts` has a private manifest, native ESM/declaration build, ES2022-only type environment, pure guards and real consumers in both apps and the server. Root/lock workspace membership and internal relationships are explicit; contracts build first in aggregate and Party launch. Test/lint/development prerequisites build it automatically. Existing schema paths/IDs are unchanged and `shared-schemas` remains a collection without a manifest. |



Removed the former `apps/party-contract.ts` copy and duplicate server Party/session/key/metadata types. Persisted Party restore and browser snapshots now use common nested guards; pending queues and both command boundaries share metadata/request ID checks. Malformed negative scores, duplicate seats/participants, unknown participant choices and invalid nested outcomes fail validation. Authenticated ownership, private projection values, scoring/dice/phase rules and SQLite remain server responsibilities. The old complete-loop, leakage, replay and TTRPG tests continue to pass.



No install was run and the local contracts workspace link is absent in existing `node_modules`. Consumers intentionally use the emitted entrypoint by repository-relative path; the [package README](../packages/contracts/README.md) explains build prerequisites, future normal link creation, limits and rollback. Lockfile edits add only local workspace metadata, with no external dependency version/resolution change. The game server retains valid relative import depth in source and built execution. No data migration or resource-path move occurred.



Verification: **28 tests pass against source and emitted JavaScript**. New cases cover nested contract corruption, service refusal before projection/recovery, strict metadata/request IDs and targeted enum/identifier parity with existing schema IDs. This is not full JSON Schema validation/generation. **Seven** workspaces pass lint/build; the dedicated Party build now runs contracts plus both apps/server. Built route/assets, exact receipt replay, credential/seat recovery and occupied-port/build-failure launcher checks pass. Initial Party bundles are 252.98 KB (host/display) and 227.01 KB (phone); the two existing lazy TTRPG chunk warnings remain. Disposable fixtures/processes are cleaned up, with no private data/provider/model access.



**37 of 81 actionable tasks are checked; 44 remain.** ROOT-03/04 stay open: remaining TTRPG/AI/media protocol shapes and JSON Schema source/generation still need consolidation. ROOT-05–10, engine separation, rendered/physical rehearsal and remaining release/capability/QA requirements remain outstanding. The disabled local-browser setting continues to limit rendered evidence but does not prevent this verified package extraction.



## Companion extraction and reliable roll confirmation — October 24, 2026



**ROOT-06 is complete.** [Companion module ownership](companion-refactor.md) maps join/resume, shared socket/command transport, the existing Party controller and focused TTRPG shell/sheet/picker/roll/feed/presentation modules. The former approximately 680-line companion App is a small composition shell. Common Character/RollRecord types now live in contracts with nested runtime validation; other protocol consolidation remains ROOT-03/04 work.



Fixed two existing behaviors during extraction: successful rolls previously left a fingerprint request ID behind, causing a later identical roll to replay the old outcome; the socket callback captured initial empty ownership and missed own-roll animation. The new room/member-scoped queue clears only validated receipts, retains exact uncertain bodies across refresh, and gives a later intentional action a fresh ID. The model reads latest ownership and deduplicates receipt/socket roll presentation. Explicit claim/release now uses one queue path and the authenticated seat label; joining/reconnecting never automatically claims a sheet. The old unscoped fingerprint store is left intact and not reused; the migration note explains uncertain-action handling.



Own sheet rendering includes conditions, resources, inventory, notes and advanced ability values. Roll labels use the actual modifier; a missing GM action disables the simple roll. Connection/command errors and pending-confirmation controls are visible. Three.js is separately lazy-loaded, and optional animation failure has a readable saved-result fallback. Numeric totals remain server-owned. Audio and shake require user action, audio/motion listeners clean up, late model/permission completion is guarded, and the result dialog has Escape/Tab handling plus focus restoration. These are source changes, not claims of rendered/device verification. Shared dashboard/player dice/audio consolidation remains ROOT-07.



Verification: **32 tests pass against source and emitted JavaScript**, with seven workspaces passing lint/build. The actual companion queue claims against the isolated server, loses a roll reply after commit, survives server restart, replays the same ID/body, confirms a second identical roll adds exactly one new result/revision, and releases the sheet. Nested malformed snapshots, wrong-room/stale state, forged receipt metadata, private sheet markup and roll controls have targeted tests. Existing seven-client Party, privacy, rollback, asset/launcher and connection cleanup tests continue to pass. `.mts` helpers plus app-only source-extension import settings resolve Node/tsx/Vite format differences without changing root/service module semantics.



Phone TTRPG shell is about **14.27 KB** plus its **229.06 KB** shared initial entry; the optional dice chunk is **601.64 KB**. The existing dashboard TTRPG chunk remains **671.80 KB**; Vite's >500 KB warnings remain. Static inventory was refreshed. Tests clean only their own fixtures/processes; no private data, provider/model or dependency installation was involved.



**38 of 81 actionable tasks are checked; 43 remain.** Local browser use remains disabled in Work settings, so rendered layouts, focus, WebGL/audio/motion, real-phone sleep/QR and physical rehearsal gates remain open. ROOT-05, ROOT-07–10 and the broader contract/engine/capability/QA work remain outstanding.



## Shared dice and audio ownership — October 24, 2026



**ROOT-07 is complete.** Both apps consume `apps/dice-presentation.mts` and `apps/dice-audio.mts`; four duplicated renderer/sound modules and the dashboard's import-time preload are removed. [Ownership, APIs and limits](shared-dice-presentation.md) document the role-specific wrappers, exclusively owned GLTF resources, bounded cosmetic count and existing asset routes. Server roll generation and saved totals are unchanged.



Every overlay now releases its model geometry/materials/textures/closable bitmap images/skeletons exactly once, including a model that finishes loading after the overlay closes. Frames, resize listener, renderer and its own canvas have explicit cleanup; setup failure and reentrant completion cannot revive the overlay. Settled dice stop the animation loop. Per-sound audio/timer ownership fixes the dashboard's global-reference bug where an older timeout could stop the newest sound. Rejected playback and unmount release only that sound. Phone playback remains optional; duplicate live IDs do not reopen dashboard presentation, and companion receipt/socket dedup remains covered. Dashboard totals are visible immediately rather than waiting for the animation/model to succeed.



Verification: **36 tests pass against source and emitted server execution**, and all seven workspaces pass lint/build. Four new tests use real in-memory Three.js resource objects with fake loader/renderer/clock/audio adapters to verify cleanup, failures, late completion, no ongoing settled animation loop and independent sound timers. These are lifecycle tests, not browser/GPU rendering. Integration checks use HEAD metadata for all six dice model files and the dice sound at `/host/` and `/player/`, rejecting empty or HTML fallback responses without reading media bodies. Existing Party/TTRPG authority, replay, privacy, recovery, built assets and launcher regressions pass. Test fixtures/processes are cleaned; no private data/provider/model service or dependency installation is involved.



Phone optional dice chunk remains approximately **603 KB**, dashboard TTRPG approximately **673 KB**; both retain Vite's >500 KB warning. Local browser use is disabled, so real WebGL, audio unlock, motion, focus, layout and physical-device performance remain open UX/rehearsal requirements. This does not mark rendered/physical gates complete.



**39 of 81 actionable tasks are checked; 42 remain.** ROOT-05 and ROOT-08–10, contract/engine extraction, optional capabilities and remaining QA/release requirements remain outstanding.



## Node configuration seam and source/built path verification — October 24, 2026



**ROOT-09 is complete.** [Runtime configuration and evidence](runtime-configuration.md) records NodeNext emission, app no-emit/Vite settings, build order, stable paths, explicit environment-file loading, actual maintained prompt use and limits. ROOT-08 has advanced but remains open for full legacy startup/Python TTS portability and remaining optional-adapter work.



Added `packages/runtime-config`, a private Node-only ESM/declaration package with four real service consumers and no external dependency. Game config keeps its compatibility re-export, while the AI adapter, audio, Comfy router and runtime service now use one pure configuration source. Browser contracts/apps remain separate. Root build visits eight workspaces; pretest/prelint and relevant development prerequisites build shared packages first, and Party builds/verifies five workspaces. Existing installed tools and relative emitted imports work without an install or new workspace link. Only local dependency/lock metadata was added.



Audio/Comfy no longer search above the repository for `.env`, and runtime no longer discovers a cwd `.env`. All Node services consume explicit process environment and default to loopback. Relative stores/backups/data resolve from the repository root; the legacy database/export/backup defaults are preserved, optional paths remain empty when absent and audio refuses an empty scan root. Strict decimal ports and HTTP(S) base URLs fail with variable names rather than values. Party blanks optional endpoints/stores and AI keys before use. The two direct Comfy submissions now require an explicit base endpoint and have a timeout instead of hard-coding localhost:8188. No provider was enabled or called.



`.env.example` now lists actual Node service ports, explicit `node --env-file` examples, path semantics and current optional settings; duplicate keys and active machine-specific paths are removed. The private `.env`, private stores and models were not opened. The older full-stack launcher and Python TTS remain explicitly documented legacy follow-ups; this slice does not claim live provider readiness or safe WAL backups.



Verification: **39 tests pass against source and emitted services**; all **eight** workspaces pass lint/build and the dedicated **five-workspace** Party build passes. Auxiliary-service tests start audio/Comfy/runtime on ephemeral loopback ports from a synthetic cwd with a deliberately invalid fixture `.env`; startup/empty audio/library registry checks pass without loading it, opening data or making outgoing calls. A separate adapter subprocess verifies exact maintained scene/director system prompts with fake fetch from a different cwd. Pure config checks cover path stability/spaces, ports, endpoints and Party isolation. Existing privacy/replay/restart/built-asset/launcher checks pass. Each test cleans its own fixtures/processes. Two existing optional bundle warnings remain.



**40 of 81 actionable tasks are checked; 41 remain.** Rendered/physical UX gates remain unverified because local browser use is disabled. ROOT-05, ROOT-08/10, broader contracts/engine/capabilities and remaining QA/release work remain outstanding.



## Full launcher and model-free TTS checks — October 24, 2026



ROOT-08 has advanced; it remains open pending external-path/caller review of historical helpers alongside ROOT-10. The plan remains **40/81 complete, 41 open**. [Full session startup](full-session-launch.md) documents `npm run session` and the script-relative Windows wrapper, replacing the hard-coded checkout/ComfyUI startup and suppressed build failure. It builds with existing installed tools, serves the full profile on loopback, preserves configured/default database paths, and starts only explicitly selected optional Node services. External ComfyUI/LLM/Python/models never start automatically. Occupied/duplicate ports fail before game data opens; Ctrl+C and startup failure clean up only owned children. Party's separate lightweight profile/database remain available.



[TTS configuration](../services/tts-service/README.md) now requires explicit model and voice paths, resolves relative paths from the repository, defaults to loopback and has stdlib-only import/configuration. `--check` validates file presence without loading models or binding a port. Real startup claims its port before importing the optional backend. A synthetic regression exposed Windows HTTPServer address reuse allowing a second bind; disabling reuse prevents model loading on a port conflict. HTTP validation bounds text/body/voice/speed, handles very large numeric inputs and returns generic backend errors without submitted text/model paths. Synthesis is still synchronous; real inference timeouts/cancellation and voice/model compatibility remain unverified.



Verification: **42 tests pass against source and built services**, including three Python unittest cases inside the Node TTS test. The final numeric-bound adjustment also passes its targeted TTS rerun. All **eight** workspaces pass lint/build; the two existing optional bundle warnings remain. Full-launch tests start from a synthetic cwd with spaces and an invalid fixture `.env`, check full game/audio/router health, preserve an existing port owner, prevent conflict data creation, and confirm owned listeners close. Python checks reject all optional backend imports, use synthetic file placeholders and injected in-memory speech/WAV responses, verify occupied-port refusal and recovery after backend failure. No real model, private data, provider, dependency installation or download was involved. Each test cleans its own disposable fixtures/processes.



Maintained skills, script inventory, environment example and startup/test documentation reflect these changes. Browser use remains disabled; rendered/physical/device/audio/GPU gates remain open. Historical download/generation/rewrite helpers have not been run or retired in this slice.



## Historical helper retirement and verification matrix — October 24, 2026



**ROOT-08, ROOT-10 and QA-03 are complete: 43 of 81 actionable tasks checked, 38 open.** [Retirement evidence](script-retirement.md) records caller search scope, five removed helpers, their supported replacements/dispositions and recovery through Git history. Root/package scripts, launchers, applications, services, tests, maintained docs and skills contained no callers. There was no CI workflow directory. Only the static source inventory listed the files. The helper code was inspected without execution; no download, generation or source rewrite was run.



Removed the obsolete dashboard string-rewriter, machine-specific checkpoint downloader, two live generation probes and unbounded timing script. These removals eliminate the remaining hard-coded external runtime path in maintained executable source. Shared Node config, portable launchers and explicit TTS model/voice settings preserve the database/export defaults and stable source/built resource resolution verified in prior slices. Sample campaign/scenario content, schema IDs, assets, licenses and skill provenance are preserved. No external data is touched or migrated. The router README now uses repository-relative registry/template locations.



The new [verification matrix](verification-matrix.md) maps every QA-03 scenario to current automated checks, expected invariants and missing evidence: seven users, privacy, timeout/pass, duplicate/conflicting retries, stale state/revisions, simulated sleep, restart, provider absence, build/start and original TTRPG flow. It explicitly leaves physical/browser, full migrations/retention, restore, optional inference and measured host performance unverified. The matrix includes repeatable commands, isolation rules and pending rendered/physical release procedures; creating it does not complete those procedures.



Verification after retirement: **all 42 tests pass** with no skipped/cancelled cases. Maintained startup, native persistence, seven-client complete Party flow, TTRPG recovery, source/built configuration/prompt paths and synthetic TTS remain green. Executable-source search finds no retired caller, machine-specific external path, cwd-based configuration lookup or dotenv discovery. `npm run inventory` regenerates only maintained script entries. `git diff --check` passes; source removals require no dependency changes or application rebuild beyond the already verified eight-workspace build. Existing bundle-size and browser/device limitations remain. The full goal remains active.



## Dashboard diagnostics and transport extraction — October 24, 2026



ROOT-05 advanced but stays open; **43/81 tasks are complete, 38 open**. [Dashboard ownership](dashboard-refactor.md) maps the current mode entry, remaining interactive coordinator, seven read-only panels, dice overlay, local host types/formatters, shared connection hook and host update adapter. App is reduced from roughly 3,600 to 2,700 lines without changing the extracted panels' JSX/advanced-mode conditions or making panel components fetch host data independently. Host diagnostics remain separate from the public display route and lazy Party/TTRPG mode entry.



The host now consumes `LiveConnection`, matching Party/phone socket/timer ownership, stale-socket suppression, heartbeat recovery and credential-expiry behavior. The hook cleans its own online/focus/visibility listeners and uses current callbacks. A bounded host roll-ID set prevents duplicate animation; results remain server-generated. Generic connection errors now accompany status. Existing bootstrap/command state and full nested host validation remain work in progress; shallow envelope checks are not a completed ROOT-03/04 contract. Existing placeholder export/cleanup/error-loading actions and optional-capability state are explicitly documented rather than marked complete.



Verification: **44 tests pass against source and emitted services**, and all **eight** workspaces pass lint/build. Two new tests exercise malformed host envelopes, valid server roll totals/static markup, repeated-roll suppression, actual authenticated connected/reconnect frames and real saved roll/snapshot delivery. Seven extracted panels render static HTML from producer fixtures/empty states; this does not prove React-effect mounting or rendered browser interactions. Existing transport lifecycle, privacy, persistence/restart, seven-client Party, built-route and launcher checks remain green. No real campaign/model/provider access, dependency installation or generated asset change occurred; fixtures/sockets/processes are owned and cleaned.



Dashboard Party entry is 253.53 KB, lazy TTRPG 674.41 KB; the phone optional dice chunk remains 602.43 KB. The same two Vite bundle warnings remain. Browser use is disabled; physical/rendered UX checks stay open. Next dashboard work is focused interactive TTRPG panels, host/session controls and optional capability ownership, preserving durable command/reconnect behavior through extraction.



## Interactive dashboard controllers — October 24, 2026



ROOT-05 advanced further; the plan remains **43/81 complete, 38 open**. Character creation, TTRPG table/approval and scene/AI controls now have focused hooks and seven additional panels; App is approximately 1,460 lines. Hooks stay mounted across advanced-panel hiding, preserving drafts and local combat/queue state. The table command seam accepts an injected HTTP adapter, preserves existing fingerprint IDs across uncertain requests and clears only confirmed actions. A storage-error fix releases busy state and prevents submission when request persistence fails. The existing host queue still lacks full room scoping and receipt validation; this is documented rather than claimed complete. AI request bodies and narration toggle behavior are preserved; optional inference cancellation remains capability work.



Verification: source suite **46/46** passed; final emitted-service suite **47/47** passed after adding a pure storage-error case. All eight workspaces pass lint/build, and the dashboard build passes again after the last source change. The actual synthetic server accepts an HP action through the extracted interface, while static HTML checks cover table simple/advanced, approval, character and four scene/AI panels. New pure command tests cover lost replies, retry IDs, draft retention, fresh later commands, approval routing, non-success responses and unavailable storage. No provider/model/private data or installation was involved. Disposable sockets/processes/data are cleaned. Browser mounting/layout, device audio and real inference remain unverified.



Dashboard Party entry remains 253.53 KB; lazy TTRPG is 678.70 KB. The two existing bundle-size warnings remain. ROOT-05 stays open for remaining media/audio/gallery ownership and host/session controls. The prior automatic approval review failed due a usage limit before its tool call executed; the subsequent authorized retry ran successfully, so no behavioral check remains blocked by that earlier failure.



Final verification after the storage change also passes **47/47 in source mode**. Both source and emitted-service suites are green with no skipped/cancelled cases. Static inventory is refreshed and whitespace checks pass.



## Gallery and music ownership — October 24, 2026



ROOT-05 progresses; the plan remains **43/81 complete, 38 open**. Gallery state/polling and latest/thumbnail/expanded views now have focused owners. Polling is sequential, aborts on cleanup/deadline, ignores late responses and retains valid data across errors or malformed payloads. YouTube state and view are extracted; delayed selection cancels on newer selection, stop, clear and cleanup, preventing an old callback from reviving a stopped track. Hooks remain mounted across advanced-panel hiding. Track controls now use buttons and the iframe has a title. App is approximately 1,310 lines.



Five added cases bring the suite to **52/52 passing against source and emitted services**. Dashboard lint/build pass. No dependencies, private data, provider calls or model services are involved. Party initial bundle remains 253.53 KB; lazy TTRPG is 680.37 KB and retains the size warning. Existing embedded-volume limitations remain documented; real browser/media behavior is unverified because browser access is disabled. ROOT-05 stays open for media jobs, local audio/cues, narration and host/session controls. No additional plan checkbox is claimed for this partial extraction.



## Media-job and local audio modules — October 24, 2026



ROOT-05 progresses; **43/81 tasks remain complete, 38 open**. Manual media-job actions now have an injectable request interface, queue state hook and separate queue/metadata panels. The existing routes, bodies, pressure denials, confirmed updates and status/cleanup behavior are preserved. Local audio state, reads, polling and manual track/cue controls live in a hook with two focused panels. Advanced-mode conditions and state retention stay unchanged. App is approximately 690 lines. Existing endpoint/poll stale-response gaps and shared busy-key limitations are recorded under the still-open capability/contract work; this extraction does not claim those fixed.



Four added cases cover media requests/failures and job/audio panel states. The first full run passed 55/56: the existing TTS fixture intermittently hit Windows error 10053 while sending an oversized body after the server's early rejection. Ten isolated repeats passed, consistent with a timing-sensitive close/upload race rather than a dashboard change. The fixture now uploads the full valid 64 KiB boundary and checks oversized/invalid Content-Length admission from headers before uploading a refused body, asserting exact 413/400 responses and no synthesis. Production TTS code is unchanged; no full-upload transport guarantee is claimed.



Final verification: **56/56 pass against source and emitted services**, no skipped/cancelled cases. Dashboard lint/build pass; Party entry is 253.53 KB and lazy TTRPG 681.69 KB with the existing size warning. Browser/audio/real inference remain unverified. No dependencies or private campaign/model/asset data were used. ROOT-05 stays open for narration, memory/cleanup reports, bootstrap and host/session controls, including previously documented placeholder actions. The goal remains active.



## Dashboard code split finished; rendered acceptance pending — October 24, 2026



App now composes focused owners in 106 lines: host/session/bootstrap, controls, reports and narration join the prior table/character, AI, gallery, media/audio and connection modules. Placeholder cleanup/error/export actions are implemented. Save status is separate from export; scene drafts clear and ambience/search run only after a confirmed command. Host requests have owned ten-second abort deadlines, disposal/generation checks and explicit malformed/failed-confirmation handling. Bootstrap REST results cannot overwrite a later socket/command update. Download URLs and narration context/source/element resources are owned and cleaned; narration guards scene/view epochs and keeps readable text if optional speech fails. These changes do not complete full nested contracts, durable host retries, revision-bound inference or independent audio control.



Eight added tests bring the suite to **64/64 passing in source and emitted-service modes**, with no skips/cancellations. The real disposable server verifies reports, memory creation, save, scene acceptance/rejection, Markdown content/path and restart. Injected request/audio adapters verify timeout versus cancellation, reactivation, disposed results, download cleanup, autoplay refusal and late decode disposal. Static panels cover saved feedback, retained drafts and producer reports. All eight workspaces pass lint/build. Party initial bundle remains 253.53 KB; lazy TTRPG is 688.67 KB and retains the existing size warning; the phone optional dice warning remains. No dependency/private-data/model/provider use occurred.



Review used root/UI/media/verification and simplify guidance, checking unconditional hooks, explicit request adapters, resource cleanup and preserved mode/panel conditions. A full-App Node SSR attempt exposed the existing shared-app CJS/ESM loader boundary; tests target extracted panel/request interfaces without changing production module scope. React effect mounting, actual downloads, QR/layout/focus and physical audio remain unverified because browser use is disabled. ROOT-05's code implementation is finished but its checkbox remains open for rendered acceptance under the shared definition of done. The actionable tally stays **43/81 complete, 38 open**; continue contract consolidation ROOT-03/04 while that acceptance gate is unavailable. The full goal remains active.



## Shared TTRPG host contracts — October 24, 2026



ROOT-03/04 progress; **43/81 tasks remain complete, 38 open**. The shared browser-safe package now owns the formerly duplicated server/dashboard host definitions, including protocol metadata, complete host snapshot queues, diagnostics, memory, AI adapter and audio types. Audio service imports the shared library/playback types. Producer event kinds `character_created`/`initiative_set` and live adapter variants missing from the old UI copy are retained. Internal proposal request IDs remain optional; submitted-command and draft aliases preserve the UI distinction. Runtime-service health reports remain a different contract, and player/public projections remain separate from full host data.



Nested guards now run at host bootstrap, connected/runtime/snapshot frame dispatch, report/log reads and save/scene/memory confirmations. A malformed half of a connected frame prevents both callbacks. Guards permit additive fields and leave opaque payload/settings objects, authorization, projection and domain rules to their existing owners. No schema IDs, database layout, credential formats or dependencies were changed/installed; the audio manifest/lockfile records the existing local contract workspace relationship.



Three added cases bring the suite to **67/67 passing against source and emitted services**, with no skipped/cancelled cases. Actual authenticated synthetic producers supply host snapshot/runtime/memory/report data. Mutated nested protocol, character, campaign, memory, queue, diagnostics and confirmation fields are rejected; injected records cover audio and live adapter variants. All eight workspace lint/build checks pass. Dashboard initial bundle is 259.77 KB; lazy TTRPG is 688.54 KB and phone optional dice remains 602.43 KB, retaining both size warnings. No browser/device/model/provider/private-data check is claimed.



ROOT-03/04 remain open for remaining controller response validation (table/media/scene/audio/character), legacy persistence validation, typed server envelope construction and JSON Schema/runtime parity. The ROOT-05 code split remains finished with rendered acceptance pending because browser use is disabled. Inventory and whitespace checks are refreshed; no commit or publish was made. The goal remains active.



## Host controller response adoption and scene queue regression — October 24, 2026



ROOT-03/04 progress; **43/81 tasks remain complete, 38 open**. Shared response envelopes/guards now cover table snapshot confirmations, media job/asset confirmations (including optional runtime), scene packet/queue/local/director responses and audio library/playback/cue responses. Controllers use a small JSON read boundary before changing state. Character creation validates the producer's bare character before clearing drafts. Invalid table confirmations preserve pending retry IDs and condition drafts; invalid media success cannot partially apply snapshot/runtime state. Malformed scene proposal confirmation now follows the failure status path and releases busy state. Existing command/effect session ordering limitations remain open.



The real generated-packet test initially failed: its `memory` beat was already produced and typed, but rejected by the server and JSON Schema enums. `sceneBeatKinds` now supplies the shared/server enum, the existing schema accepts that additive kind, and a targeted parity check plus all three actual queue routes verify the correction. The schema ID/dialect remain unchanged. No optional provider, asset generation or schema-generator dependency was introduced.



Verification: **71/71 tests pass in source and emitted-service modes**, with no skipped/cancelled cases. All eight workspaces pass lint/build. Added malformed confirmation cases verify state/draft/ID retention; actual synthetic producers verify generated scene queues, character creation and manual media metadata. The auxiliary-service fixture now checks real audio library/playback response shapes and metadata play/volume/mute/pause/stop transitions with an owned synthetic file; it never decodes or audibly plays that file. Dashboard initial/lazy TTRPG bundles are 261.32/689.69 KB; phone optional dice remains 602.43 KB with both existing size warnings. No private data, dependencies, model stores or live providers were used.



ROOT-03/04 remain open for AI proposal/toggle responses, server-side optional-service and legacy persistence validation, typed envelope producers and full JSON Schema/runtime consistency. ROOT-05 rendered acceptance is still pending because browser use is disabled. Documentation, inventory and whitespace review are updated; no commit/push was made. This turn made concrete code and verification progress; the full goal remains active.


## Validated AI suggestions and confirmed host controls — October 24, 2026

ROOT-03/04 and CAP-03 progress; **43/81 tasks remain complete, 38 open**. The shared proposal source supplies types, accepted skill/ability and difficulty values, text bounds, runtime guards and the complete new JSON Schema artifact. The prompt asks for that contract. The server parses one JSON object (optionally fenced), rejects malformed output with 502 and records a generic validation reason without rejected raw output. Suggestions never automatically apply rolls, sheets, scores or canon.

Explicit host Apply now sends the server-required `type`, fixing the former rejected `action` body, and checks matching confirmation fields. Failed application retains its proposal. Narration GET/POST shapes validate separately; POST requires success and the requested boolean. The checkbox displays confirmed state, exposes unknown/loading/saving/failure and prevents a slow bootstrap response from replacing a later toggle. Full effect/session/revision cancellation, global command arbitration and durable host retries remain open.

Verification: **74/74 tests pass against source and emitted services**, with no skipped/cancelled cases; all eight workspaces pass lint/build. Three new cases compare the complete schema artifact, reject malformed/oversized/unknown-field proposals, verify skill/DC mapping and exercise actual authenticated producer rejection/application with canned in-process completions. They prove action persistence after restart, malformed confirmation refusal and static retained-proposal/setting feedback. The rejected-output canary is absent from the validation diagnostic; this is not full log redaction. No real model/provider connection, private data or dependency installation was used. Fixtures/processes are owned and disposable.

Dashboard initial/lazy TTRPG bundles are 261.32/692.49 KB; optional phone dice remains 602.43 KB with both existing size warnings. Rendered controls/hook mounting and physical audio remain unverified because browser use is disabled. ROOT-03/04 remain open for server optional-service reads, legacy persistence validation, typed producers and remaining schema/runtime consistency. CAP-03 also requires broader redaction and audience/source-label coverage. Documentation/inventory/whitespace review are updated; no commit or publish was made. Mixed Windows punctuation encoding in this ledger was normalized to UTF-8 while preserving its text. This turn and the preceding goal turn made concrete progress; the full goal remains active.

## Validated and bounded server audio cues — October 24, 2026

ROOT-03/04 progress; **43/81 tasks remain complete, 38 open**. The game-server audio-cue route now uses an extracted owner that validates shared library and playback response contracts. Only a successful matching track/status/volume/loop confirmation can mark a queued cue playing; malformed, unavailable and mismatched responses preserve queued state. Concurrent requests for the same cue object share one operation. One ten-second deadline covers lookup and play, shutdown disposes owned requests, and late library completion cannot start playback. A removed queue entry is rejected before state application.

Verification: **78/78 tests pass against source and emitted services**, without skipped/cancelled cases; all eight workspaces pass lint/build. Four added cases exercise injected fetch/time plus the real authenticated route with scripted exact synthetic URLs. They cover malformed libraries, no matching track, failed/mismatched confirmations, shared concurrent calls, ignored-abort settlement, disposal and late completion. Tests use owned disposable data and no real audio/model/provider or private library. Inventory and whitespace review are refreshed. The two existing optional bundle size warnings remain.

This confirms service playback metadata, not audible playback. A timeout cannot retract a play already accepted by a remote service. Full session/revision binding, persisted playback reconciliation, remaining optional-service/persistence validation, typed producers and full schema parity remain open. Browser use is disabled, so rendered/device gates remain pending. No task checkbox, dependency, commit or publication was added; the full goal remains active.

## Shared media router confirmations and working status polling — October 24, 2026

ROOT-03/04 and CAP-05 progress; **43/81 tasks remain complete, 38 open**. The game server previously read nonexistent top-level `status` from the router, which actually produces `job.status` and `comfyStatus`. Shared router job types/guards now connect the producer to an extracted game-server client. Prepare/submit/status confirmations validate shape and matching job/workflow/type/prompt identities before state changes. Submission errors exclude upstream HTTP bodies. Existing HTTP 200 failure envelopes remain compatible while carrying failed job state.

Polling now recognizes the actual envelope, single-flights each live job object and refuses late terminal application after manual termination, removal or router/prompt reassignment. Start refuses an already-starting/running job and rechecks membership/status before applying results. Existing prepare/submit/poll deadlines remain ten/fifteen/eight seconds. The router manifest/lockfile declare its local contracts workspace; no installation or new dependency was added.

Verification: **82/82 tests pass against source and emitted services**, no skipped/cancelled cases; all eight workspaces pass lint/build. Four new tests verify valid/malformed/mismatched envelopes, HTTP body exclusion, overlap/stale suppression, retry release and an authenticated malformed-preparation route. The auxiliary-service test verifies actual router prepare/status producers from unrelated cwd with all outgoing calls blocked. Tests use synthetic fixtures only; no real workflow, GPU, private output or model/provider is used. Inventory and whitespace checks are updated; the two existing optional bundle warnings remain.

These changes do not prove generated-file existence or safe asset publication, durable GPU deduplication/recovery, global queue admission or full session/revision cancellation. Completion still uses the existing metadata-recording path. Remaining optional-service reads, legacy persistence validation, typed producers and schema parity keep ROOT-03/04 open; broader engine/capability and browser/device gates remain. No checkbox, commit or publication was claimed. This turn made concrete implementation/verification progress, and the full goal remains active.

## Explicit database ownership and durable asset metadata — October 24, 2026

ENGINE-08 progress; **43/81 tasks remain complete, 38 open**. The database module no longer reads runtime configuration, opens SQLite or creates directories on import. Server startup explicitly passes its already-validated database path to `openGameStore`, which owns parent creation, WAL/FULL, legacy initialization and idempotent close. `createLegacyRepository(connection)` accepts a caller-owned connection for isolated tests. Authority, command store and legacy helpers retain the same server connection and nested transaction boundary. Signal handlers now explicitly close the store after existing persistence; full lifecycle shutdown remains open.

The new all-table reopen check exposed an existing asset write failure: `asset_records.status` is required, but generic saves omitted it. The asset insert now writes status together with ID/JSON. Generic helpers restrict table identifiers to the existing party/asset choices, and a typed overload requires asset status. Invalid asset replacements roll back without discarding valid rows. No table, stored JSON format, default path, real data or dependency was migrated/changed.

Verification: **85/85 tests pass in source and emitted modes**, no skipped/cancelled cases; all eight workspaces pass lint/build. Three added persistence cases cover fresh import with invalid configuration canaries/no directory creation, independent injected memory connections, outer rollback across multiple helpers, WAL/FULL, all legacy tables/meta/order, close/reopen, invalid asset rows and table identifier refusal. The authenticated host response case now creates synthetic metadata, saves, restarts and checks exact restored assets. Existing TTRPG/Party tests retain commit/receipt rollback, restart and seven-client recovery coverage. No private data, `.env`, models, provider or generated output is accessed.

[Game-store ownership](game-store.md), architecture, tests and PLAN progress are updated. Three repository skills now describe explicit database initialization rather than stale import side effects; their routing/metadata/scope remain unchanged. Inventory and whitespace review are refreshed. The two existing optional Vite size warnings remain. ENGINE-08 still needs broader clock/randomness injection and owned timer/socket/adapter shutdown; legacy record validation, migrations, retention and backup restore remain separate open tasks. No checkbox, commit or publication was claimed. This turn made concrete implementation/verification progress and the full goal stays active.

## Injected runtime work, deterministic dice and bounded shutdown — October 24, 2026

**ENGINE-08 is complete: 44/81 actionable tasks checked, 37 open.** `createServerWork` owns the four game-server intervals, injected time and all optional service requests. Authority, durable command timestamps, Party deadlines and millisecond server timestamps use its clock. Audio/media adapters, AI narration/proposal/director calls and remaining direct Comfy/TTS calls receive its request owner, preserving caller deadlines/cancellation. Stop aborts requests, settles callers even if injected fetch ignores abort, clears interval handles, suppresses stopped callbacks and refuses future requests. Remaining capability-specific consolidation and session/revision stale-result handling stay under CAP-02/05.

TTRPG notation parsing/roll aggregation moved out of index into an import-safe module with injected die samples. Production sampling uses crypto randomInt; modifiers, multi-dice and advantage/disadvantage result semantics remain. Invalid injected samples fail before an outcome is returned. Existing command receipt/transaction logic still records and replays authoritative outcomes once. Party rules already take time/dice and the prior turn supplied injected repository ownership/import safety. TTS import/configuration remains stdlib-only with explicit model startup.

SIGINT/SIGTERM now share an idempotent shutdown operation. It stops admission/work, disposes audio, terminates owned WebSockets, closes the listener and drains HTTP for at most five seconds before destroying stalled connections. Final legacy persistence and store close follow transport closure. Failed final persistence still closes storage and rejects shutdown, producing a nonzero process outcome. Listener failure uses cleanup too. Background narration/poll completion checks stopped state before application. Abrupt OS termination and already accepted external jobs remain outside graceful cleanup guarantees.

Verification: **92/92 tests pass against source and emitted services**, no skipped/cancelled cases; all eight workspaces pass lint/build. Seven new cases cover deterministic dice/invalid samples, injected time/timers/fetch, caller abort and ignored abort, stale timer suppression, real owned HTTP/WebSocket closure, same-promise shutdown, stalled HTTP and store close after failed flush. Actual server verification holds an authenticated socket and a never-resolving synthetic audio lookup, delivers SIGTERM through test-only IPC, and verifies clean zero exit plus persisted cues. No production IPC or shutdown endpoint was added. The interrupted emitted-suite handle was missing on resume; a fresh emitted run completed successfully. Existing synthetic TTRPG/Party/restart/privacy suites still pass.

[Lifecycle ownership, compatibility and rollback](server-lifecycle.md), architecture, store docs, tests, verification matrix and PLAN are updated. Inventory and whitespace review are refreshed. No private data, model/provider, live audio, generated output, installation, commit or publication was used. The two optional Vite bundle warnings and browser/device gates remain. The full goal stays active with 37 actionable tasks open; the previous goal work and this continuation made concrete implementation/verification progress.

## Versioned non-destructive schema adoption and restore compatibility — October 24, 2026

**ENGINE-06 is complete: 45/81 actionable tasks checked, 36 open.** One import-safe runner now owns the nine legacy tables and five authority/command tables. Ordered versions 1/2 retain checksummed history and SQLite user_version, adopting compatible unversioned layouts without rewriting JSON, authority or receipts. Pending DDL/history/version changes commit together in an immediate transaction. Read-only preflight precedes WAL configuration and refuses incompatible columns/keys/defaults, missing required unique keys (including partial-only indexes), unrelated unversioned databases, future versions and missing/tampered history. Compatible extra columns remain; explicit command insert columns keep new commits working after adoption. Custom constraints/triggers/index semantics and legacy JSON validation remain outside structural validation.

Six new source/emitted cases verify fresh/repeated/ordered upgrades, injected mid-upgrade failure and rollback, byte-exact legacy JSON and authority/state/receipt preservation, new commands with extra columns, incompatible/history/future refusal, and WAL-aware online backup plus independent disposable restore/adoption. The future-version fixture checks unchanged persistent bytes. Backup fixtures verify integrity and committed WAL data, then retain the earlier restored value after the source changes. All data is synthetic; no real campaign database, private file or provider was opened. Two owned fixture directories left by the first containment-guard failure were verified inside repo tmp and removed; subsequent runs clean up successfully.

Verification: **98/98 tests pass against source and emitted services**, with no skipped/cancelled cases. All eight workspaces pass lint/build; the final focused game-server build/lint and source/emitted suites pass after review fixes. Inventory and whitespace review are refreshed. Existing optional Vite bundle-size warnings remain, as do browser/device/audio/GPU gates.

[Migration and backup compatibility](schema-migrations.md), architecture, game-store docs, tests, matrix and PLAN record the boundary. Review found the runtime service still directly copies the main SQLite file, which does not establish active WAL consistency. CAP-10 remains open for product backup manifests/restore controls; ENGINE-07 retention and broader ROOT-03/04 validation remain open. A separately authorized real-data migration needs a verified consistent backup and disposable rehearsal before pointing this build at that path; none was performed here. No dependencies, commit or publication were introduced. The full goal remains active with 36 tasks open.

## Bounded commit metadata with durable outcome replay — October 24, 2026

**ENGINE-07 is complete: 46/81 actionable tasks checked, 35 open.** CommandStore retains the latest 5,000 private commit envelopes globally, across both modes and all rooms. Startup trimming and per-command trimming use transactions; command trimming shares legacy/checkpoint/receipt persistence. Insertion order, rather than timestamps, protects ordering across clock corrections. Invalid injected test policies fail before schema initialization. A private historyWindow method explicitly reports truncation and retained bounds, including an empty window for a checkpoint whose envelopes have all expired. No public endpoint or audience projection was added.

Only redundant command_events metadata expires. Exact accepted receipts, canonical fingerprints, complete checkpoints, recorded outcomes, authority and user/domain records/files are preserved. Replay stays independent of envelope retention, rejects changed payloads and never rerolls/reapplies accepted effects. This bounds metadata history, not the whole database or durable outcomes. Recent TTRPG roll/event UI windows and session summaries remain incomplete presentation history; the retained metadata journal is not a complete event-sourced audit archive. No schema version change or VACUUM is introduced. Older builds cannot restore trimmed metadata, though receipt/checkpoint formats remain compatible; documentation calls for a verified backup if complete metadata history is needed before policy adoption.

Five new source/emitted cases prove global multi-room/mode bounds with a backward clock, retained/empty-window reporting, exact receipts/conflicts/checkpoints, invalid policy refusal and full rollback after an injected metadata-delete failure. Seven synthetic Party players resolve a round, evict its envelope, recover through a fresh service and replay identical results without new dice/publication. An actual game-server fixture accepts a roll, stops, seeds over 5,000 owned synthetic envelopes, then restarts: startup evicts the old envelope while exact roll replay, conflict detection, state revision and recent rolls remain unchanged. Initial focused fixture failures came from assuming manual lock after automatic all-choice lock and omitting the legacy required actor name; the fixtures now follow the actual producer contracts and pass. No private data or live provider was used.

Verification: **103/103 tests pass against source and emitted services**, no skipped/cancelled cases. All eight workspaces pass lint/build. Existing optional Vite bundle warnings and rendered/physical gates remain. [Retention/recovery policy](command-history.md), architecture, store/protocol docs, tests, matrix and PLAN now explain the boundary; inventory and whitespace review are refreshed. Product backup/restore and full audit archival remain separate work. No dependencies, commits or publication were introduced. The prior goal turn and this continuation both made concrete progress; the full goal remains active with 35 tasks open.

## Table read/export extraction and deliberate duplicate-route compatibility — October 24, 2026

ENGINE-01 progress; **46/81 tasks remain checked, 35 open.** The entrypoint now installs table reads through table-read-routes.ts with snapshot/runtime readers, an explicit summary directory and injected clock. Party summaries, compact recent rolls, runtime, snapshots and host summary exports have one focused owner. The host Markdown formatter and existing filename sanitizer moved to import-safe session-summary.ts; memory export callers reuse the sanitizer. Filename and footer share one timestamp. SQLite, domain mutations and transport composition stay outside these modules.

The unreachable second GET /api/rolls handler is removed. The original first handler's compact name/dice/modifier/total/note/time response remains compatible for all audiences. Both app clients submit rolls by POST and obtain full records from snapshots/frames, so no app endpoint migration was needed. The installer remains after existing session/profile/command middleware. Exact read handlers move before unrelated image/speech/player paths without changing matching middleware. Non-host summaries still intercept through audience projection before private host formatting/file creation; the host export handler also checks identity before side effects. Export failures retain generic error bodies.

Two new source/emitted checks cover all five paths' unauthenticated denial, compact response allowlists, host/player/display compatibility, snapshot privacy, no non-host disk exports, host-only private notes/attachment path/content and synthetic export-directory obstruction. A host file failure leaves projected player summaries working. Populated/empty formatter cases verify deterministic sections, sanitized path parts and unchanged inputs. An initial expected key-order typo in the test was corrected; the fixtures now pass. Existing TTRPG authorization/projection, claim/roll/propose/approve, export, persistence failure/replay/restart and seven-client Party checks continue passing.

Verification: **105/105 tests pass against source and emitted services**, no skipped/cancelled cases; all eight workspaces pass lint/build. Existing optional Vite bundle warnings remain. [Server extraction boundaries and remaining work](server-refactor.md), architecture, PLAN progress, tests, matrix and static inventory are updated; whitespace review passes. No private data, providers, dependency installation, schema change, commit or publication was involved. ENGINE-01 remains open for mutations/approvals, context/memory/capability handlers and socket delivery. Rendered/browser/physical gates remain unverified. Both the preceding goal turn and this continuation made concrete progress; the full goal remains active.

## State application and approval extraction with malformed-queue protection — October 24, 2026

ENGINE-01 progress; **46/81 tasks remain checked, 35 open.** State application/summarization now lives in state-events.ts with current-character lookup, event recording and publication hooks. HP clamps, condition add/remove/no-op semantics, resource assignment and initiative set/clear retain their existing successful result/event shapes. Per-operation lookup preserves rollback's replacement of collection objects. The owner has no HTTP, SQLite, file or configuration access; it still mutates caller-owned state inside the existing transaction boundary rather than claiming a completed pure mode reducer.

Queue/propose/approve/reject/direct-apply registrations moved to state-event-routes.ts at their prior registration position. Existing session/ownership/command middleware, shared queue, role checks, apply/log/memory/publication order and deferred export/broadcast behavior remain. Proposal timestamps now use injected server time. Scene-packet proposals keep the same queue/summarizer. No second store, transaction owner or file writer was added.

Application now invokes the existing shared state-event guard before lookup/mutation. Queued/persisted malformed initiative previously converted to null and cleared initiative; it now returns a generic 400 without application, event logging or publication. Unknown kinds and non-finite nested numbers fail too. Direct HTTP integer/range validation remains separate. The invalid persisted proposal is retained for deliberate rejection; full loaded-record/scene-packet validation and resulting UI handling remain ROOT-03 work.

Four source/emitted cases cover all five state kinds, clamps, condition no-ops, missing targets/resources, fresh lookup after object replacement and malformed values. Actual isolated server fixtures verify player ownership/forged-submitter normalization and denied queue/direct/approval access. A failed approval receipt insert restores character/queue/log/memory/revision and creates no memory file; same-ID retry succeeds once, exact replay survives restart, and rejection has no state effect. A separately corrupted owned synthetic proposal cannot clear saved initiative or disappear on approval.

Verification: **109/109 tests pass against source and emitted services**, no skipped/cancelled cases; all eight workspaces pass lint/build. Existing optional Vite size warnings remain. [State/approval boundaries and limits](server-refactor.md#state-event-application-and-approval-routes), architecture, tests, matrix, inventory and PLAN progress are updated; whitespace review passes. No private data, provider, dependency install, schema change, commit or publication was used. ENGINE-01 remains open for character/claim/roll/control handlers, context/memory/capability orchestration and socket delivery, with rendered/physical gates still pending. Both preceding and current goal turns made concrete implementation/verification progress; the full goal remains active.

## Batched character, action-control and roll extraction; executable verification gate — October 24, 2026

**QA-01 is complete: 47/81 actionable tasks checked, 34 open.** The existing executable `npm test` command now passes 112 behavioral cases in both source and emitted-service modes. Coverage includes authoritative rules, permissions/projections, durable receipt scope/conflicts/replay, transaction rollback and process restart, versioned migrations, concurrent last-choice locking and duplicate lock/deadline refusal. These are behavioral synthetic checks, not filename assertions. Browser/physical acceptance and CI remain separate unchecked tasks.

Character creation and claim/release were extracted and verified in the preceding slice (111 cases). The final progress-log write was blocked by an account usage-limit review failure; access has now returned. This continuation moves action setting, narration toggles, scene/save and roll submission together into ttrpg-action-routes.ts. Live accessors retain rollback-owned scalar controls, while the existing command middleware still owns authorization, revisions, receipts, persistence and deferred effects. No stored format or response shape changes. Character fixtures prove creation/switch/release rollback, identity/note privacy, stale races and old-claim replay without reclaiming after reassignment.

A new real-server fixture completes an action with two original synthetic claimed characters. Injecting a final-roll receipt failure restores rolls/events/revision, the current action and pending narration together. Retry prepares fallback narration and clears the action once; exact replay and restart preserve the recorded result and narration setting. Existing host controls and legacy tests retain scene/save/export, ownership and transport coverage. Optional narration/media calls remain in the extracted installer with existing deferral; this does not complete stale-result, queue or adapter consolidation under CAP-02/05.

Verification: **112/112 source and emitted tests pass**, with no skipped/cancelled cases; all eight workspaces pass lint/build. The first full source run was denied local connections by the sandbox (EACCES); the same checks pass with loopback access. That failed run left its lifecycle case stalled; process IDs and exact test command/parent identity were checked before stopping only that owned runner/case. No live session process was stopped. The new fixture's initial focused failure was a test authorization-header mismatch, corrected to the existing Bearer contract. Existing optional Vite chunk warnings remain.

PLAN, extraction/architecture docs, verification matrix, test guidance and inventory are updated. ENGINE-01 stays open for context/memory, capability orchestration and socket delivery; mode/interface work and browser/device/audio/GPU gates remain. No private data, real provider, dependency installation, schema migration of real data, commit or publication was performed. The prior goal turn was no progress due to tool access; this continuation made concrete implementation and verification progress. The full goal remains active with 34 tasks open.

## Bounded narration with session/revision cancellation — October 24, 2026

**CAP-02 is complete: 48/81 actionable tasks checked, 33 open.** Automatic roll narration and host local-model drafts share an import-safe injected owner with a ten-second whole-completion deadline, including body decoding. One replaceable slot per caller kind limits owned presentation work. Caller cancellation, replacement, committed scope changes, room reset and shutdown settle pending work, abort transport and suppress late completions even if a fake adapter ignores abort. Every result checks session, mode, round, stage and revision before use. Closed/stopped owners refuse work before reading current storage.

Roll commands still commit immediately with prepared prose; post-commit generation cannot decide authoritative state or resubmit on receipt replay. Timeout/error retains fallback without replaying fallback speech. Current valid prose works; obsolete results neither overwrite narration nor record output logs. Drafts retain prepared fallback on provider failure; stale/cancelled drafts return generic 409 rather than reporting a current success. New completion logs exclude provider error bodies and prose. Provider selection and private-data policies are unchanged; broader prompt/output validation remains CAP-03. Comfy/TTS consolidation, external job cancellation, GPU admission and audible playback remain CAP-05/06/09, not claimed by this owner.

Five additional source/emitted checks cover successful/blank/oversized/failing output, fake deadline and ignored abort/late body, all scope dimensions, replacement, caller cancellation and shutdown. An actual isolated server uses delayed canned completions to verify draft conflicts after action advancement/room reset, unchanged prepared narration after a newer action, successful current draft/roll narration without another authoritative revision, and no extra generation on exact receipt replay. The fixture adds a bounded test-only delay; no provider or model is contacted.

Verification: **117/117 tests pass in source and emitted modes**, no skipped/cancelled cases; affected game-server build/lint passes. The previous integration milestone's all-eight workspace checks remain the broader baseline; no unrelated app rebuild was needed for this server-only change. PLAN, narration/architecture docs, test guidance, matrix and static inventory are updated; whitespace review passes. No private data, new dependency, real-data migration, commit or publication was used. Browser/device/audio/GPU gates remain open. The preceding and current goal turns made concrete progress; the full goal stays active with 33 tasks open.

## Explicit off-host inference consent — October 24, 2026

**CAP-04 is complete: 49/81 tasks checked, 32 open.** The shared configuration now requires `BDE_ALLOW_REMOTE_AI=1` for the selected non-loopback AI endpoint, including LAN/Ollama-compatible hosts and default OpenAI/chatgpt cloud URLs. A provider selector, key or URL alone cannot permit context transport. Host-local OpenAI-compatible servers remain available; Party disables inference regardless of consent. Invalid flag values fail configuration. Both provider transports reject redirects; failure never tries another provider. Policy refusal returns the existing disabled/fallback result without preventing legal commands. No remote service was enabled.

Two new cases cover endpoint locality/normalization, aliases, consent/Party override and invalid flags, then invoke source/emitted adapters in nine allowlisted subprocess environments with fake transport. Blocked cases make zero requests; permitted cases use only their selected URL with redirects refused; a failed local provider cannot use a configured synthetic remote key. No live network/provider request occurs in these policy tests. A deliberately trusted local proxy can forward internally; this boundary controls application requests, not arbitrary proxy software.

Verification: **119/119 tests pass in source and emitted modes**, no skips/cancellations; all eight workspaces pass lint/build, with the same two optional Vite chunk warnings. Example environment, runtime policy/package guidance, tests, matrix and PLAN are updated; whitespace review passes. Private environment/data and providers were untouched; no dependencies, commit or publication. CAP-01 readiness, CAP-03 prompt/output coverage and CAP-05 speech/media consolidation remain open, along with device gates. Both preceding and current goal turns made implementation/verification progress; the full goal remains active with 32 tasks open.

## Observed capability health instead of configured-URL success — October 24, 2026

**CAP-01 is complete: 50/81 tasks checked, 31 open.** Runtime service records now carry additive enabled/configured flags, explicit disabled/unconfigured/configured/reachable/ready/busy/failed state and observation time. Dashboard labels consume the state; player/display projections retain empty service lists. Configuration alone no longer claims success. An import-safe health owner shares refreshes, bounds each whole probe to 2.5 seconds, aborts/discards late work at disposal and expires observations after 30 seconds. The existing runtime timer performs asynchronous refresh; a host-only endpoint provides manual refresh without changing the game revision. Failure degrades diagnostics with generic warnings while core commands remain independent.

Read-only AI model advertisement respects remote consent and never submits inference; audio/TTS require identity/readiness evidence. Router health stays reachable because its configuration does not prove GPU readiness. Five new source/emitted fixtures cover lifecycle, flags/states, protocol identity, additive guard/schema linkage, static dashboard labels and actual host/player/Party routes. Existing fake-provider subprocess cases now exercise AI probes too; blocked cases make zero calls. No providers, models, private libraries, speech or GPU work were used. Initial focused fixtures exposed a missing public enum export and an incorrectly escaped generated-test regex; both were corrected before verification.

Verification: **124/124 source and emitted tests pass**, no skipped/cancelled cases; all eight workspaces pass lint/build. Final schema-link/static-label checks also pass in both modes. The same two optional Vite bundle warnings remain. PLAN, capability/schema/architecture docs, test guidance, matrix and inventory are updated; whitespace review passes. No dependency installation, private data access, commit or publication. Actual inference/audio/device performance remains unverified under the remaining capability/release gates. Both preceding and current goal turns made concrete progress; the full goal remains active with 31 tasks open.


## Bounded speech and automatic scene-image ownership — October 25, 2026

**CAP-05 advances; 50/81 tasks remain checked, 31 open.** Speech now has one active/two waiting jobs, caller-specific cancellation, whole-request deadlines, current-scope deduplication and an eight-item/16 MiB transient cache. Checked transport envelopes reject malformed/oversized audio with generic errors; no full audio decoder is claimed. The host browser owns speech/playback, replacing wasted server self-requests that discarded bytes. Shutdown and committed scope changes settle pending work and suppress late cache writes.

Scene/roll handlers now call an injected scene-image owner instead of duplicated workflows/direct fetches. It admits one active/two waiting submissions, bounds queued/transport/body time and acknowledgment size, validates prompt IDs, refuses redirects, deduplicates pending and settled attempts, and cancels stale/shutdown work. Failed/ambiguous attempts are retained within the bounded current scope so retries cannot silently enqueue duplicate GPU work. No automatic result changes authoritative state. Submission acknowledgment does not prove generation or cancellation of already accepted remote work. Manual media-router lifecycle and physical GPU scheduling remain open.

Six speech and five scene-image cases plus the strengthened real group-roll fixture establish admission/cache limits, caller ownership, every scope dimension, malformed/oversized responses, ignored cancellation, disabled zero calls and actual host/player authorization. Isolated scene and roll command checks prove no submission on receipt failure, one on success and no extra request on exact/restart replay. All provider replies are synthetic. No model or private data was accessed.

Verification: **135/135 source and emitted tests pass**, no skips/cancellations; the strengthened source roll fixture also passes separately. All eight workspaces pass lint/build with the same two optional Vite chunk warnings. PLAN, optional-work behavior, server/narration guidance, tests, verification matrix and inventory are updated. Whitespace review passes. No install, commit or publication. Browser/device/audio/GPU acceptance stays unchecked; the full overhaul goal remains active. The preceding goal turn supplied editable wording without implementation; this turn revalidated the pending test handle and made concrete implementation/verification progress.


## Media admission and online backup integration — October 25, 2026

**CAP-05 complete: 51/81 checked, 30 open.** Manual router work now has bounded shared admission, whole-request/body deadlines, cancellation and late-result protection. Admission is persisted before network calls; failed storage sends nothing, ambiguous/failed attempts cannot resubmit after restart, and confirmed router IDs survive restart. Host controls explain and disable previously attempted generation. Eleven router cases include ignored abort, malformed replies, bounded attempts, manual failure, room replacement and successful restart recovery.

CAP-10 advances with SQLite online snapshots, private checksummed/versioned manifests, bounded listing, authenticated read-only integrity/schema validation and disposable restore rehearsals. Runtime backup operations now forward credentials to the database owner. Raw main-file copies and the unauthenticated five-second startup copy are removed; automatic session scheduling remains unfinished. Shutdown awaits an active snapshot before closing SQLite. Five new cases include actual host/player endpoints and an owned runtime/game-server pair. All fixtures stay under owned temporary roots; real databases/backups were untouched.

Final combined verification: **147/147 source and emitted tests pass**, no skips/cancellations; all eight workspaces pass lint/build. The two existing optional Vite chunk warnings remain. Whitespace and backup-ignore checks pass. No installation, private-data access, commit or publication. The preceding and current turns made implementation progress; the full goal stays active. Automatic backups, broader diagnostics/resource measurement and physical browser/device/audio/GPU gates remain open.


## Approved asset transport — October 25, 2026

**CAP-07 complete: 52/81 checked, 29 open.** Removed directory-wide serving and enumeration. Record-ID content requests enforce approval, current session/audience, canonical root containment, bounded regular-file reads and type/signature agreement. Host approval validates the file and commits before publication; failed storage restores status. Gallery images use authenticated private blob URLs with cleanup/late-result suppression. Legacy filenames have no unrestricted fallback.

Four additional cases plus existing projection/gallery/media fixtures cover owned junction escape, missing/incorrect/oversized files, approval rollback, player/display visibility, persistence/restart, valid host confirmation and URL ownership. A static import failure exposed a browser-session import boundary and was fixed through injected request ownership. **151/151 source and emitted tests pass**; affected server/dashboard lint/build passes (existing optional Vite warning remains). No dependency installation, real asset access, commit or publication. Browser rendering and physical decoding remain open. Both preceding and current turns made concrete progress; the full goal remains active.

## Backup, measured runtime and AI audience integration — October 25, 2026

**55/81 checked, 26 open. RUN-08, CAP-10 and CAP-03 completed.** Automatic process-start/graceful-end backups publish validated online snapshots by default. Launchers isolate snapshots beside selected data. Startup failure preserves play and warns the host; manual recovery clears the warning. Graceful shutdown waits for publication and final-state capture. Abrupt termination cannot provide an end snapshot; room replacement is not a process boundary.

Operational diagnostics now keep two 24-entry metadata windows. Raw scene titles/prompts/errors/provider bodies/paths are excluded, and export failure does not fail a game operation. AI transport bounds JSON/body/text and whole-request deadlines. Actual memory/event-loop samples replace invented core latency numbers and influence optional admission; GPU capacity stays explicitly unmeasured.

The seven-player harness measures 75 commands across five rounds with host/display sockets. An isolated Windows/Node24/Ryzen7600X3D loopback run measured acknowledgement p95/max 20.30/22.65 ms and all-nine-socket delivery 20.07/22.34 ms. Physical Wi-Fi, browser rendering and mobile sleep remain unverified.

Four duplicated AI input builders share an audience-aware owner. Public narration excludes private/player-only events and private fact containers before prompting. GM guidance preserves source/visibility labels. Wrong-audience narration is refused before transport; action proposals retain strict contracts and explicit validated application. Private paths/raw payloads/character notes never enter this context. Source labels and policy text do not guarantee model quality; prepared drafts still require host review.

Final integration: **162/162 source and emitted tests pass**, no skips/cancellations. All eight workspace lint/build checks passed after shared resource/config changes; subsequent server-only context changes pass affected lint/build. Two existing optional Vite chunk warnings remain. A legacy plain-object provider mock was updated to a real HTTP Response after bounded streaming exposed it; the suite then passed. New cases cover backup lifecycle/recovery, diagnostic failure/canaries, resource boundaries/privacy, concurrent delivery and actual public/GM provider captures. No dependency install, private-data access, commit, push or publication. The full overhaul remains unfinished; browser/device/audio/GPU gates and remaining structural work stay open.
