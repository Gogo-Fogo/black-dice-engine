# Lightweight Party launch and host checklist

Party Mode runs one built Node game server, which serves the host, TV and phone apps. It requires installed project dependencies, compatible Node/native SQLite, and no internet/provider/model services. No package installation is part of launch. Actual rendered and physical rehearsal is still pending; this is not a live-event readiness claim.

## Build and start

From any Windows working directory, invoke this repository's `start-party.bat` by its full path. From the repository root:

```powershell
.\start-party.bat
# Deliberately allow phones on the LAN:
.\start-party.bat --lan
```

Equivalent: `npm run party` or `npm run party -- --lan`. The batch file resolves the Node script from its own location; all build/resource/default data paths resolve from the repository. Paths with spaces are supported. It does not load `.env` or use another launcher's private configuration.

Every default launch visibly builds shared contracts and Node-only runtime configuration first, followed by the two Vite apps and game server, using installed TypeScript/Vite. It checks their manifest build commands before running them, so a future command change fails with an instruction to update the launcher. It never starts the Comfy router, audio service, TTS Python/model, LLM or development servers. The original `start-session.bat` remains available as an older full-stack launcher; it retains machine-specific paths and should not be used for Party verification.

```powershell
npm run build:party
.\start-party.bat --no-build
.\start-party.bat --check --port 4310
.\start-party.bat --lan --port 4325 --data-dir "_data/party-second-demo"
```

`--no-build` deliberately uses the last built code. `--check` validates built entry/assets and port availability without opening a database or starting a server. Use port `0` only for synthetic local tests (the server prints its assigned address). Relative `--data-dir` paths resolve from the repository, not the caller's current directory. Do not point it at an existing campaign directory. Verification used unique ignored `tmp/*` directories; the default Party data folder was not opened during implementation.

The default Party database is **`_data/party/session.db`**, distinct from the legacy `_data/black-dice-engine.db`. Its local host key is `session.db.host.key`; exports stay inside the Party data directory. The entire default directory is ignored by Git. Custom data directories must also remain private/ignored. The launcher prints the key's location, never its content. Open that file locally to enter the host gate. No data is copied, migrated or deleted.

Only one server should own a given data directory. A port conflict fails before importing the server/opening its database; choose another port and a **different** data directory for another room. The temporary port probe cannot reserve a port throughout startup, so a competing process can still claim it afterward; the final listen failure is visible. Build/start failures return a nonzero exit code. Nothing kills a process by name, port or saved PID. The built server runs in the launcher's own Node process; Ctrl+C stops that server. Closing the console can force termination on Windows, so save/finish deliberate host actions first; accepted Party commands already commit durably.

## Profile enforcement

The launcher always sets `BDE_RUNTIME_PROFILE=party`, explicit bind/port/data/export paths and normal host recovery policy. Existing inherited endpoint URLs, cloud provider selection/API keys, raw output directories or saved narration settings cannot enable optional work in this profile:

- Configuration blanks AI/media/audio endpoints and raw asset roots.
- Authenticated direct optional routes return `503` with `CAPABILITY_DISABLED`, including queue submissions, polling reads, narration toggle, TTS and audio playback.
- AI adapter calls return a disabled result before fetching a provider; media polling is not scheduled.
- Party rules use prepared text and recorded server dice; no optional service is needed to reach the ending.

`/health` reports the actual port, profile and whether optional services are disabled. It contains no credential. Direct server/development startup defaults to the compatibility `full` profile; this does not establish health or permission for remote services. The optional full-stack adapters still have separate hardening tasks in PLAN. Choose the Party launcher for the bounded profile.

## LAN and Windows firewall

### Remote party: home PC → Cloudflare → SteamOS/TV and phones

With explicit approval for Cloudflare and its executable, run `cloudflared tunnel --url http://127.0.0.1:4310` in a separate home-PC terminal. Copy the temporary HTTPS origin it prints, then start `start-party.bat --no-build --public-url https://YOUR-ADDRESS.trycloudflare.com`. The server remains bound to loopback; no router forwarding or LAN firewall rule is needed. The launcher does not download or start Cloudflare automatically. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

`--public-url` accepts only an HTTPS origin without credentials, path, query or fragment; `BDE_PUBLIC_ORIGIN` is its direct-server equivalent. Join QR codes use this explicit origin even when the server binds to loopback. Forwarded/Host headers cannot choose the advertised origin. The setting only advertises an address; it does not establish or verify a tunnel. Browser HTTP/WebSocket connections use the browser's origin, so HTTPS screens connect with WSS.

