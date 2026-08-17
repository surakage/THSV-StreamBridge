# Complete installation and Streamer.bot setup guide

This guide takes you from a fresh Windows computer to a tested THSV StreamBridge installation. Follow the sections in order. You will install StreamBridge, configure its local wizard, generate one Streamer.bot import, connect only the recommended triggers, and run a safe test.

## What you need

- Windows 10 or newer on a 64-bit computer
- Streamer.bot `1.0.7` stable or newer
- At least one streaming account connected in Streamer.bot: Twitch, YouTube, or Kick
- TikFinity connected to Streamer.bot if you want TikTok support
- OBS Studio, Meld Studio, Streamlabs Desktop, or another browser-source host if you want overlays

You do not need Node.js, npm, Docker, a database, or your platform passwords. Streamer.bot and TikFinity remain responsible for platform authentication.

## 1. Prepare Streamer.bot

1. Download and extract Streamer.bot from its official website.
2. Open Streamer.bot and connect the platforms you intend to use.
3. Open **Servers/Clients > WebSocket Server**.
4. Use these local defaults:

   | Setting | Value |
   | --- | --- |
   | Auto Start | Enabled |
   | Address | `127.0.0.1` |
   | Port | `8080` |
   | Endpoint | `/` |

5. Start the WebSocket server. Its status should show that it is running.

If you enable WebSocket authentication, you must also configure StreamBridge to use the matching password environment variable. Leave authentication disabled for the simplest same-computer setup.

## 2. Download and install StreamBridge

