# DeepSeek campaign live check — 2026-10-25

User-authorized spending ceiling: **$0.50 total**. Made **15 real DeepSeek Flash calls** using original synthetic Lantern Quay characters and events. Estimated charge from reported usage, conservatively using peak uncached prices: **$0.01284** (about 1.3 cents). Full request reservations total $0.05181, including output and input headroom. These are estimates, not an account billing statement; weekend/cache discounts can reduce the charge.

Official references: [pricing](https://api-docs.deepseek.com/quick_start/pricing/), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/), [completion API](https://api-docs.deepseek.com/api/create-chat-completion/). The current pricing page identifies `deepseek-flash` as DeepSeek-V4.1-Flash-1017. Rate basis used: $0.30/M input, $1.20/M output.

## Findings and changes

The original nine-call run produced seven usable answers and two empty replies. Both empty replies ended with `finish_reason: length`: all 550/400 output tokens were spent on internal thinking. The adapter now disables thinking specifically for the official DeepSeek host, preserving other compatible providers' request formats. Empty and token-truncated remote completions now return a sanitized error rather than being treated as successful output. There is no automatic paid retry or provider fallback.

Five rechecks after this fix all completed with `stop`, taking 1.25–3.18 seconds. Manual review caught an additional director continuity error: it prematurely treated an offered walkway and stalled scene as resolved. The director prompt now distinguishes offered steps from completed events, requires an explicit completed scene record before declaring closure, and starts from the current location. A sixth recheck (3.13 seconds) correctly retained the pending favor, untraversed route and open scene while suggesting forward progress. Suggested developments remain subject to GM approval.

## Coverage

| Synthetic scenario | Result and evidence |
| --- | --- |
| Earned key | Valid action JSON; enters archive without reacquiring key or adding another errand. |
| Group DC 17: Mara 14, Rook 19 | Narration names both, preserves Mara's alarm failure and Rook's chart recovery. |
| Rook 12 against DC 18 | Narrates failure and the GM-approved alternative walkway; retains the chart. |
| Three repeated gate attempts | Latest director reply avoids an equivalent reroll and distinguishes a proposed route from completed progress. |
| Closed archive scene / restored progress JSON | Valid action JSON advances beacon repair; does not repeat archive work. |
| Unknown DC / roll 19 | Describes an unresolved attempt without declaring success. |
| Completed objective and milestone | Director offers celebration/epilogue, without another mandatory repair gate. |
| Public victory narration | Delivers repaired beacon and safe boat; no hidden saboteur disclosure. |

The report retains every attempt, including the original two failures. All nine distinct scenario labels have a passing latest execution. Schema, unchanged authoritative snapshot, audience filtering and private-canary absence are automated checks where applicable; narrative correctness and progression are manual judgments, not an automated proof. Internal reasoning text is never retained.

The live calls exercised production prompt assembly, adapter, contracts, progress commands and context filtering with synthetic snapshots. Progress JSON was serialized/reloaded. They did **not** run a real campaign, test hours of play, test images/TTS, measure the RTX, or verify phone/browser interactions. Twelve separate regression tests passed, including mocked HTTP routes, persistence/replay/rollback, audience filtering and empty/truncated completion handling. All 12 regression cases passed against both source and emitted modules (24 executions). Server lint/build and `git diff --check` passed. The existing Party server and tunnel were left running; applying changed server code to a running process requires its next restart.

These results support using Flash for GM-reviewed narration and suggestions. They do not establish autonomous long-session reliability. Authoritative dice, durable progress and host approvals remain necessary.

## Explicit reruns

With an existing ignored `.env` containing the configured provider/key/consent:

```powershell
node --import tsx scripts/deepseek-campaign-check.mjs --live
# Targeted recheck, still constructing all preceding synthetic state:
node --import tsx scripts/deepseek-campaign-check.mjs --live --only=stalled-scene-concrete-way-forward
```

Only run with explicit paid authorization. The script permits the official Flash endpoint only, bounded input/output, no tools or streaming, serial requests and no automatic retry. It persists reservations **before** each request in ignored `tmp/deepseek-campaign-live.json`; do not reset this file to bypass a spending limit. Its shared ceiling is 16 calls and $0.45 conservative reservations, below the authorized $0.50. The campaign run used 15 calls; a subsequent Forge flavor check used the final allowed call. Shared total: 16 calls, estimated $0.0134742. The call guard is exhausted; do not reset it or run more paid checks without new authorization. It reads only selected configuration variables, never prints the key, and sends only original demo content. Latest failures set a failing exit status; prior failed attempts remain available for review. No dependency installation is needed.
