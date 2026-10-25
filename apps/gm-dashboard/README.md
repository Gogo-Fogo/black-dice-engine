# GM Dashboard

GM-facing web app for running sessions.

Current first-slice responsibilities:

- Runtime status visibility.
- Player and party state overview.
- Live in-memory dice log fed by the local server.
- Join URL and table PIN display for the player companion.

## Layout

The dashboard is split into tabs (the last one used is remembered):

- **Stage** — a preview of the couch-facing table display: scene art on the left, large narration text on the right, the GM's current roll call, the party's HP strip and a banner for each roll. Text sizes use container units, so they scale with the stage (≈41px narration and ≈60px scene title on a 1080p TV).
- **Run** — set the scene, call for a roll (check, ability, DC), player join QR/PIN, AI Director, party state, approval queue, roll log, quick-add character.
- **Media** — scene art gallery, scene packets, media jobs, generated media metadata, cleanup policy.
- **Audio** — ambience volume, audio library, cue queue, YouTube music.
- **System** — save/export session, runtime status, presence, campaign context, memory drafts, model adapters, AI/error/event logs.

### Table display on a TV

Press **Open on TV** on the Stage tab (or open `/?view=stage`), drag the window to the TV and press **Start table display**. That goes fullscreen, hides the cursor when idle, and makes that window read narration aloud; the dashboard stops speaking while the TV window is open so the voice doesn't double up.

When the scene changes, the stage shows a "Painting the scene" state over the previous art until a new image appears from `/api/images` (or 2 minutes pass), then fades the new art in. Narration words highlight as the TTS voice reads them; without TTS the text still shows.

Near-term additions:

- Scene framing and narration controls.
- State event approval flow.
- Campaign memory search.
- Local scene generation controls.

Run with:

```text
npm --workspace apps/gm-dashboard run dev
```
