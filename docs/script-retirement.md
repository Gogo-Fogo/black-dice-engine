# Historical helper retirement

The October 24, 2026 caller review covered root manifests/launchers, apps, services, shared packages, maintained scripts, tests, docs and project skills. No import, package command or maintained instruction called the five helpers below. There was no `.github` workflow directory. The static inventory listed the scripts without invoking them. None of the helpers was executed during review.

| Removed helper | Reason | Maintained replacement or disposition |
| --- | --- | --- |
| `scripts/wrap-gm-panels.js` | One-time string rewriting of the dashboard, dependent on old source structure and cwd | Edit actual React components through reviewed source changes and run app lint/build. Never rerun an obsolete migration against the current dashboard. |
| `scripts/download-sdxl-lightning.bat` | Machine-specific checkpoint destination and automatic multi-gigabyte download | Model provisioning is separately managed by the user. Applications consume explicit endpoints/files; launchers never install or download models. No automatic downloader replacement. |
| `scripts/test-sdxl-lightning.js` | Live GPU generation/polling through a fixed endpoint, presented as a test | Use isolated adapter/HTTP fixtures for regressions. Separately authorized live generation requires explicit provider configuration and suitable original/demo input; no live benchmark replacement is provided. |
| `scripts/test-ipadapter.js` | Live generation with a particular local input/model assumption | Same disposition; no private input, workflow payload or generated output is copied into replacement fixtures. |
| `scripts/time-test.js` | Unbounded live generation timing loop using a fixed endpoint | Use separately authorized host profiling when optional generation is implemented. Synthetic correctness tests do not establish GPU latency. |

Supported startup is [Party](party-launch.md) or [full session](full-session-launch.md); static mapping is `npm run inventory`; regression checks are documented in [tests](../tests/README.md). The router remains a preparation scaffold; prepared jobs are not proof of successful ComfyUI execution. Async queue/cancellation and actual-host performance remain open capability tasks.

These are source-code removals only. No model, generated asset, real campaign, user-owned input, intentional sample scenario, schema, license or skill notice is removed or modified by retirement. The files remain recoverable from prior Git history if their historical implementation needs inspection; restoring one does not make it a supported startup/test path. No data or configuration migration is required.