1. Open [Download THSV StreamBridge](https://www.slothbloom.com/downloads/streambridge).
2. Download the current `THSV-StreamBridge-<version>.zip` and its adjacent `.sha256` file.
3. Verify the download using [Release verification](../RELEASE-VERIFICATION.md).
4. Right-click the ZIP in Windows Explorer, choose **Properties**, select **Unblock** if that option appears, and select **OK**.
5. Extract the ZIP into a temporary folder. Do not run the installer from the ZIP preview.
6. Open the extracted folder and double-click **Install THSV StreamBridge.cmd**.
7. Keep the installer window open until it reports a successful health check and opens the setup wizard.

The default installation folder is:

```text
%LOCALAPPDATA%\THSV StreamBridge
```

The installer also:

- creates a private control token for this computer;
- saves `THSV StreamBridge Recovery Key.txt` in the installed folder;
- installs the local launchers and notification-area shell;
- preserves settings and private data when a newer version is installed; and
- opens the wizard using a short-lived, one-use local unlock link.

No administrator permission is normally required. If Windows blocks the command file, open PowerShell in the extracted folder and run:

```powershell
.\runtime\node.exe .\installer\install.mjs
```

## 3. Open and unlock the setup wizard

Use any one of these normal methods:

- double-click the THSV Village icon in the Windows notification area;
- run **Open THSV Setup Wizard.cmd** from the installed folder; or
- after the Streamer.bot import is installed, run **THSV StreamBridge - Open Setup Wizard** in Streamer.bot.

These launchers start StreamBridge if necessary and unlock the local wizard automatically. You should not need to search for or type the permanent token.

If automatic unlock is unavailable, use the recovery key from the installed folder. The wizard's **Overview** page can also download a fresh recovery-key copy. Keep the key private and never show it on stream.

## 4. Complete the wizard setup

Work through the wizard in this order.

### Overview

Confirm that the installed version and Bridge status are shown. Green means the core service is ready. An amber optional-app warning does not block StreamBridge.

### Streamer.bot

1. Keep Streamer.bot open.
2. Select **Detect automatically**, or select **Choose Streamer.bot.exe** and browse to your Streamer.bot executable.
3. Confirm that the wizard shows the expected WebSocket port and a ready connection.
4. Optionally configure OBS Studio and Speaker.bot under the one-button applications.
5. Optionally create the **Start THSV Streaming Tools** shortcut or use the displayed `.cmd` path in a Stream Deck **System > Open** action.

### Platforms

Enable only platforms that are already connected in Streamer.bot or TikFinity. Start with one platform, finish its test, and then enable the next platform. StreamBridge does not need the platform passwords.

### Viewer Foundation and Community Analytics

Review Viewer Foundation first because it owns shared viewer identity and points settings. Community Analytics is installed with StreamBridge and can be configured from its own wizard page.

### Extensions

The seven extension groups organize built-in StreamBridge features. Enable a group to install and activate its included components together. Open **System details** only when you need to review its components or health information.

### Chat, alerts, commands, and timed actions

Configure only the features you plan to test. Use each page's preview button before going live. Timed actions and live chat delivery remain gated by verified platform live state.

### Add-ons

Optional add-ons are separate from built-in extensions. Install them after the core connection works. Review the publisher, compatibility, permissions, and requested action approvals before installing a `.thsv-addon` package.

### Save the setup

Changed settings are staged first. Return to **Overview** and select **Commit with backup**. Restart StreamBridge when the wizard says a restart is required. A success message should appear; do not assume a silent button press saved anything.

## 5. Generate one Streamer.bot import

1. Open the wizard's **Streamer.bot** page.
2. Find **One Streamer.bot import**.
3. Select **Select enabled features** to match the extensions and add-ons currently enabled in the wizard.
4. Review the three sections:

   - **Always included** contains the required connection, receiver, delivery, administration, and setup actions.
   - **Included features** contains the built-in features you selected.
   - **Installed optional add-ons** contains eligible actions for add-ons already installed and enabled.

5. Clear any optional package you do not intend to use.
6. Select **Create & download one import**.
7. Wait for the success message. Windows downloads one version-matched `.sb` file and the wizard creates an exact **Recommended trigger checklist** for that selection.

Keep the downloaded import with the matching StreamBridge release. Do not combine it manually with older `.sb` files.

## 6. Import the file into Streamer.bot

1. In Streamer.bot, select **Import** on the top toolbar.
2. Drag the downloaded `.sb` file into the Import dialog. If drag-and-drop is unavailable, open the file in a text editor and paste its import string into the dialog.
3. Review the included THSV groups and actions.
4. Leave all required items included.
5. On a first installation, import all selected items.
6. On an update, keep **Overwrite** enabled for matching THSV items so stable action IDs are upgraded instead of duplicated.
7. Select **Import** to finish.
8. Accept Streamer.bot's custom C# warning only when the import came from the verified official THSV StreamBridge archive or the wizard-generated package.

Do not rename internal receiver or delivery actions unless the corresponding StreamBridge setting is also intentionally changed.

Streamer.bot's official import instructions are available in its [Import & Export guide](https://docs.streamer.bot/guide/core/import-export).

## 7. Add only the recommended triggers

Return to **THSV Setup Wizard > Streamer.bot** and select **Review recommended triggers**. This generated checklist is authoritative for the exact import you created.

To add a trigger in Streamer.bot:

1. Open **Actions & Queues > Actions**.
2. Select the action named by the wizard checklist.
3. In the **Triggers** pane, select the `+` button or right-click the empty area.
4. Choose the exact trigger path listed by the wizard.
5. Configure any criteria named by the checklist, then save it.

Common intake rules are:

| Platform or service | Action that owns its triggers |
| --- | --- |
| Twitch | `THSV Twitch - Intake` |
| YouTube | `THSV YouTube - Intake` |
| Kick | `THSV Kick - Intake` |
| TikTok | The matching `THSV TikTok - Chat`, `Follow`, `Gift`, `Like`, or `Subscription` action selected in TikFinity |
| Ko-fi | The Ko-fi intake action named by the generated checklist |
| Streamlabs | The Streamlabs intake action named by the generated checklist |

Important rules:

- Add a platform event to its intake action only once.
- Keep Core Receiver, `Multi-*` actions, controllers, projections, outputs, and delivery actions triggerless unless the generated checklist explicitly names them.
- Do not attach the same chat, reward, follow, gift, or lifecycle trigger to both an intake and an add-on action.
- Twitch and Kick reward-redemption triggers belong on their main platform intake actions.
- TikFinity events are mapped inside TikFinity rather than added as native Streamer.bot platform triggers.

Streamer.bot's [Triggers guide](https://docs.streamer.bot/guide/core/triggers) explains where the trigger pane and test controls are located.

## 8. Inspect and test the imported actions

1. Keep Streamer.bot and its WebSocket server running.
2. In the wizard's **Streamer.bot** page, select **Inspect actions**.
3. Confirm required imported actions are present and enabled.
4. Open each imported THSV action that contains **Execute C# Code**. Select **Save and Compile** and resolve any compiler error before enabling live triggers.
5. Use a harmless test trigger or wizard preview.
6. Confirm Streamer.bot Action History shows one intake execution and the expected downstream action once.
7. Confirm the wizard reports the event as accepted rather than duplicated, offline-suppressed, or missing provider identity.

Reopen **Review recommended triggers** if an expected action does not run. Adding extra triggers usually creates duplicates and makes diagnosis harder.

## 9. Add overlays to your broadcast application

Copy the needed URL from the wizard instead of typing it when possible.

| Purpose | Local URL |
| --- | --- |
| Combined chat and alerts | `http://127.0.0.1:8787/overlay/` |
| Chat only | `http://127.0.0.1:8787/overlay/chat` |
| Alerts only | `http://127.0.0.1:8787/overlay/alerts` |
| Interactive multichat dock | `http://127.0.0.1:8787/overlay/chat/dock` |

Add each URL as a Browser Source or Browser Layer in OBS Studio, Meld Studio, or Streamlabs Desktop. Start with a 1920 by 1080 source, use the wizard's exact preview template to size it, and then crop or position it in the broadcast application.

The overlays share StreamBridge's existing connection. Do not create another Streamer.bot WebSocket connection for each source.

## 10. Final readiness check

Before the first live stream, confirm all of the following:

- `http://127.0.0.1:8787/health` reports `healthy`.
- The wizard reports Streamer.bot connected and ready.
- Every enabled platform is connected through Streamer.bot or TikFinity.
- **Inspect actions** finds the imported actions.
- The generated trigger checklist has been completed without duplicates.
- Chat and alert previews appear once.
- Each browser source connects and displays its preview.
- High-impact actions such as moderation, rewards, raids, ads, and stopping a broadcast have their required creator approvals.
- Optional add-ons were tested individually after core chat and alerts worked.

## Daily startup

Use **Start THSV Streaming Tools.cmd** from the installed folder, desktop shortcut, or Stream Deck. It safely starts or verifies the configured tools without creating duplicate Streamer.bot sessions.

To reopen setup, use the tray icon or **Open THSV Setup Wizard.cmd**. Opening the wizard does not restart an already healthy Bridge.

## If setup does not work

Check these in order:

1. StreamBridge health and readiness.
2. Streamer.bot's WebSocket server is running on the configured address and port.
3. The correct platform account is connected.
4. The universal import completed and its C# actions compile.
5. The exact intake action has one matching trigger.
6. The wizard configuration was committed and StreamBridge restarted when requested.
7. The event was not intentionally blocked because the platform was offline, the event was simulated or duplicated, or a required stable provider ID was missing.

Use the wizard's **Diagnostics** page before adding or duplicating actions. For Windows blocks, ports, overlays, or connection problems, see [Troubleshooting](troubleshooting.md).

## Updating later

Use **Overview > Check for updates** in the authenticated wizard. Download and prepare the verified update, make sure every platform is offline, and then select **Install verified update**. Settings, secrets, uploads, logs, backups, and add-on private state are preserved.

After an update, generate a new universal import using the same feature selections and import it with overwrite enabled. Review its newly generated trigger checklist before changing existing triggers.