Anyone with the temporary URL can reach the app's public entry points. Host and display access still require separate keys; never share the host key or put it in a URL. Keep the home PC awake and both terminal processes running. Quick Tunnels have no uptime guarantee and get a new address after restart; update `--public-url` and reopen the screens if it changes. Stop the tunnel when finished. Test one phone on cellular before relying on the party network.

On the SteamOS Legion Go, select 1920×1080 HDMI output and extended desktop. Open `/host/` privately on the handheld and `/display/` fullscreen on the TV, both under the tunnel's HTTPS origin. No Node installation is needed on SteamOS or the phones. Confirm actual TV text size and HDMI output on site; local automated tests cannot establish these.

Default bind is `127.0.0.1` and the displayed join address is local-only. `--lan` explicitly binds `0.0.0.0`; use it only on the intended private LAN. Host/TV/phones share one game-server port (default TCP 4310); ports 5173, 4311 and provider ports are unnecessary for this profile. No firewall setting is changed by the launcher.

If Windows blocks the intended private LAN connection, create a narrowly scoped inbound rule in **Windows Defender Firewall with Advanced Security**: allow the installed `node.exe` program, TCP on the selected game-server local port, remote addresses limited to the local subnet, and **Private** profile only. Name it for this Party session so it can be disabled afterward. Do not allow all programs/ports, select Public networks, disable the firewall globally, or add router port forwarding. If the network is untrusted or managed, retain loopback and arrange an approved local network instead.

The LAN address is a best-effort choice among host interfaces. VPNs/multiple adapters can select an address phones cannot reach. Check the actual active private Wi-Fi/Ethernet IPv4 address and use `http://ADDRESS:PORT/player/?mode=party` manually if needed. Guest Wi-Fi/client isolation can block phone-to-host traffic even when internet works. The room code cannot fix network isolation. Plain LAN HTTP is not internet-safe transport; the remote setup above uses the separately approved HTTPS tunnel.

## Host checklist before live use

- [ ] Plug in host power; check dock/HDMI connection and avoid sleep during play. Charge phones or provide chargers.
- [ ] Use an extended display. Keep `/host/` private; move only `/display/` to the TV and enter its separate read-only key. Verify physically that host controls are not mirrored.
- [ ] Check actual TV resolution/scaling, seven-player text size, contrast, full screen and visible results from the farthest seat. Prepared text permits silence; any optional TV sound should be tested separately.
- [ ] Start the intended built Party profile with the correct data directory. Confirm `/health` says `party` and optional services disabled.
- [ ] Put host and phones on the same reachable private network. Check guest/client isolation, VPN/adapters and the displayed LAN address.
- [ ] Scan the public QR on at least two physical phones; also try the printed/manual URL and room code. Verify seven distinct ready seats, including a normal player seat for a participating host.
- [ ] Rehearse the full five-round flow to ending on the intended host/TV, targeting 20–30 minutes. Test sleeping/rejoining phones, repeated taps, pause/resume, Wi-Fi loss and a deliberate server restart on disposable data.
- [ ] Verify private choices stay private until reveal. Check source/built test results plus actual rendered/network behavior. Protocol simulation does not replace this step.
- [ ] Keep a rehearsed build and disposable demo backup, with concrete restore/new-room steps. Rehearse those steps before freezing changes; backup/restore tooling and the live freeze gate remain open.
- [ ] If complete-loop/privacy/recovery checks fail, use the planned fallback activity. Do not rely on an unrehearsed last-minute change.

On restart an unfinished Party game pauses in its saved phase; reopen the host with the same local key and deliberately resume. Phones reuse their tab's saved membership. If a command response was uncertain, confirm the pending action to retrieve its durable receipt. A new room rotates authority and disconnects everyone while preserving prior results. If its response was lost, reopen host access with the current local key instead of creating repeated rooms. See [UI/recovery details](party-ui.md).

## Verification scope

Automated checks cover actual build, built assets, startup from a different directory with spaces, loopback default despite inherited LAN settings, occupied-port refusal without touching the owner or creating another database, persisted seat/credential recovery and an injected compiler failure. Seven-client source/built integration completes Party Mode with configured provider canaries and outgoing fetch blocked. A direct adapter test establishes no provider fetch. The Windows batch wrapper is also checked from outside the repository. No test opened the default data folder or a real campaign.

Rendered controls, physical screen placement/scaling, QR scanning, phone sleep, LAN/firewall behavior and pacing still require the checklist above. RUN-06–09 are not completed by launcher/protocol tests.
