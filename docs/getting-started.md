# Getting started

This is the recommended path for a first installation of THSV StreamBridge on Windows. Complete the steps in order: install core first, connect Streamer.bot second, configure platforms third, and install optional add-ons last.

## Before you begin

You need:

- Windows 10 or later on a 64-bit computer
- Streamer.bot `1.0.5-alpha.31` or later; `1.0.5-alpha.33` is recommended for new installations
- Twitch, YouTube, and/or Kick connected inside Streamer.bot
- TikFinity connected to Streamer.bot if you want TikTok support
- Meld Studio, OBS Studio, Streamlabs Desktop, or another Chromium-compatible browser-source host if you want overlays

You do **not** need to install Node.js, npm, Docker, a database, or platform API keys for the core installation.

## 1. Download and verify core

1. Open the [official GitHub Releases page](https://github.com/surakage/THSV-StreamBridge/releases/latest).
2. Download `THSV-StreamBridge-2.3.1.zip` and `THSV-StreamBridge-2.3.1.zip.sha256`.
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

It then creates a private local control token, starts the service, waits for the health check, and opens the authenticated setup wizard.

If Windows blocks the `.cmd` file, open PowerShell in the extracted folder and run the same installer directly through its bundled signed runtime:

```powershell
.\runtime\node.exe .\installer\install.mjs
```

No administrator permission is normally required. See [Troubleshooting](troubleshooting.md#smart-app-control-blocks-the-installer) if the installation does not finish.

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
| Chat operator dock | `http://127.0.0.1:8787/overlay/chat/dock` |

Use a 1920 x 1080 browser source first, then crop it in your broadcast application. Customize appearance and use the preview controls from the wizard before going live.

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
5. Review its requested permissions, settings, and approved Streamer.bot action IDs.
6. Import the `.sb` file from that add-on ZIP's `Streamer.bot` folder.
7. Follow the add-on's `INSTALL.md`, restart StreamBridge if requested, and run its preview or test.

Do not look for optional add-on actions in the core `.sb` list. Each add-on deliberately ships its own matching Streamer.bot import so core upgrades do not silently install optional automation.

## Daily use

Use the installed launchers:

- `Start THSV StreamBridge.cmd` starts the active version and opens the wizard.
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

Configuration, secrets, uploads, logs, backups, and add-on state are preserved. The installer keeps the previous application version for rollback and retries transient Windows file-lock errors during activation.

## Uninstall or reinstall

Run:

```text
%LOCALAPPDATA%\THSV StreamBridge\launcher\Uninstall THSV StreamBridge.cmd
```

The default uninstall removes the application, bundled runtime, and launchers but preserves `data\` and `addons\` for a later reinstall. Permanent deletion requires a separate double-confirmed command; it is never the default.

For the complete package layout, custom install switches, rollback behavior, and privacy details, see [Portable Windows release](release.md).
