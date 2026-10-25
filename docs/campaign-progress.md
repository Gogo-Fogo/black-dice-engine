# Campaign progress and continuity

The GM dashboard's **Campaign progress** panel records objectives, clues, obstacles, milestones, facts and scenes. The phone companion shows approved shared records in **Lore → Campaign journal**. Each entry has an explicit audience; defaults are GM-only. Player-visible records are excluded from spectator displays and public-demo narration.

## During play

1. Add an objective or obstacle with a clear completion condition. For a scene, record its purpose and closure conditions in Context / completion conditions.
2. Set the table action and its actual DC. Every participant's result retains the action identity, description, DC and outcome. A missing DC stays unresolved, requiring a GM ruling; it never defaults to success at 10. Natural 1/20 do not override an ability check's DC.
3. After everyone has rolled, open **Actions awaiting approved consequences**. Record the actual payoff, cost or alternative route. Mixed group results are retained individually; the system does not invent a group success rule.
4. Complete the relevant objective/obstacle and write its approved payoff. Record durable clues and milestones as completed entries. For example: the acquired archive key opens the archive, without further errands.
5. Complete the scene record when its closure conditions are met. A closed scene refuses new table checks. Use the existing scene control to start the next scene. Reopening or correcting resolved entries requires a reason and retains the previous record in GM-only history.

A pacing reminder appears after three completed group actions without recorded progress. It asks the GM to establish a payoff, consequence or alternative route. It neither advances the story nor invents canon automatically. Approving a consequence or changing an objective's status resets this count.

## Storage and recovery

`POST /api/campaign-progress` accepts validated GM commands with request IDs and optional table command metadata. It uses the existing transaction/receipt boundary: ledger, controls, revision and response commit together. A failed commit restores in-memory state and emits no committed snapshot. Replaying the same request cannot apply it twice. The shared command guard is `isProgressCommand`; its JSON documentation is `campaign-progress-command.schema.json`.

The ledger is stored in SQLite's existing `meta` table under `campaign-progress:<campaignId>`. It is independent of the recent roll/event feeds and survives restarts. Invalid saved ledger data fails startup rather than silently discarding progress. Existing installations start with an empty ledger; legacy rolls without a recorded DC are not retroactively classified.

Pending group results are retained with the current action, so the short roll feed cannot evict an earlier participant's result. Completed groups enter the durable action ledger. Only one latest roll per participant is used for the group resolution. Approved consequences are immutable; use a new corrective fact to amend one. The command receipt records the approving actor. Scene identities are stable across restart and change when the GM starts a scene, even if its title repeats.

Saved memory entries no longer rotate out at eight records. AI input selects up to twelve confirmed memories from the current campaign, prioritizing the current scene; proposed/rejected/superseded records never become AI canon. Source file paths and memory metadata are excluded.

## Provider input and limits

Action suggestions and director guidance receive confirmed memory, all current ledger entries and the latest eight action resolutions, with explicit source audiences. The ledger supports 200 entries; it rejects further new entries rather than silently evicting completed gates. Prompt copies of each ledger detail/payoff are limited to 800 characters; full records remain saved. Keep key closure conditions and payoffs concise. Full action and correction history remains stored; the UI shows the latest twelve pending consequence forms and latest eight approved consequences.

Public narration retains its stricter public-demo source filter. Its direct group-roll input includes every participant and each actual outcome, rather than only the latest roller. Player-only canon is not sent to that public narration channel. GM suggestions can use GM-only material and remain proposals. Prompt instructions preserve resolved gates, earned payoffs and scene closure and recommend a changed approach/cost after failure. These constraints improve inputs; they do not guarantee that every model-generated sentence is consistent. No generated prose applies inventory, character statistics or progress.

The ledger does not infer quest completion from prose, automatically evaluate textual scene conditions, resolve unclaimed/solo free rolls as group actions, or reconstruct past consequences. Those are explicit GM decisions. To preserve a consequence as long-term prompt canon beyond the recent eight actions, record its lasting clue/fact/objective outcome in the ledger.

## Verification

Synthetic tests in `tests/campaign-progress.test.mjs` cover malformed commands, protected corrections, corrupt saved data, confirmed-memory filtering, old completed gates, mixed group outcomes, missing DC, approved consequences, player/display visibility, failed writes, receipt replay, scene closure, scene transitions and restart. `tests/ttrpg-action-routes.test.mjs` also verifies that a failed final group roll rolls the ledger back atomically. AI calls in these tests are mocked; no paid API or real campaign is used.

Workspace lint/build and 29 targeted tests passed. Host controls and the read-only player journal passed a server rendering smoke check. Browser layout and touch interaction were not exercised because local browser control is disabled in Work settings. The existing running session was not restarted; the server changes take effect on its next normal restart.

The separately requested character creator commit `f30d4c9` was fetched from `origin/feature/character-forge` for review. It has not been merged into this working tree.
