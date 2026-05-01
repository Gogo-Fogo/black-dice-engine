# Player Companion Strategy

Black Dice Engine should use a mobile web player companion as the primary player surface.

## Decision

Build the phone-friendly web app first.

Do not make Discord the primary player app for MVP.

The GM laptop/PC remains the main host machine. It runs the GM dashboard, local game server, state database, AI/model adapters, ComfyUI/media routing, audio control, and dice/state tools.

## Why Mobile Web First

The player companion needs to be good at:

- character sheets
- HP, AC, resources, inventory, conditions, and notes
- roll buttons
- private player information
- scene images and handouts
- real-time state updates
- simple LAN join flow

A mobile web app gives us more control over layout, privacy, permissions, and live UI than Discord messages, buttons, and modals.

## QR Join Flow

The GM dashboard should show a join panel with:

- local LAN URL
- QR code for player phones
- table/session name
- optional table PIN
- active players and connection status
- character claim/assignment status

Recommended first flow:

1. GM starts a local session.
2. Dashboard shows a QR code.
3. Player scans QR code.
4. Player enters table PIN if enabled.
5. Player chooses or claims a character.
6. Server assigns role and session token.
7. Phone opens the player companion sheet.

## Discord Later

Discord can be useful later as a bridge, but should orbit the engine rather than become the engine.

Possible later uses:

- shared session recap channel
- public roll feed
- remote play notifications
- `/roll`, `/action`, `/recap`, or `/sheet` commands
- handout/image posting

Discord OAuth may become useful for identity if remote play becomes important. Google login is lower priority for this project.

## MVP Boundary

For MVP, avoid:

- Discord bot
- Discord OAuth
- Google OAuth
- public internet hosting
- cloud account system

Use local session identity, table PIN, and character assignment first.
