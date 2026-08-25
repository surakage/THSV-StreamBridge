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
2. Download `THSV-StreamBridge-4.0.1.zip` and `THSV-StreamBridge-4.0.1.zip.sha256` from the latest Version 4 release.
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

A fresh installation opens **Guided setup** automatically. Its connection check separates the running Bridge, Streamer.bot WebSocket delivery, enabled platform adapters, and feature modules. Follow its single recommended recovery button instead of interpreting raw diagnostics. Select **Show all settings** only when you need the full management interface.

Readiness failures include a scoped recovery action. The Wizard can open the affected platform or feature page directly, or safely start Streamer.bot when that is the exact blocker. Startup reports share one run ID across **Start all streaming tools**, Streamer.bot, and StreamBridge, and completed runs are retained in a bounded rotated history.

If Windows blocks the `.cmd` file, open PowerShell in the extracted folder and run the same installer directly through its bundled signed runtime:

```powershell
.\runtime\node.exe .\installer\install.mjs
```

No administrator permission is normally required. See [Troubleshooting](troubleshooting.md#smart-app-control-blocks-the-installer) if the installation does not finish.

### Connect the safe Streamer.bot launcher

Open **Streamer.bot connection** in the setup wizard. Choose **Detect automatically** while Streamer.bot is running, or choose **Choose Streamer.bot.exe** and select the portable executable. StreamBridge saves only that local executable path and the WebSocket port already configured in the bridge. The setting lives under creator-owned `data/configuration`, so upgrades preserve it.

Under **Direct scene connections**, add each local OBS, Meld Studio, or Streamlabs Desktop WebSocket you use. Profiles are named, so landscape and portrait instances can coexist. The provider-specific note points to the vendor-owned credential instructions and supplies the normal loopback URL. On Windows, passwords and tokens are encrypted with DPAPI for the current Windows account, never returned to the browser, and excluded from configuration exports and support bundles. Use **Test direct** to confirm native scene discovery; the result explicitly says when StreamBridge is using its Streamer.bot fallback instead. Enabled profiles keep a scene-change subscription so create, rename, remove, and current-scene changes refresh the Wizard without manual copying. When a configured application closes, its subscription becomes **paused** and resumes automatically after the process returns instead of generating reconnect noise. The Wizard raises one consolidated warning only after three reconnects or latency reaches the profile's threshold (2,000 ms by default). The bounded local activity list shows state, latency, reconnects, and scene counts without recording scene names or secrets.

That card also supports explicit acceptance-baseline approval after an intentional scene change, a missed tray-notification history, a read-only duplicate-port and wrong-installation assistant, an optional acceptance/credential freshness gate, and a per-profile 0-100 reliability score. Strict freshness gating is off by default and requires creator approval. The conflict assistant never stops processes or changes ports automatically.

Reliability score drops must remain below the healthy range for the configured warning delay before a tray alert appears. Use **Snooze 1 hour** for planned application maintenance; reconnect attempts and score alerts pause until the snooze expires or you resume them. A scheduled dry-run can be configured for selected stream days and runs locally before the usual stream time without starting a broadcast, posting chat, or changing scenes. Reliability reports export redacted JSON or CSV, and the landscape/portrait clone assistant requires an unused explicit port and creates the clone disabled for testing.

**Export profile names and URLs** creates metadata only. On another computer, choose **Import profile metadata**: StreamBridge rejects secret-bearing or non-loopback data, previews every validated profile, and asks for each required credential separately. The confirmed import is transactional and merges matching profile IDs while retaining unrelated saved profiles.

**Discover local endpoints** checks only the documented OBS, Meld, and Streamlabs loopback defaults and can prefill a profile for review; it never scans the network or saves automatically. For a non-default instance, **Check this one port** accepts one explicit loopback port and never expands it into a range. **Run installed-app acceptance** tests each exact configured executable/PID and reports different-installation, stopped, missing-profile, failed, and passed outcomes in the Wizard. Each run stores a bounded sanitized receipt containing only provider, outcome, executable filename, PID, scene count, and latency; the Wizard compares it with the prior receipt and highlights regressions. Enabled profile changes use test-before-save: the proposed endpoint and credential must connect before the protected working profile is replaced. A successful credential test records its verification date, and an optional 30/60/90/180-day reminder can be enabled without guessing a vendor expiry date. Support bundles include the receipt comparison and a sanitized 30-minute latency/reconnect summary alongside the bounded event history.

Maintainers can run `npm run test:broadcast-vendors` against the installed runtime. It distinguishes not installed, disabled, not running, missing profile, failed, and passed outcomes. A pass requires a real direct test plus recent sanitized runtime evidence; only then does the report mark fixture refresh as eligible. Never copy real scene names or credentials into fixtures. The unit suite replays genericized WebChannel and SockJS protocol fixtures so discovery and change subscriptions remain regression-tested when those applications are unavailable.

Choose **Create one-button desktop shortcut** to add **Start THSV Streaming Tools** to the Windows desktop. It runs the same complete workflow as the Stream Deck target: Streamer.bot first, Speaker.bot second when enabled, StreamBridge after the delivery connection is ready, and OBS, Meld, or Streamlabs last. This order lets browser overlays connect to an already running Bridge. Repeated launches join the startup already in progress instead of producing a second conflicting launch, and optional-app warnings never block core readiness. The guarded Streamer.bot step verifies the exact process that owns the configured WebSocket port, waits for a recently closed listener to release, and repairs an incomplete session through its normal window-close request. It never force-terminates an unrelated process.

The installer keeps its launchers in the exact installed folder and does not add automatic Desktop shortcuts. In **Streamer.bot connection → Optional one-button apps**, you may select OBS Studio and Speaker.bot and enable either one for startup. They are disabled by default, never bundled, and never block Streamer.bot or StreamBridge if they are unavailable. For Stream Deck, add **System → Open** and select the **Stream Deck one-button target** shown in the wizard: `Start THSV Streaming Tools.cmd`. Repeated presses do not restart healthy services. Its console closes automatically after a successful launch and stays open only when a core tool needs attention. Use **Open installed folder** in the wizard whenever you need the recovery key or another launcher.

The installer starts **THSV StreamBridge Tray** after the Bridge passes its health check. Double-click its Village icon to open the Setup Wizard, or right-click it for status, safe streaming-tool startup, Bridge start/stop, and the installed folder. The shell checks the local readiness endpoint every 5 seconds and shows a notification when readiness changes, a new startup failure is recorded, an exact provider process binding changes, or a connection first crosses its per-profile latency threshold. Credential reminders appear in the status text without repeated balloons. Closing the shell does not stop StreamBridge; reopen it with `Open THSV StreamBridge Tray.cmd` from the installed folder.

The wizard reports a fully healthy launch in green, a healthy core launch with an optional OBS/Speaker.bot problem in amber, and a core startup failure in red. While startup is running, it shows the current phase and retry attempt. Afterward, the connection check names each exact readiness blocker and its recovery action. Repeating the same crashing startup three times in ten minutes opens a five-minute safety circuit so one-button retries cannot create an endless crash loop. Amber never means StreamBridge delivery is blocked.

## 3. Prepare Streamer.bot

1. Open Streamer.bot.
2. Open **Servers/Clients > WebSocket Server**.
3. Set the address to `127.0.0.1`, port to `8080`, and endpoint to `/`.
4. Enable **Auto Start**, then start the WebSocket server.
5. In the setup wizard, open **Streamer.bot → One Streamer.bot import**.
6. Choose the included features and installed optional add-ons you plan to use, then select **Create & download one import**.
7. Import that single `.sb` file in Streamer.bot and accept the custom C# warning only for the verified official package.
8. Open **Recommended trigger checklist** in the wizard and attach only the listed triggers. Internal receivers, controllers, and delivery actions remain triggerless.
9. Select **Inspect actions** and resolve any reported missing or changed action before going live.

The universal package preserves stable action and command IDs, so generating and importing a newer matching package upgrades the existing THSV groups instead of asking you to assemble a receiver chain manually. Individual package imports are documented in [Streamer.bot recovery reference](streamerbot-setup.md#recovery-and-development-reference) only for repair and development.

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

The Wizard keeps an **Unsaved changes** bar visible across every page whenever a protected draft contains staged sections. Use that bar to review, save with a local backup, or discard the draft. If the saved file truly changed, **Restart safely** activates it only when every platform is offline. The guarded launcher waits for the replacement Bridge to become healthy and then opens a fresh unlocked Wizard. If the staged values already matched the active configuration, the Wizard reports **Configuration already active** and skips the unnecessary restart.

The direct wizard URL is `http://127.0.0.1:8787/wizard/`, but the launcher is recommended because it confirms the service is healthy before opening the local authentication page.

## 5. Add browser overlays

Open **Chat Overlay → Browser-source checklist** in the setup wizard. Choose OBS Studio, Meld Studio, or Streamlabs Desktop. The assistant lists only the shared core layers and overlay-capable add-ons that are currently installed and enabled. For each source, it provides the exact name, local URL, canvas size, loading behavior, and safe preview control. Mark a source as checked only after it is added and sized in your streaming app; that checklist stays locally in the browser.

OBS browser sources also report their read-only visible/active state through the existing shared overlay connection. **Test & finish** shows this as an optional OBS visibility check. It does not control OBS, change scenes, or open another WebSocket. Other browser-source hosts continue to use the manual checklist.

The **Live acceptance tracker** records only genuine upstream event IDs, platform, event type, and timestamp—never chat text or viewer identity. Select the matching captured event and personally confirm the end-to-end result before marking a provider path accepted. Manual startup, scene, overlay, reconnect, and persistence checks still require a short creator result note.

The main core URLs are:

| Purpose | URL |
| --- | --- |
| Combined Chat and Alerts | `http://127.0.0.1:8787/overlay/` |
| Chat only | `http://127.0.0.1:8787/overlay/chat` |
| Alerts only | `http://127.0.0.1:8787/overlay/alerts` |
| Interactive multichat dock | `http://127.0.0.1:8787/overlay/chat/dock` |

Start Chat at 680 x 800 for a crisp responsive panel. Start Alerts and full-canvas event layers at 1920 x 1080, then crop or position them in your broadcast application without enlarging the source transform. Use **Open design preview** for the exact saved Chat or Alert template. For an installed event-driven add-on, open its live source and then choose **Send safe preview**; the layer is intentionally transparent while idle.

The checklist labels each layer as **Always connected**, **Foreground queue**, or **Independent**. Keep always-connected sources loaded between scenes. Foreground cards wait their turn so reward and alert layouts do not overlap. Timers, ad status, and clip playback remain independent so they cannot be stalled by the foreground queue.

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

1. Open **Test & finish** and choose **Run pre-stream check**. This uses local health information and read-only Streamer.bot inspection; it does not post, redeem, or start a broadcast.
2. After importing the Wizard-generated package and attaching its listed triggers, confirm that step in the checklist. The confirmation stays on this computer.
3. Use wizard previews for Chat and Alerts. Overlay verification is shown separately because visual layers are optional and never block chat delivery or commands.
4. Run the offline fixtures described in [Testing](testing.md).
5. Trigger one harmless live chat message per enabled platform.
6. Confirm the platform intake action, receiver, and expected child action appear once in Streamer.bot Action History.
7. Confirm the event appears once in the overlay.
8. Leave simulated-event suppression enabled for any action that can post chat, mutate a reward, or perform another live operation.

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
4. Let the installer stage and verify the new version, stop the old version, activate the new version, run its health check, and redeem a one-time local Wizard ticket to load the authenticated overview. A failed Wizard smoke check rolls the upgrade back before old code is pruned.
5. Reopen the wizard and review compatibility or add-on update notices.

StreamBridge checks core and official component updates when its authenticated Streamer.bot connection becomes ready, again after a reconnect, and then at most once every six hours while connected. SlothBloom is the friendly discovery feed and GitHub is the automatic fallback. The wizard shows the retained result when it unlocks, and **Check for updates** requests a fresh result. For a feature or add-on, select **Update safely** to verify the official release provenance, outer index hash, inner checksum, publisher, version, compatibility, and manifest before installing only that package. Settings and private state stay in place; update all desired packages and restart StreamBridge once. Select **Download for review** when you prefer the separate **Discovered packages** approval path.

If more than one compatible official add-on update is available, **Update all compatible** runs the same authenticated verification separately for each package and reports any failure without undoing successful updates. A matching Streamer.bot `.sb` from the release is checksum-verified and saved under `data/addons/inbox/streamerbot/<module>/<version>/`; re-import it when the wizard reports that the add-on's actions changed. Imports are deliberately never pushed into Streamer.bot silently.

For a Bridge release, select **Download & prepare**. After verification completes and every platform is offline, select **Install verified update**. The managed Windows installation stops StreamBridge, installs through the same health-checked portable installer, rolls back if the new version does not become healthy, restarts the Bridge, and reopens the wizard. The server rejects this operation while any platform is live. A source checkout is never overwritten by the wizard; use the downloaded release installer for that environment.

Advanced creators may expand **Optional third-party publishers** and bind one declared publisher ID to one GitHub `owner/repository`. Third-party repositories must publish the same bounded add-on index/bundle format from a tagged `.github/workflows/release.yml` run with GitHub artifact attestation. StreamBridge locks verification to that exact repository, workflow, tag, checksum, package publisher, and installed publisher before staging. Adding trust never downloads, installs, enables, or updates an add-on; every check, download, inbox installation, and restart remains a separate creator action. Remove the trust record at any time without deleting installed add-ons or their private state.

Configuration, secrets, uploads, logs, backups, and add-on state are preserved. After the new version passes its health check, the installer removes every inactive application version and retries transient Windows file-lock errors during activation.

After installation, **Test & finish → Build fingerprint & provenance** shows the exact file-set fingerprint, release-manifest SHA-256, bundled runtime, and installation time. The fingerprint distinguishes two locally rebuilt packages even when both use the same visible version number.

Live acceptance confirmations are bound to the current build, core contract, saved configuration, generated Streamer.bot trigger catalogue, and relevant installed add-on versions. A relevant change keeps the prior note for reference but changes the check to **Recheck required** until the creator verifies the current version again.

For scene-level OBS verification, expand **Expected OBS sources by scene** and choose **Use detected source** for a connected OBS program scene, or manually add the exact scene, StreamBridge surface, optional module ID, and required visible count. OBS reporting remains read-only and uses the existing shared overlay transport.

## Uninstall or reinstall

Run:

```text
%LOCALAPPDATA%\THSV StreamBridge\launcher\Uninstall THSV StreamBridge.cmd
```

The default uninstall removes the application, bundled runtime, and launchers but preserves `data\` and `addons\` for a later reinstall. Permanent deletion requires a separate double-confirmed command; it is never the default.

For the complete package layout, custom install switches, rollback behavior, and privacy details, see [Portable Windows release](release.md).
