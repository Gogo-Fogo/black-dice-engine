# Capability flags and observed health

Each optional service in the host runtime response now has an additive `capability` observation with `enabled`, `configured`, `state` and nullable `checkedAt`. Legacy service status remains compatible. Dashboard labels show the explicit state. Player/display projections still omit services entirely. The separate capability schema is referenced by the runtime schema and checked against the shared enum; this does not claim full parity of unrelated legacy runtime-schema fields (ROOT-04 remains open).

| State | Evidence |
| --- | --- |
| disabled | Party profile or provider policy forbids the capability; no probe |
| unconfigured | Allowed, but usable endpoint/credentials absent; no probe |
| configured | Configuration exists, but no recent successful observation |
| reachable | Expected service/protocol answered; readiness not proven |
| ready | The capability-specific readiness check passed |
| busy | A ready inference capability currently has owned narration work |
| failed | HTTP/protocol/transport failure or bounded probe timeout |

The game server's existing ten-second runtime timer refreshes observations asynchronously. `POST /api/capabilities/refresh` is a host-only manual refresh, outside authoritative game commands. Concurrent refreshes share one promise. Each check has a 2.5-second whole-completion deadline, including body decoding, and redirects are refused. Disposal aborts active checks; ignored abort cannot publish late status. Observations older than 30 seconds return to configured instead of remaining ready indefinitely. Failed optional probes degrade host diagnostics and add generic warnings; they do not block rolls or Party transitions. No response exposes endpoint URLs, provider error bodies, keys or local paths.

AI uses the selected provider's read-only model advertisement (`/api/tags` or `/models`), respecting the same remote opt-in policy as inference. A matching configured model is ready; a valid list without it is reachable. This proves advertisement, not loaded GPU weights, inference permissions, latency, output quality or capacity. Audio is ready only when the expected service reports a configured nonempty library; that is metadata readiness, not audible playback. TTS requires the expected service and ready status. Router health proves only router reachability: configured workflow metadata cannot prove that the separate Comfy/GPU service works. No health probe submits generation, synthesizes speech or plays audio.

`tests/capability-health.test.mjs` covers flags, configuration, readiness, busy/expired observations, refresh sharing, ignored abort/deadline/disposal, protocol identity, generic failure, additive guard/schema linkage and static dashboard labels. Actual source/emitted server checks verify host refresh, denied player refresh, projected services, unchanged table revision and Party's disabled capabilities. `remote-ai.test.mjs` also exercises read-only AI probes in nine allowlisted fake-transport environments, proving blocked providers make zero health/completion calls. All fixtures are synthetic; live providers, private libraries and real devices remain untested.
