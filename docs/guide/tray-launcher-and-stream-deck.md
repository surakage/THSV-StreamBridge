# Tray, launcher and Stream Deck

## What it is

- **The tray icon** is a small "V" icon in the Windows notification area. It shows whether StreamBridge is ready and gives you quick buttons.
- **Start THSV Streaming Tools** is one button that starts everything you stream with, in a safe order, without starting anything twice.
- **Stream Deck** can press that one button for you.

## What you need

- StreamBridge installed ([Install and first run](install-and-first-run.md)).
- Streamer.bot chosen on the wizard's **Streamer.bot** page.
- Optional: a Stream Deck.

## Set it up

### 1. Choose the programs to start

1. In the wizard, open **Streamer.bot** and find **Safe Streamer.bot launcher**.
2. Select **Detect automatically** or **Choose Streamer.bot.exe**.
3. Under **Exact programs for one-button startup**, choose each app you use: **OBS Studio**, **Meld Studio**, **Streamlabs Desktop**, **Speaker.bot**, **TikFinity**, **TikTok LIVE Studio**, **Streamfog** and **Voicemod**.
4. Tick **Start automatically** for each app you want started.

Apps you do not choose are skipped. StreamBridge never downloads, updates or closes these apps.

### 2. Start everything with one button

Use any of these:

- **Start all streaming tools** on the wizard's **Streamer.bot** page;
- **Start streaming tools** in the tray menu;
- **Start THSV Streaming Tools.cmd** in the install folder; or
- a desktop shortcut. Select **Review paths & create desktop shortcut** to make one.

The start order is: tray icon, Voicemod, Streamer.bot, Speaker.bot, StreamBridge, then OBS/Meld/Streamlabs, TikFinity, TikTok LIVE Studio and Streamfog. Anything already running and healthy is left alone. If an optional app fails, you get a warning and the rest still start. The window closes by itself on success and stays open if something failed.

### 3. Add it to Stream Deck

1. On the wizard's **Streamer.bot** page, select **Copy Stream Deck target**.
2. In the Stream Deck app, add a **System > Open** action.
3. Paste or browse to that file (`Start THSV Streaming Tools.cmd` in the install folder).

You can also put Streamer.bot actions on Stream Deck or hotkeys when a feature's guide says so, for example Raid Scout's **Finish Stream**. The TikTok LIVE Studio Go LIVE option needs LIVE Studio's own Stream Deck plugin installed (see [Platforms](platforms.md)).

### 4. Speaker.bot

Speaker.bot is optional. Choose its executable above to start it with your tools. [Village Voice](../addons/voice-relay.md) uses it for spoken alerts and viewer TTS.

## The tray menu

Right-click the tray icon:

| Menu item | What it does |
| --- | --- |
| Status line | Shows **Bridge is ready**, **Bridge needs attention** or **Bridge is offline** |
| Open Setup Wizard | Opens the wizard, already unlocked (double-click does the same) |
| Start streaming tools | Same as the one-button start |
| Start or repair Bridge | Starts StreamBridge, or repairs it if it is not running properly |
| Stop Bridge | Stops StreamBridge |
| Open installation folder | Opens the install folder |
| Refresh status | Checks again now |
| Exit tray shell | Closes only the tray icon. StreamBridge keeps running |

The tray shows a pop-up only when something changes, for example StreamBridge becomes ready or needs attention. It never restarts a healthy StreamBridge by itself. To bring the icon back after **Exit tray shell**, run **Open THSV StreamBridge Tray.cmd** in the install folder.

## How StreamBridge restarts

Many settings say "restart StreamBridge". Use **Restart safely** in the bar at the top of the wizard after **Save with backup**. StreamBridge restarts and opens a fresh, unlocked wizard window.

**Restart is refused while any platform is live.** You will see "StreamBridge will not restart while a platform is live." Finish the stream, then restart. Your saved changes wait until then.

## Check it works

1. Run **Start THSV Streaming Tools.cmd**. The summary ends with `[SUCCESS]`.
2. Hover over the tray icon. It says **Bridge is ready**.
3. Press your Stream Deck button with everything already open. Nothing restarts.

## Common problems

- **"Bundled Node runtime is missing."** Install again from the release ZIP. Your settings are kept.
- **An app is listed as failed.** Choose its exact executable again on the **Streamer.bot** page, or turn off **Start automatically** for it.
- **An app keeps crashing at start.** StreamBridge pauses it after repeated failures. Fix the app, then select **Clear crash pause**.
- **The tray icon is gone.** Run **Open THSV StreamBridge Tray.cmd**.
- **The startup report.** See `data\logs\last-startup-report.json` in the install folder.

For depth, read [Getting started: daily use](../getting-started.md#daily-use), [Portable Windows release](../release.md) and [Troubleshooting](../troubleshooting.md).
