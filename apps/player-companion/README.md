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
