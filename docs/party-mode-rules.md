# Party Mode: The Midnight Bell

Implementation target for PLAN.md BASE-05. These are original demo rules. Timing is provisional until a full rehearsal; no live-play claim is implied.

## Setup and timing

One local host runs a room for 6–7 players. The host may also occupy a normal player seat using a separate player credential. A public TV displays the story and revealed outcomes; each phone sees its own unsubmitted/submitted choice. Use unique, editable display labels rather than real identities. Late arrivals wait for the next round.

The group must repair a runaway clocktower before its fifth midnight bell. Play five rounds, aiming for 20–30 minutes including joining, explanation, and discussion. Budget roughly two minutes to discuss, 60 seconds to choose, and one minute to reveal/resolve per round. Host actions advance reveal and discussion; they do not change dice results.

## Round loop

1. Introduce the next prepared scene and three legal options. Freeze that round's participating seats when choices open.
2. Every active player privately submits one option. A replacement is allowed until locking. An acknowledgement confirms the saved choice only to its owner; everyone else receives an aggregate submitted count.
3. Lock atomically when all participating seats have submitted, the deadline passes, or the host locks. Missing/disconnected seats pass. Deadline, final submission, and host lock compete for one transition, never three resolutions. Choices after locking are rejected.
4. Reveal the locked choices together. Before this point no public payload, log, sound, narration, or animation identifies a choice.
5. Resolve once in ascending immutable seat order, recording server-generated d6 results before publishing. A pass rolls nothing and changes neither score nor danger. A retry, reconnect, or restart reuses recorded outcomes.
6. Publish results and totals. The host advances after discussion; after round five, publish the ending and tied winners.

## Choices and consequences

Each round offers these rules with scene-specific labels:

| Option | Success | Personal points | Shared danger |
| --- | --- | --- | --- |
| Mend | d6 ≥ 3 | +2 on success, otherwise 0 | −1 on success, otherwise +1 |
| Dare | d6 ≥ 5 | +4 on success, otherwise 0 | unchanged on success, otherwise +2 |
| Guard | d6 ≥ 2 | +1 on success, otherwise 0 | −1 on success, otherwise unchanged |

Danger starts at 3 and is clamped to 0–12 after each seat resolves. Zero points is the minimum. Danger does not end the game early: everyone gets five rounds. Seat order is visible and stable so clamping cannot depend on network arrival order. A host skip records a pass for unresolved seats; it never rerolls an already resolved seat.

## Five prepared scenes

| Round | Prompt | Mend / Dare / Guard labels |
| --- | --- | --- |
| 1 | The clocktower's brass door sneezes sparks. | Repair the latch / Ride the spring / Shield the entrance |
| 2 | Wind-up pigeons carry away the minute hand. | Build a decoy / Leap for the hand / Catch falling gears |
| 3 | The stairs rotate into a sideways maze. | Align the steps / Race the turning stairs / Anchor the rope |
| 4 | A kettle-shaped thundercloud fills the workshop. | Patch the vent / Bottle the lightning / Ground the benches |
| 5 | The midnight bell begins to glow. | Tune the bell / Strike the wild chord / Brace the tower |

Prepared narration states each success/failure in plain text. AI, TTS, images, custom actions, accusations, and secret objectives are unnecessary for this first game.

## Ending and recovery

At danger 0–3, the tower rings a harmless rainbow: everyone saves the town. At 4–7, the town survives a spectacular shower of confetti. At 8–12, the tower becomes a giant cuckoo; everyone escapes and must explain the bird. Highest personal score earns the Clockkeeper title; equal scores share the title, with no random tie-breaker.

The host can extend an open deadline or pause it with the remaining duration saved. Resume starts a new deadline from that duration. After restart, any unfinished game stays paused until the host deliberately resumes; locked choices and recorded outcomes remain immutable. Starting a new game creates a distinct session and invalidates old commands and credentials. It never deletes the old recovery record.

Rehearsal must check pace, readable TV text, seven concurrent phones, stale/duplicate commands, disconnects, persistence failure, restart, and the no-private-choice-before-lock invariant. If five rounds exceed the target, change the prepared pacing before release and document the measured result.
