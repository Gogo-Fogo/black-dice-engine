# Build Start Checklist

Use this checklist before the first implementation pass. The goal is to start with a small playable loop, not every planned integration.

## Already Settled

- Project name: Black Dice Engine.
- Repository: `https://github.com/Gogo-Fogo/black-dice-engine`.
- Visibility: private.
- Default branch: `main`.
- Local repo path: `G:\Workspace\MyTools\Black Dice Engine`.
- Heavy/private data stays outside Git.
- Codex should edit inside this repo unless the user approves another path.
- The game server is the single coordination boundary for dashboard, player phones, AI, state, dice, media, audio, and imports.
- The player companion is a mobile web app first; Discord is deferred as an optional bridge.
- Players should be able to join by scanning a QR code from the GM dashboard.
- Dice truth stays local even when dddice or another 3D roller is used for presentation.
- Images, video, audio, local models, real campaigns, private PDFs, and secrets stay outside the repo.

## Human Decisions Before Coding

- Choose the first web app stack: recommended `Vite + React + TypeScript`.
- Choose the first service stack: recommended `Node.js + TypeScript`.
- Choose the first package manager: recommended `npm` unless there is a reason to use `pnpm`.
- Decide whether the first server should be one app with modules or separate service packages. Recommended: one local server first, split later.
- Decide whether to create GitHub issues/milestones manually or have Codex generate them from `TODO.md`.
- Set the GitHub social preview image manually using `docs/assets/branding/black-dice-engine-banner.png`.

## First Build Slice

The first implementation should prove the local table loop:

1. Minimal local game server.
2. Health endpoint.
3. WebSocket connection.
4. Runtime status object.
5. Simple dice roll endpoint.
6. In-memory roll log.
7. Tiny GM dashboard shell.
8. Tiny player companion shell.
9. Phone-friendly LAN test.

Do not start with ComfyUI, GPT/director mode, PDF imports, video generation, audio generation, or custom dice themes.

## Context Status

The private planning/context material has already been distilled into public repo docs. Future agents should read:

- `README.md`
- `AGENTS.md`
- `TODO.md`
- `docs/decisions/`
- `docs/context-map.md`
- `docs/context-file-workflow.md`

Raw private context files should remain in `_local-context/` and should not be committed.

## Ready-To-Code Definition

The project is ready for implementation when:

- GitHub repo is synced.
- Branch is `main`.
- Working tree is clean.
- Stack choice is confirmed.
- First build slice is accepted.
- No private context, secrets, model files, generated media, or real campaign data are staged.
