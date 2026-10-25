# Party plan — finish and play

Use this checklist now. [PLAN.md](PLAN.md) is the deferred overhaul backlog. Freeze feature work; fix only a problem that prevents joining, private choices, round completion or recovery.

- [x] Finish the current reliability batch: automatic validated backups, bounded/redacted diagnostics, measured resource pressure and audience-filtered AI inputs. **162/162 source and built-service tests pass**; workspace checks pass. Automated seven-player/five-round coverage passes. Physical devices are still unverified.
- [x] Prepare remote join URLs and TV layout: explicit HTTPS origin for QR codes; browser-verified 1920×1080 display with seven saved results and join panel visible without scrolling. **163/163 source regression tests pass.** Cloudflare itself and physical HDMI/phones remain unverified.
- [x] **Connect the home PC through the approved Cloudflare tunnel.** Official `cloudflared` downloaded to ignored `tmp/tools/`, published SHA256 verified. Party server and tunnel are running. Public HTTPS pages/assets, authentication, join origin and WSS snapshot passed. Current links and restart details: [local access sheet](tmp/party-access.md). Keep the PC awake and online. For a later restart, leave this command running in its own terminal:

  ```powershell
  .\tmp\tools\cloudflared.exe tunnel --url http://127.0.0.1:4310
  ```

  Copy its temporary `https://...trycloudflare.com` address, then run `.\start-party.bat --no-build --public-url https://YOUR-ADDRESS.trycloudflare.com` in another terminal. No `--lan` or router port forwarding is needed. This serves host/TV/phones together with AI/media/audio disabled. A real phone on cellular and the party network are still unverified. Do not launch a second copy while the current one runs.
- [ ] **Set up the Legion Go and 1080p TV.** On SteamOS, connect HDMI, select **1920×1080** output, open `https://YOUR-ADDRESS.trycloudflare.com/host/`, and enter the key from the home PC's `_data/party/session.db.host.key` privately. Create a separate display key for `https://YOUR-ADDRESS.trycloudflare.com/display/`. Put only the display in fullscreen on the TV; keep host controls on the handheld (extended desktop). Check text from across the room. `localhost` on the Legion Go does not reach the home PC.
- [ ] **Join and check one round.** Scan the displayed QR on two real phones, then fill six or seven ready seats. Open choices → submit → lock → reveal → resolve → summary. Confirm choices remain private until reveal. Briefly sleep/reopen one phone and confirm the same seat returns. A short check does not establish the full 20–30-minute rehearsal.
- [ ] **Confirm recovery.** Know Pause/Resume and **Confirm pending action**. Reopen the same tab after a connection drop. If the server restarts, relaunch with the same command/data, use the saved host key and deliberately resume the paused game. Backups are under `_data/party/backups/`; avoid replacing the live database. New Room rotates credentials and disconnects everyone—use it only deliberately.
- [ ] **Run the party.** Keep the home PC, server and tunnel running; the Legion Go and phones need internet. Use prepared text/silence. If joining, privacy or completing the round fails and cannot be fixed immediately, switch to the fallback activity. Stop server and tunnel with Ctrl+C when finished; server shutdown attempts a final validated backup. Restarting a Quick Tunnel changes its address: relaunch the server with the new `--public-url` and reopen all screens.

Deferred: remaining module extraction, shared-mode architecture, scenario packs, optional AI/media/audio enhancements, CI and broad documentation cleanup. No extra work is required from the full backlog before this device check.

Details only if needed: [launch/network](docs/party-launch.md), [screens/reconnect](docs/party-ui.md), [backup limits](docs/backups.md).
