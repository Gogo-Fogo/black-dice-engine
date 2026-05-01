# MVP Scope

The first playable milestone should prove the table loop, not every dream feature.

## MVP Goal

Create a local multiplayer web app where a Windows PC acts as the GM server and three players can use phones as character sheets/controllers.

## In Scope

- GM dashboard running locally.
- Player companion views over LAN.
- QR-code join flow from GM dashboard to player phones.
- Local session identity, optional table PIN, and character claim/assignment.
- SQLite-backed campaign state.
- WebSocket live updates.
- Dice roller and roll log.
- Character HP, AC, resources, inventory, conditions, and notes.
- State events with audit trail.
- Basic scene/narration flow.
- Campaign bible and sample campaign content.
- Content rating settings.
- Async image job records and ComfyUI routing placeholders.
- Session summary export.

## Out Of Scope For MVP

- Unity or 3D game client.
- Native iOS/Android apps.
- Supabase as core runtime.
- Vercel as core runtime.
- Custom model training.
- Full video generation.
- Public internet hosting.
- Discord bot as primary player surface.
- Discord or Google login.
- Paid/copyrighted module ingestion for demo content.
- Real campaign databases in the repo.
- Private/generated/adult assets in the repo.

## Build Order

1. Data model and state-event validation.
2. Game server with WebSocket updates.
3. Player companion sheet.
4. GM dashboard shell.
5. Dice and resource updates.
6. Scene packets and memory entries.
7. Async media job queue placeholder.
8. ComfyUI router integration.
9. Optional local LLM/ChatGPT director integrations.

## Success Criteria

- A player can open a phone sheet on the same network.
- A player can join by scanning a QR code from the GM dashboard.
- The GM can start a scene.
- A player can roll or submit an action.
- The system can apply a deterministic state event.
- The dashboard and phones update in real time.
- A scene packet can request an image asynchronously.
- A session summary can be exported.
