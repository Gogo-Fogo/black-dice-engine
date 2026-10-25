# Player Companion

Phone/tablet companion app for players.

Current first-slice responsibilities:

- Character sheet view.
- Player roll submission.
- Status and resource tracking.
- Player-visible scene updates.
- Visible connection status.

## Screen structure

- **Join** (until a character is claimed): campaign + PIN, then a two-step flow — enter your name, tap a character card.
- **Top bar** (always visible): portrait, name, HP/AC, HP bar, connection dot. A reconnect banner appears when the socket drops, and a "GM is asking for a roll" pill appears when a roll is requested while you're on another tab.
- **Play**: current scene, the GM's roll request (ability, DC, advantage/disadvantage switch, one big roll button), a free dice tray (×1–4, d4–d100), your last rolls.
- **Sheet**: vitals, conditions, abilities and proficient skills (tap to roll), resources as pips, inventory, notes, device settings (dice sound, switch character).
- **Table**: party HP/AC/conditions, full roll feed, join link + PIN.
- **Lore**: player-visible memory entries, filterable by kind.

The dice overlay shows the natural roll, modifier, nat 20/nat 1 callouts and pass/fail against the DC when the roll answers the GM's request. Haptics fire on roll requests and results; reduced-motion users skip the 3D throw. Skill modifiers assume proficiency, using a bonus derived from the trailing level in `classLabel`.

## Dice animations and the Dice Lab

Open `?lab=dice` (or Sheet → This device → Dice animation) to compare roll animations on the phone, optionally side by side with the current 3D dice, and pick one for that phone (saved locally; "Auto" by default).

- **3D Throw** — a real 3D die is thrown onto the table, bounces, tumbles and comes to rest with the rolled number face-up (d4, d6, d8, d10, d12, d20; d100 falls back to Tumble). Uses your `.glb` models from `public/dice/` when present, otherwise generated numbered dice (opposite faces sum to sides + 1). Lands in ~1.5 s, ~2 s at 15 fps. Needs WebGL2, otherwise Tumble.
- **Tumble** — 2D canvas physics: dice bounce off the edges and settle upright.
- **Reel** — slot-machine number reels that lock in.
- **Burst** — the die shakes, then bursts into sparks revealing the number.
- **Fate card** — a rune card flips (CSS 3D) to the number.
- **Classic 3D** — the existing three.js dice. Needs WebGL2 (three.js r163+ dropped WebGL1) and the `.glb` models in `public/dice/`, which are git-ignored and must be copied in locally.

### Calibrating your own 3D dice

A `.glb` file has geometry but no record of which number is on which face, so 3D Throw needs a one-time calibration per die to land the right number up. In the Dice Lab, under **Calibrate your 3D dice models**, pick a die: the model turns to each detected face and you type the number you see (for a d4, the number at the top point). The result is saved on that phone, and the lab shows a small JSON to save as `public/dice/<model>.faces.json` (e.g. `d20_low_003.faces.json`) so every phone uses it. Until a model is calibrated, 3D Throw still throws it, but the face on top may not match the result.

Faces are found automatically: the model is centred and scaled, and its largest flat areas (one per side) become the faces, so bevelled edges are ignored.

Auto uses Classic 3D only on phones with WebGL2 that aren't low-end (≤2 GB memory, ≤4 cores or data saver), otherwise Tumble. The light styles use canvas 2D/CSS only, so they work on old Android and iOS browsers. three.js is loaded on demand, so the initial download is ~240 KB instead of ~825 KB. CSS builds target Chrome 61 / Safari 12.

MVP identity should be local:

- optional table PIN
- local session token
- claimed character id

Discord and Google login are deferred until remote play or account-based identity becomes necessary.

Near-term additions:

- QR-code LAN join flow from the GM dashboard.
- Character claim/assignment.
- Reconnect-safe session restore.
- Private player notes where appropriate.

Run with:

```text
npm --workspace apps/player-companion run dev
```
