# Beginner setup: Bridge Core

> **New to StreamBridge?** Follow the [Quick start](guide/quick-start.md) instead. It covers the whole first setup on one page. This page is the detailed reference.

This is the shortest safe path from a fresh download to a working chat and alert test. Complete one numbered step before opening the next.

Looking for a specific feature? The [setup guide feature index](guide/README.md) lists every feature and add-on with plain step-by-step pages.

## 1. Install Streamer.bot first

1. Install Streamer.bot `1.0.7` stable or newer.
2. Connect Twitch, YouTube, and Kick inside Streamer.bot as needed.
3. For TikTok, install and connect TikFinity to Streamer.bot.
4. In Streamer.bot, enable the WebSocket server on `127.0.0.1:8080`.

StreamBridge never needs your platform passwords. Streamer.bot and TikFinity remain responsible for platform login.

## 2. Install StreamBridge

1. Download the latest `THSV-StreamBridge-<version>.zip` and its `.sha256` file from [GitHub Releases](https://github.com/surakage/THSV-StreamBridge/releases/latest).
2. In Windows Explorer, right-click the ZIP, choose **Properties**, select **Unblock** when shown, and press **OK**.
3. Extract the ZIP. Do not run files from the ZIP preview.
4. Double-click **Install THSV StreamBridge.cmd** and leave the result window open until it reports success.
5. Let the installer open the guided setup automatically. Later, reopen it from the tray icon, **THSV StreamBridge - Open Setup Wizard** in Streamer.bot, or **Open THSV Setup Wizard.cmd** in the installed folder.

## 3. Create one Streamer.bot import

1. In the wizard, open **Streamer.bot** and confirm the selected executable and WebSocket connection.
2. In **One Streamer.bot import**, select the features you plan to use. Required framework actions are included automatically.
3. Select **Create & download one import**, then import that single versioned `.sb` package into Streamer.bot.
4. Accept the custom C# warning only for the reviewed THSV package from the official release.
5. Leave framework actions in their generated THSV groups.
6. Select **I finished importing — verify now**, then open **Recommended trigger checklist**, add only the setup-dependent triggers it lists, and press **Inspect actions**. A previously inspected action still works; inspection only refreshes the displayed name and drift status.

## 4. Platform triggers come with the import

The import already puts the Twitch, YouTube, and Kick triggers on **THSV Twitch - Intake**, **THSV YouTube - Intake**, and **THSV Kick - Intake**. **Do not add them again by hand**, or every event arrives twice. See [Streamer.bot import and approval](guide/streamerbot-import-and-approval.md).

The wizard's generated trigger checklist remains the authoritative setup reminder for the triggers you do add yourself:

- In TikFinity, map TikTok Chat, Follow, Gift, Like, and Subscription events to the matching **THSV TikTok - ...** actions.
- Streamlabs and Ko-fi integration triggers go on their documented THSV intake actions.
- Setup-dependent triggers such as hotkeys, Stream Deck buttons, or **Streamer.bot Started** on the Launch Bridge action are not in the import. Re-attach them after each overwrite import.

Do not copy the same trigger onto Multi-Chat, Multi-Alerts, or an add-on action. Those actions are internal processors called by the bridge.

## 5. Verify the connection

1. Start StreamBridge from the installed launcher.
2. Open the wizard and confirm Streamer.bot shows connected.
3. Run the wizard's harmless local chat preview.
4. Confirm the event is accepted once and no duplicate intake action runs.
5. Open `http://127.0.0.1:8787/health` and confirm health is `healthy` and readiness is `ready`.

## 6. Add browser sources

1. Copy the Chat URL from the wizard into an OBS, Meld, or Streamlabs Desktop browser source.
2. Copy the Alerts URL into a separate browser source.
3. Start at 1920 by 1080, refresh the source, then crop it inside the broadcasting application.
4. Send chat and alert previews before changing fonts, colors, or transitions.

Every core and add-on overlay shares StreamBridge's browser-overlay transport. Do not create another Streamer.bot WebSocket connection for each overlay.

## 7. Turn on extensions last

Get core chat and alerts working first. Every feature is built in, so there is nothing to download. Then follow the [beginner extension guide](addon-setup-for-beginners.md) and the specific guide for each feature you turn on.

## Saving Wizard changes

When a page stages configuration, a persistent **Unsaved changes** bar appears at the bottom of every Wizard page. You do not need to remember to return to Overview. Review the affected sections and choose **Save with backup**. **Discard** removes only the protected draft; it does not undo settings that were already saved.

If the Wizard tab closes or refreshes before you decide, it warns you when the browser allows it. The protected draft remains safe even if you continue: unlock the Wizard again and the draft is restored automatically, including the exact pending values in each affected editor. Locking the Wizard also preserves pending work and explains how to recover it. Select an affected-section chip in the bottom bar to review that editor directly, then save or discard the recovered work before editing more settings. Keep only one Wizard tab open for configuration changes. The Bridge refuses to create a competing draft, binds the protected draft to the tab that created it, and prevents another tab from editing, saving, or discarding that work.

All StreamBridge configuration happens in the installed local Wizard. SlothBloom is the public home for downloads, release information, and setup documentation; it is not required to configure or run StreamBridge. Streamer.bot connections, provider credentials, local paths, logs, broadcast controls, and saved settings stay on your computer.

If a setting or import fails validation, the Wizard restores every editor to the last server-confirmed draft. Earlier valid pending changes remain available, while the rejected value is removed, so the controls never imply that an invalid change will be saved. If the first attempted change is rejected, the Wizard also removes the empty draft automatically; there is nothing extra to discard.

If a browser closes while the Wizard is still checking the very first change, reopening and unlocking the Wizard clears that abandoned empty draft automatically. It never clears a draft containing real pending changes; those are restored for review instead.

While a change is being checked, the bottom bar says **Checking change** and briefly pauses configuration editors, Save, Discard, and Lock. Wait for the pending or error result before continuing; this prevents rapid clicks from creating overlapping draft operations.

The same protection stays active while the bar says **Saving safely** or **Discarding**. Saving creates the backup and commits once; discarding removes only the protected draft. Other configuration controls return automatically after the operation reports its result.

After saving, choose **Restart safely** in the same bar. StreamBridge confirms that every platform is offline, uses the installed launcher's guarded stop-and-start workflow, waits for the replacement service to become healthy, and opens a fresh unlocked Wizard window. The Overview connection check then reports **Configuration: Active** so you know the replacement process loaded the saved file. If you are live, the restart is refused and your saved settings remain safe for later.

## If something does not happen

Check these in order:

1. StreamBridge health is ready.
2. Streamer.bot WebSocket server is running on the configured port.
3. The platform intake trigger ran exactly once.
4. The add-on is installed, enabled, saved, and the bridge was restarted when requested.
5. Required action grants show approved in the wizard.
6. The browser source shows its brief LIVE connection badge after a refresh.
7. The test was not suppressed because it was simulated, duplicated, offline-only, or missing a stable provider ID.

Open **Test & finish** in the wizard and run the plain-language pre-stream check before adding more triggers. It checks the local Bridge, Streamer.bot delivery, enabled platforms, feature health, and read-only action inspection, then links directly to the setup page for anything incomplete. Raw diagnostics and the emergency queue reset remain collapsed under **Advanced diagnostics and emergency recovery**. Duplicate triggers usually make troubleshooting harder.
