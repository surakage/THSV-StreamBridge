# Install and first run

## What it is

This page gets StreamBridge onto your PC and walks you through the first visit to the Setup Wizard. The wizard is a private page that only your own computer can open.

## What you need

- **Windows 10 or newer**, 64-bit.
- **Windows PowerShell 5.1 or newer.** Windows 10 and 11 already include it.
- **Streamer.bot 1.0.7 or newer.** Connect your Twitch, YouTube and/or Kick accounts inside Streamer.bot first.
- **Optional:** OBS Studio, Meld Studio or Streamlabs Desktop for overlays.
- **Optional:** TikFinity, if you stream on TikTok.

You do **not** need Node.js, npm, Docker, a database or any platform passwords. StreamBridge never asks for your Twitch, YouTube, Kick or TikTok password.

## Set it up

### 1. Turn on Streamer.bot's WebSocket server

1. Open Streamer.bot.
2. Go to **Servers/Clients > WebSocket Server**.
3. Set Address to `127.0.0.1`, Port to `8080` and Endpoint to `/`.
4. Turn on **Auto Start**, then start the server.

### 2. Download

1. Open the [official GitHub Releases page](https://github.com/surakage/THSV-StreamBridge/releases/latest). The [SlothBloom download link](https://www.slothbloom.com/downloads/streambridge) points to the same file.
2. Download `THSV-StreamBridge-<version>.zip` and the `.sha256` file next to it.
3. Optional but recommended: check the download with [Release verification](../../RELEASE-VERIFICATION.md).

Add-ons are separate ZIP files on the same release page. You do not need any of them yet.

### 3. Install

1. Right-click the ZIP and choose **Properties**. If you see **Unblock**, tick it and select **OK**.
2. Extract the ZIP to a normal folder. Do not run anything from inside the ZIP preview.
3. Double-click **Install THSV StreamBridge.cmd**.
4. Wait. The window stays open and ends with `[SUCCESS]` or `[FAILED]`. It does not need administrator access.

StreamBridge installs to `%LOCALAPPDATA%\THSV StreamBridge`. The installer also:

- saves a private file called `THSV StreamBridge Recovery Key.txt` in that folder. Keep it private and never show it on stream;
- starts StreamBridge and the tray icon (a "V" in the Windows notification area); and
- opens the Setup Wizard, already unlocked.

**Windows 11 Smart App Control:** it can block the installer with no "Run anyway" button. Either tick **Unblock** on the ZIP before extracting (step 1), or open PowerShell in the extracted folder and run `.\runtime\node.exe .\installer\install.mjs`. See [Troubleshooting](../troubleshooting.md#smart-app-control-blocks-the-installer).

### 4. Open the Setup Wizard later

Use any of these. They all unlock the wizard for you:

- double-click the tray icon, or right-click it and choose **Open Setup Wizard**;
- run **Open THSV Setup Wizard.cmd** in the install folder; or
- after the Streamer.bot import, run the Streamer.bot action **THSV StreamBridge - Open Setup Wizard**.

You only need the recovery key if automatic unlock fails. Paste it into **Control token** and select **Unlock manually**.

### 5. First run in the wizard

The **Overview** page shows a **First-time setup** list with six steps. Work through them in order and tick each one after it works:

1. **Welcome** is already done.
2. **Choose exact program files**: on the **Streamer.bot** page, select **Detect automatically** or **Choose Streamer.bot.exe**. You can also pick OBS, Speaker.bot and other apps here (see [Tray, launcher and Stream Deck](tray-launcher-and-stream-deck.md)).
3. **Choose platforms**: on the **Platforms** page, tick **Platform enabled** only for platforms you really use. See [Platforms](platforms.md).
4. **Choose included features**: on the **Extensions** page, select **Enable group** on the groups you want.
5. **Import once**: see [Streamer.bot import and approval](streamerbot-import-and-approval.md).
6. **Test and finish**: on the **Diagnostics** page, select **Run pre-stream check**.

If the menu only shows a few pages (guided mode), select **Finish setup** or **Show all settings** to see every wizard page.

**How saving works.** Most changes are first held as a draft. A bar appears at the top saying how many sections are waiting. Select **Save with backup**, then **Restart safely**. StreamBridge restarts and opens a fresh wizard window. Add-on and extension settings use **Save all settings** and also need a restart.

## See what is still missing

Open **Setup checklist**, right under **Overview** in the wizard menu. It lists, for every feature you turned on, what still needs doing: actions to approve or import, empty reward IDs, scene roles to pick, or a restart. Each item has a button that takes you to the exact place to fix it. A feature with nothing missing shows **Ready**. The number next to the menu entry is how many items are still open.

## Check it works

1. Open `http://127.0.0.1:8787/health` in your browser. It should say `healthy`.
2. On **Overview**, the **Is StreamBridge ready?** box should show StreamBridge and Streamer.bot as ready.
3. Hover over the tray icon. It should say **Bridge is ready**.

## Common problems

- **The installer window closes or is blocked.** Run `.\runtime\node.exe .\installer\install.mjs` from PowerShell in the extracted folder.
- **The wizard does not open.** Run **Open THSV Setup Wizard.cmd** from the install folder, or open `http://127.0.0.1:8787/wizard/`.
- **Streamer.bot shows as not connected.** Check the WebSocket server is running on the port shown on the **Streamer.bot** page.
- **"Restart safely" fails.** StreamBridge will not restart while any platform is live. Finish the stream first.
- **Meld Studio cannot load the wizard or overlays.** Windows blocks some Store apps from local addresses. See [Troubleshooting](../troubleshooting.md#meld-studio-cannot-reach-the-overlay-or-wizard).

For more detail, read [Getting started](../getting-started.md) and the [Complete setup guide](../complete-setup-guide.md).
