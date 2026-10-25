# Character uploads and consistent campaign art

**October 25 update:** The active registry and Forge now use tested local FLUX.2 Klein distilled 4B with reference-latent conditioning instead of the absent SDXL checkpoint. Legacy IPAdapter details below describe the preserved older workflows. See [upgrade, real outputs and remaining limits](local-ai-upgrade-2026-10-25.md).

On `/player/?mode=ttrpg`, join, open **Sheet**, claim a character, describe its stable appearance and choose **Upload character image**. PNG, JPEG and WebP inputs up to 15 MB are converted on the phone into a PNG no larger than 768×768. Canvas conversion removes source metadata. The server separately checks PNG structure, checksums, dimensions and bounded decompression, and strips ancillary metadata. Stored images are limited to 512 KiB; each character can retain 20 distinct references.

Uploads belong to the claimed character. Only its owner and the GM see a pending submission. In `/host/?mode=ttrpg`, **Character portraits** lets the GM preview and approve or reject it. Approval makes the portrait visible on the dashboard and every player's **Table** view. A pending replacement does not replace the shared portrait. Display credentials cannot read character uploads. Image fetches carry session credentials; image elements use owned blob URLs, revoked when their view is disposed.

Uploads and reviews use request IDs and the durable table command boundary. Reference bytes, state and receipts commit in the same SQLite transaction. Retry an uncertain action with **Confirm pending reference** while keeping the page open; it reuses the exact request. Uncertain portrait requests currently survive tab switching within the companion, but are not recovered after a page reload. Images live in the local session database's metadata store, outside Git, and follow its backup lifecycle. Never commit real uploads or database files.

## Generation

After approval, the GM can enter a **Campaign scene** under that character and choose **Queue scene with approved reference**. Start the queued job in **Media Job Queue**. The existing visual-canon action also uses the approved reference and produces one portrait, rather than a claimed multiview pack.

Every job pins the reference hash, appearance description and deterministic seed. Later uploads or approvals cannot change an existing job. The server reads those saved reference bytes when preparing the router request; character notes, inventory and private campaign context are not automatically added. The GM supplies the scene description explicitly. This is one-character conditioning, not automatic party-wide identity composition.

The router uploads the reference to ComfyUI and uses the filename ComfyUI actually confirms. It stops if the upload fails or the selected workflow cannot consume a reference. Raw reference data is excluded from router responses. Template replacement operates on JSON values, preserving quotes/newlines without changing workflow structure. The portrait and landscape scene workflows use `IPAdapterAdvanced`, CLIP Vision and the existing SDXL Lightning checkpoint, with a fixed reference weight of 0.85. Required node inputs follow the [upstream implementation](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/main/IPAdapterPlus.py). These models and custom nodes must already be configured locally; this change installs nothing.

Set the router's `BDE_COMFY_API_BASE` and `BDE_COMFY_OUTPUT_ROOT`, and the game server's `BDE_COMFY_ROUTER_ENDPOINT` and `BDE_COMFY_OUTPUT_DIR`. The latter must point to the `bde` directory inside ComfyUI's output root, visible to the game server. The known SaveImage node must report exactly one PNG in `bde`; missing or unexpected output evidence fails the character job instead of inventing a file path. Approval separately verifies the actual file under configured asset roots.

Generated images stay GM-only until reviewed. **Generated Media Metadata** shows a private preview; **Approve and share with players** publishes it to the phone's **Table → Shared campaign art** gallery. Sharing a scene never replaces the approved identity reference. The existing durable admission prevents automatic duplicate GPU submissions after ambiguous responses; reconcile an attempted job in ComfyUI before queueing another.

Reference conditioning and a stable seed improve continuity but do not guarantee identical faces, pose or clothing. Tests exercise synthetic images and mocked provider confirmations; actual GPU output and visual likeness have not been evaluated. Party profile keeps generation disabled. The live Party process was not restarted or switched to full mode by this work.

## Companion branch integration and checks

Fetched `origin/feature/player-companion-ux-overhaul` at `a94ed19`. Adapted its Play, Sheet, Table and Lore navigation into the current authenticated client, retaining ownership checks, reconnects and durable roll requests. The older branch's complete app was not merged over the ongoing refactor. Shared browser code now has an explicit ESM scope in `apps/package.json` so both Vite and Node component tests resolve the same exports.

Also fetched the later dashboard redesign, `origin/feature/gm-dashboard-tv-scene` at `f082875`. Its tabbed dashboard and TV stage have not been merged: they still depend on the older global fetch/role-header approach and require an authenticated port. The portrait review panel added here lives in the current dashboard. Spectator/TV access to character reference images remains denied.

Subsequently fetched `origin/main` at `40d5b64`, containing the merged phone PR (`629722f`) and dashboard/TV PR (`40d5b64`). These remote updates are available locally; the working checkout retains the ongoing refactor and adapted phone flow. A wholesale merge or reset over that work has not been performed.

Regression coverage includes malformed uploads, metadata stripping, ownership and audience denial, failed-storage rollback, exact receipt replay, reference replacement, restart persistence, pinned router payloads, upload confirmation, prompt escaping, output-path validation, and authenticated generated-image sharing. Browser verification uses `node tests/helpers/demo-server.mjs --ttrpg`, an owned loopback fixture with optional provider calls blocked.

## Character Forge integration

Forge-selected portraits use this same normalized PNG upload, GM approval and pinned reference pipeline. Approved portraits are visible to the spectator TV as well as other players; pending references remain owner/GM only. See [incoming feature integration](incoming-pr-integration.md).
