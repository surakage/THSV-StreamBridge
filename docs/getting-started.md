# Getting started

This is the recommended path for a first installation of THSV StreamBridge on Windows. Complete the steps in order: install core first, connect Streamer.bot second, configure platforms third, and install optional add-ons last.

## Before you begin

You need:

- Windows 10 or later on a 64-bit computer
- Streamer.bot `1.0.7` stable or later. It includes the Custom Channel Rewards crash fix and the corrected website-authentication/update-check handling. Back up the complete Streamer.bot folder before upgrading and complete the [stable 1.0.7 checks](streamerbot-1.0.7-stable.md) before relying on it live
- Twitch, YouTube, and/or Kick connected inside Streamer.bot
- TikFinity connected to Streamer.bot if you want TikTok support
- Meld Studio, OBS Studio, Streamlabs Desktop, or another Chromium-compatible browser-source host if you want overlays

You do **not** need to install Node.js, npm, Docker, a database, or platform API keys for the core installation.

## 1. Download and verify core

1. Open [Download THSV StreamBridge](https://www.slothbloom.com/downloads/streambridge). This stable SlothBloom address redirects to the exact current archive on the official GitHub release.
2. Download `THSV-StreamBridge-4.0.0.zip` and `THSV-StreamBridge-4.0.0.zip.sha256` from the Version 4 release.
3. Follow [Release verification](../RELEASE-VERIFICATION.md) to verify the SHA-256 digest and GitHub artifact attestation.
4. On Windows 11, right-click the verified ZIP, choose **Properties**, select **Unblock** if it is shown, and select **OK**.
5. Extract the ZIP to a temporary folder. Do not run the installer from inside the ZIP preview.

Only download releases from `github.com/surakage/THSV-StreamBridge`. The project does not use a paid Windows executable certificate; checksums and GitHub artifact attestations are the free publisher-verification path.

## 2. Install StreamBridge

Double-click:

```text
Install THSV StreamBridge.cmd
```

The installer window stays open and reports success or failure. It installs to:

```text
%LOCALAPPDATA%\THSV StreamBridge
```

It then creates a private local control token, saves a protected `THSV StreamBridge Recovery Key.txt` in the installed folder, starts the service, waits for the health check, and opens the authenticated setup wizard. Afterward, run **THSV StreamBridge - Open Setup Wizard** in Streamer.bot or use **Open THSV Setup Wizard** from the installation folder. Both create a short-lived, single-use local unlock link, so normal users never need to browse into `data/secrets` or copy the permanent token. Opening the wizard does not restart a healthy Bridge; if it is offline, the installed launcher starts it first. Manual token entry remains available as an advanced recovery fallback, and the authenticated wizard can download another recovery-key copy.

If Windows blocks the `.cmd` file, open PowerShell in the extracted folder and run the same installer directly through its bundled signed runtime:

```powershell
.\runtime\node.exe .\installer\install.mjs
```

No administrator permission is normally required. See [Troubleshooting](troubleshooting.md#smart-app-control-blocks-the-installer) if the installation does not finish.

### Connect the safe Streamer.bot launcher

Open **Streamer.bot connection** in the setup wizard. Choose **Detect automatically** while Streamer.bot is running, or choose **Choose Streamer.bot.exe** and select the portable executable. StreamBridge saves only that local executable path and the WebSocket port already configured in the bridge. The setting lives under creator-owned `data/configuration`, so upgrades preserve it.

Choose **Create one-button desktop shortcut** to add **Start THSV Streaming Tools** to the Windows desktop. It runs the same complete workflow as the Stream Deck target: enabled optional apps first, a short stabilization check for newly launched apps, then Streamer.bot and StreamBridge. Repeated launches are safe, and optional-app warnings never block core readiness. The guarded Streamer.bot step serializes repeated clicks, verifies the exact process that owns the configured WebSocket port, waits for a recently closed listener to release, and repairs an incomplete session through its normal window-close request. It never force-terminates an unrelated process.

The installer keeps its launchers in the exact installed folder and does not add automatic Desktop shortcuts. In **Streamer.bot connection → Optional one-button apps**, you may select OBS Studio and Speaker.bot and enable either one for startup. They are disabled by default, never bundled, and never block Streamer.bot or StreamBridge if they are unavailable. For Stream Deck, add **System → Open** and select the **Stream Deck one-button target** shown in the wizard: `Start THSV Streaming Tools.cmd`. Repeated presses do not restart healthy services. Its console closes automatically after a successful launch and stays open only when a core tool needs attention. Use **Open installed folder** in the wizard whenever you need the recovery key or another launcher.

The installer starts **THSV StreamBridge Tray** after the Bridge passes its health check. Double-click its Village icon to open the Setup Wizard, or right-click it for status, safe streaming-tool startup, Bridge start/stop, and the installed folder. The shell checks the local readiness endpoint every 30 seconds and shows a notification only when the status changes. Closing the shell does not stop StreamBridge; reopen it with `Open THSV StreamBridge Tray.cmd` from the installed folder.

The wizard reports a fully healthy launch in green, a healthy core launch with an optional OBS/Speaker.bot problem in amber, and a core startup failure in red. Amber never means StreamBridge delivery is blocked.

## 3. Prepare Streamer.bot

1. Open Streamer.bot.
2. Open **Servers/Clients > WebSocket Server**.
3. Set the address to `127.0.0.1`, port to `8080`, and endpoint to `/`.
4. Enable **Auto Start**, then start the WebSocket server.
5. Import the core `.sb` packages and wire the receiver chain exactly as described in [Streamer.bot setup](streamerbot-setup.md).
6. Accept the custom C# warning only for packages from the verified official archive.
7. Confirm each imported C# action compiles using [Streamer.bot C# references](streamerbot-csharp-references.md).

The important wiring rule is:

```text
Platform intake trigger
  -> THSV StreamBridge - Receive Event
      -> THSV StreamBridge - Multi-Chat
      -> THSV StreamBridge - Multi-Commands
      -> THSV StreamBridge - Multi-Alerts
      -> THSV StreamBridge - Multi-Timed Actions
```

Only intake actions receive platform triggers. The receiver and `Multi-*` actions remain triggerless.

## 4. Open the wizard and configure platforms

Use the installed launcher:

```text
%LOCALAPPDATA%\THSV StreamBridge\launcher\Open THSV Setup Wizard.cmd
```

The launcher starts StreamBridge if needed and opens the authenticated wizard. Configure one platform at a time:

1. Enable only platforms already connected in Streamer.bot or TikFinity.
2. Inspect Streamer.bot from the wizard and confirm the expected actions are present.
3. Configure Chat, Alerts, Commands, Timed Actions, Rewards, and any advanced blockers you need.
4. Commit the configuration draft with backup.
5. Restart StreamBridge when the wizard says a restart is required.

The direct wizard URL is `http://127.0.0.1:8787/wizard/`, but the launcher is recommended because it confirms the service is healthy before opening the local authentication page.

## 5. Add browser overlays

Add these local URLs as Browser Sources:

| Purpose | URL |
| --- | --- |
| Combined Chat and Alerts | `http://127.0.0.1:8787/overlay/` |
| Chat only | `http://127.0.0.1:8787/overlay/chat` |
| Alerts only | `http://127.0.0.1:8787/overlay/alerts` |
| Interactive multichat dock | `http://127.0.0.1:8787/overlay/chat/dock` |

Use a 1920 x 1080 browser source first, then crop it in your broadcast application. Customize appearance and use the preview controls from the wizard before going live.

### Choose the broadcast app you actually use

- **OBS Studio:** add the URL as a Browser Source and relay OBS scene/streaming events from Streamer.bot.
- **Meld Studio:** add the URL as a Browser layer and relay Meld Scene Changed, Streaming Started, and Streaming Stopped events.
- **Streamlabs Desktop:** add the URL as a Browser Source and relay Streamlabs Desktop scene/streaming events.

Chat, commands, rewards, timed actions, Discord delivery, analytics, and persistent state do not depend on OBS. Features that react to scenes consume the same normalized StreamBridge scene event from the selected application. Raid Scout separately lets you choose which provider owns its ending scene and Stop Streaming action. The bundled Aitum multi-output stop helper remains intentionally OBS-only; Meld and Streamlabs use their provider-native Streamer.bot Stop Streaming actions.

Meld Studio may require a one-time Windows loopback exemption. Follow [Meld Studio troubleshooting](troubleshooting.md#meld-studio-cannot-reach-the-overlay-or-wizard) if a local URL does not load.

## 6. Test before going live

Confirm the service:

```text
http://127.0.0.1:8787/health
```

Then:

1. Use wizard previews for Chat and Alerts.
2. Run the offline fixtures described in [Testing](testing.md).
3. Trigger one harmless live chat message per enabled platform.
4. Confirm the platform intake action, receiver, and expected child action appear once in Streamer.bot Action History.
5. Confirm the event appears once in the overlay.
6. Leave simulated-event suppression enabled for any action that can post chat, mutate a reward, or perform another live operation.

Do not enable financial, reward, or destructive automation for an event whose provider identity is still marked unverified. See [Production readiness](production-readiness.md).

## 7. Install an optional add-on

Core must be installed and working before any add-on.

1. From the same GitHub release, download the add-on's separate `THSV-StreamBridge-AddOn-<Name>-<version>.zip`.
2. Verify the add-on ZIP and checksum.
3. Extract it.
4. In the wizard, open **Add-ons** and install the included `.thsv-addon`.
5. Review its requested permissions, settings, and approved Streamer.bot action IDs, then enable and save it.
6. Return to **Streamer.bot → One Streamer.bot import**, select the enabled add-on with the built-in features you use, and create one combined 4.0 `.sb` file.
7. Import that file with overwrite enabled for matching THSV actions, follow the generated trigger checklist, restart StreamBridge if requested, and run the add-on's preview or test.

The individual `.sb` inside the add-on ZIP is a recovery option. The normal Version 4 path is the wizard-generated combined import, which includes only the extensions and optional add-ons you select.

## Daily use

Use the installed launchers:

- `Start THSV StreamBridge.cmd` starts the active version and opens the wizard.
- `Start THSV Streamer.bot Safely.cmd` starts only the selected portable Streamer.bot installation after checking its configured WebSocket port; use it for repair rather than ordinary full startup.
- `Start THSV Streaming Tools.cmd` starts or verifies both Streamer.bot and StreamBridge; use it as the Stream Deck one-button target.
- `Open THSV Setup Wizard.cmd` ensures the service is running and opens setup.
- `Stop THSV StreamBridge.cmd` safely stops the managed instance.
- `Uninstall THSV StreamBridge.cmd` removes the application while preserving creator data by default.

Starting again safely replaces the previously tracked StreamBridge instance. It does not terminate an unidentified process that happens to use the same port.

## Update

1. Download and verify the newer core ZIP.
2. Extract it to a new temporary folder.
3. Run its `Install THSV StreamBridge.cmd`.
4. Let the installer stage and verify the new version, stop the old version, activate the new version, and run its health check.
5. Reopen the wizard and review compatibility or add-on update notices.

StreamBridge checks core and official component updates when its authenticated Streamer.bot connection becomes ready, again after a reconnect, and then at most once every six hours while connected. SlothBloom is the friendly discovery feed and GitHub is the automatic fallback. The wizard shows the retained result when it unlocks, and **Check for updates** requests a fresh result. For a feature or add-on, select **Update safely** to verify the official release provenance, outer index hash, inner checksum, publisher, version, compatibility, and manifest before installing only that package. Settings and private state stay in place; update all desired packages and restart StreamBridge once. Select **Download for review** when you prefer the separate **Discovered packages** approval path.

If more than one compatible official add-on update is available, **Update all compatible** runs the same authenticated verification separately for each package and reports any failure without undoing successful updates. A matching Streamer.bot `.sb` from the release is checksum-verified and saved under `data/addons/inbox/streamerbot/<module>/<version>/`; re-import it when the wizard reports that the add-on's actions changed. Imports are deliberately never pushed into Streamer.bot silently.

For a Bridge release, select **Download & prepare**. After verification completes and every platform is offline, select **Install verified update**. The managed Windows installation stops StreamBridge, installs through the same health-checked portable installer, rolls back if the new version does not become healthy, restarts the Bridge, and reopens the wizard. The server rejects this operation while any platform is live. A source checkout is never overwritten by the wizard; use the downloaded release installer for that environment.

Advanced creators may expand **Optional third-party publishers** and bind one declared publisher ID to one GitHub `owner/repository`. Third-party repositories must publish the same bounded add-on index/bundle format from a tagged `.github/workflows/release.yml` run with GitHub artifact attestation. StreamBridge locks verification to that exact repository, workflow, tag, checksum, package publisher, and installed publisher before staging. Adding trust never downloads, installs, enables, or updates an add-on; every check, download, inbox installation, and restart remains a separate creator action. Remove the trust record at any time without deleting installed add-ons or their private state.

Configuration, secrets, uploads, logs, backups, and add-on state are preserved. The installer keeps the previous application version for rollback and retries transient Windows file-lock errors during activation.

## Uninstall or reinstall

Run:

```text
%LOCALAPPDATA%\THSV StreamBridge\launcher\Uninstall THSV StreamBridge.cmd
```

The default uninstall removes the application, bundled runtime, and launchers but preserves `data\` and `addons\` for a later reinstall. Permanent deletion requires a separate double-confirmed command; it is never the default.

For the complete package layout, custom install switches, rollback behavior, and privacy details, see [Portable Windows release](release.md).
