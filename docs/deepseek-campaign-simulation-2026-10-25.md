# DeepSeek campaign simulation — $0.30 authorization

Forty live DeepSeek Flash calls exercised production context assembly, proposal parsing, narration and director guidance against two original synthetic adventures. No private campaign, PDF, real database, images or TTS was used. The existing running services were not restarted. This is a scripted campaign test, not an autonomous multi-hour playthrough or a physical-device rehearsal.

## Budget and evidence

- Separate ignored ledger: `tmp/deepseek-2026-10-25-c.json`. Previous authorizations were not reset.
- User maximum: **$0.30**. Added `--budget-usd=0.30`, immutable per named ledger, with a **$0.27 reservation ceiling**. Calls reserve bounded input bytes plus protocol headroom and maximum output before sending; timeouts retain reservations. There are no automatic paid retries.
- Final peak/uncached usage estimate: **$0.0279468 (2.79 cents)**. Conservative reservations: **$0.1441683**. These are estimates, not an account invoice; [official pricing](https://api-docs.deepseek.com/quick_start/pricing/) was checked for this run ($0.30/M input, $1.20/M output at peak).
- An orchestration mistake overlapped the initial twelve-beat and eight-beat runs against the same ledger. Part of the first run's log was overwritten. Preserved the pre-reconciliation ledger; recovered the first run's exact aggregate usage from completed stdout, added the five omitted call records with deliberately high reservations, and documented the reconciliation inside the ledger. Six full response texts were lost; those beats were rerun. Do not interpret the initial ledger as twenty complete independently retained responses.
- Added an exclusive lock across each whole run so another process using that ledger fails before any request. A crashed process may leave a lock: inspect ownership before recovering it; never clear it blindly.
- Subsequently reran both entire scripts serially after the prompt fix: all **20 distinct latest scenarios** retain full response evidence and passed the automated checks. All forty calls returned usable answers. Automated schema/canary passes are separate from manual continuity review.
- Observed HTTP-response arrival latency across forty calls: median **1.81 seconds**, range **1.34–3.01 seconds**, p95 **2.70 seconds**. These timestamps precede reading the complete response body and exclude UI/network delivery; they are not full player-visible latency.

## Coverage and manual findings

**The Clockwork Orchard (twelve beats):** two simultaneous objectives, a resolved gate, an unsuccessful bridge crossing with a root-tunnel alternative, keeper rescue, promised mill key, transition to the engine, mixed group results, earned milestone and celebration, unknown-DC performance.

**The Lantern Quay Beacon (eight beats):** earned archive key, Mara 14/Rook 19 against DC 17, Rook 12 against DC 18, repeated failed attempts, offered rather than completed favor, serialized/restored progress, repair from the new scene, unknown-DC examination, finished adventure and public victory narration.

Latest responses preserved the failed/ successful participants separately, kept owned rewards, offered forward progress after failure and did not reopen completed archive/rescue objectives. Director guidance retained the unfinished favor, transitioned away from the stalled gate and delivered celebration after completion. Public text did not disclose the planted GM-only secret; secret details stayed in GM guidance/consequences. AI did not mutate the supplied authoritative snapshot.

**Two initial manual failures despite automated passes:** narration closed a gate that canon said was open, and a proposal invented a frost-locked door check against an already earned key. Tightened narration instructions to preserve physical facts and proposal instructions to let earned keys work unless an explicit new GM-approved obstacle says otherwise. Rechecked all twenty scenarios: the gate remained open, and the key fit without another lock check.

Remaining limits:

- The model still invents descriptive setting texture, proposed risks and minor NPC behavior. The GM must reject any proposal inconsistent with actual canon.
- A celebration proposal still contains an optional Performance roll, though both outcomes explicitly preserve the milestone. The current structured proposal requires skill/difficulty fields; schema success does not mean every suggestion deserves a roll. The host can simply narrate the payoff.
- One proposal chooses a split-party approach; it is a suggestion, not a player decision or applied event. The table retains agency.
- Current checks explicitly protect synthetic secrets and inspect narrative outcomes manually; they are not a general semantic detector of every contradiction or leak.
- These scripts supply deterministic GM-approved progress between beats. They establish how the model responds to that context, not whether arbitrary future campaign improvisation will always be recorded correctly.

## Verification and next use

Sixteen affected isolated AI/context/progress/roll-route regressions passed with mocked providers, including persistence, projections and hosted roll narration. Game-server lint/build and `git diff --check` passed. No live paid calls occur in these regressions.

Final pre-push check: the complete `npm test` suite passed **187/187** in 18.1 seconds with isolated fixtures and mocked providers. No additional paid requests were made after the forty-call simulation.

Dry-run budget checks confirmed a $0.01 ledger stops after three canned calls, with reservations $0.0087957; five further calls were denied. The concurrent-run lock was also verified to reject another run. Dry runs send nothing.

The forty-call run is complete. Do not continue spending merely to reach the cap. Further paid runs require an applicable unused authorization. If explicitly authorized to reuse this ledger, keep both its existing budget argument and all reservations:

```powershell
node --import tsx scripts/deepseek-campaign-check.mjs --dry-run --ledger=2026-10-25-c --budget-usd=0.30 --long
# Live form shown for documentation; not an instruction to spend:
node --import tsx scripts/deepseek-campaign-check.mjs --live --ledger=2026-10-25-c --budget-usd=0.30 --long
```

Recommendation: use DeepSeek for GM-reviewed play with deterministic progress and approved consequences. These simulations support a trial session; retain the physical phone/TV/network rehearsal as the release gate.
