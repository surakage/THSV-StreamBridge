# Beginner setup: Bridge Core

This is the shortest safe path from a fresh download to a working chat and alert test. Complete one numbered step before opening the next.

## 1. Install Streamer.bot first

1. Install a supported Streamer.bot release.
2. Connect Twitch, YouTube, and Kick inside Streamer.bot as needed.
3. For TikTok, install and connect TikFinity to Streamer.bot.
4. In Streamer.bot, enable the WebSocket server on `127.0.0.1:8080`.

StreamBridge never needs your platform passwords. Streamer.bot and TikFinity remain responsible for platform login.

## 2. Install StreamBridge

1. Download the main `THSV-StreamBridge-<version>.zip` and its `.sha256` file from the official GitHub release.
2. In Windows Explorer, right-click the ZIP, choose **Properties**, select **Unblock** when shown, and press **OK**.
3. Extract the ZIP. Do not run files from the ZIP preview.
4. Double-click **Install THSV StreamBridge.cmd** and leave the result window open until it reports success.
5. Open **THSV StreamBridge Setup Wizard** from the Start menu or installed folder.

## 3. Import the core Streamer.bot package

1. In the wizard, open **Streamer.bot** and follow the core import steps.
2. Import the matching versioned core `.sb` package into Streamer.bot.
3. Accept the custom C# warning only for the reviewed THSV package from the official release.
4. Leave framework actions in their generated THSV groups.
5. Press **Inspect now** in the wizard. A previously inspected action still works; inspection only refreshes the displayed name and drift status.

## 4. Add platform triggers once

Use one main intake per platform:

- Twitch triggers go on **THSV Twitch - Intake**.
- YouTube triggers go on **THSV YouTube - Intake**.
- Kick triggers go on **THSV Kick - Intake**.
- TikFinity forwards TikTok events to **THSV TikTok - Intake**.
- Streamlabs and Ko-fi integration triggers go on their documented THSV intake actions.

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

## 7. Install optional add-ons last

Get core chat and alerts working first. Then follow the [beginner add-on guide](addon-setup-for-beginners.md) and the specific guide for each add-on you install.

## If something does not happen

Check these in order:

1. StreamBridge health is ready.
2. Streamer.bot WebSocket server is running on the configured port.
3. The platform intake trigger ran exactly once.
4. The add-on is installed, enabled, saved, and the bridge was restarted when requested.
5. Required action grants show approved in the wizard.
6. The browser source shows its brief LIVE connection badge after a refresh.
7. The test was not suppressed because it was simulated, duplicated, offline-only, or missing a stable provider ID.

Use **Diagnostics** in the wizard before adding more triggers. Duplicate triggers usually make troubleshooting harder.
