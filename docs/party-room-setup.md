# Party room setup (host PC + TV handheld)

The host PC runs everything: game server, AI (hosted DeepSeek through the ignored `.env`), and local ComfyUI portraits. The TV device only shows the public Stage in a browser. Phones and the TV device join over the same home Wi-Fi as the host PC.

## Host PC

1. **Network profile must be Private.** Windows allows Node through the firewall on Private networks only. Go to Settings → Network & internet → Wi-Fi → (your network) → Network profile type → **Private**. On a Public network, phones and the TV cannot connect.
2. Start ComfyUI and Ollama if they are not running (`scripts/start-local-ai.ps1`). Portraits need ComfyUI; nothing else does.
3. From the repository, start the full session on the LAN with the private environment file:

   ```powershell
   node --env-file=.env scripts/session-launch.mjs --lan
   ```

   The launcher never reads `.env` by itself; without `--env-file` the AI is off. `--lan` is required for phones. It uses the configured database (`_data/black-dice-engine.db` by default). Add `--data-dir <folder>` for a throwaway session.
4. Open `http://localhost:4310/host/?mode=ttrpg` and enter the key from `_data/black-dice-engine.db.host.key`. Keep it off screens players can see.
5. The dashboard shows the player join link (this PC's LAN address) and table PIN. Players open the link on their phones, choose a name, then **Sheet → Create a new character** or claim an existing one.

## TV device (for example a SteamOS handheld over HDMI)

1. Connect it to the same Wi-Fi as the host PC and to the TV (USB-C to HDMI).
2. In a desktop browser on the device, open the **TV address** shown on the host's **Stage → TV on another device** panel (`http://<host-LAN-address>:4310/host/?mode=ttrpg&view=stage`).
3. On the host, press **Create TV code**. Type the six-character code on the TV device. The code works once and expires after ten minutes or five wrong tries. The full display key is still available under the panel as a fallback.
4. Press **Fullscreen** on the Stage. The TV shows only public, approved content: party HP, approved portraits and art, the latest roll and approved campaign updates.

## Running the table

- **Run → Call for a roll** sets a check, ability and DC; calling again replaces it. Phones show the modifier (ability + proficiency, doubled for Expertise) and, after rolling, *Success* or *Miss* against the DC.
- AI tools are optional: **AI Propose Action**, **AI Director Guidance**, and AI narration of completed rolls. If the AI misbehaves, turn off **AI Narration on rolls**; template narration and manual roll calls keep working.
- Approve or reject player portraits in **Run → Character portraits**. Unapproved portraits never reach other phones or the TV.
- Character build picks (spells, attacks, subclass) are quick-start defaults; review them in each party card's build summary.
- Phones default to the light **Tumble** dice animation. 3D styles download large model files over the Wi-Fi.

## If something fails

- **Phones cannot load the join link:** check the network profile is Private, that phones are on the same Wi-Fi (not a guest network with client isolation), and that the server was started with `--lan`.
- **No AI replies:** confirm `--env-file=.env` was used. The game works without AI.
- **No portraits:** ComfyUI is not running. Players can upload an image on their sheet instead.
- **TV code rejected:** codes are single use and short-lived; create a new one.
- Server restarts keep characters, claims, approved portraits and progress. Phones reconnect by reloading.
