# Player Companion

Phone/tablet companion app for players.

Current first-slice responsibilities:

- Character sheet view.
- Player roll submission.
- Status and resource tracking.
- Player-visible scene updates.
- Visible connection status.

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
