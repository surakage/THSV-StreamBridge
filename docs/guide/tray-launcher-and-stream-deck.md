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

You can also put Streamer.bot actions on Stream Deck or hotkeys when a feature's guide says so, for example Raid Scout's **Finish Stream** or Translate's **Push to Talk** button, which translates what you say into chat or on-screen captions ([Translate](../addons/user-translate.md#stream-deck-button-push-to-talk)). The TikTok LIVE Studio Go LIVE option needs LIVE Studio's own Stream Deck plugin installed (see [Platforms](platforms.md)).

### 4. Speaker.bot

Speaker.bot is optional. Choose its executable above to start it with your tools. [Village Voice](../addons/voice-relay.md) uses it for spoken alerts and viewer TTS.

## The tray menu

Right-click the tray icon:

| Menu item | What it does |
| --- | --- |
| Status line | Shows **Bridge is ready**, **Bridge needs attention** or **Bridge is offline** |
| Open Setup Wizard | Opens the wizard, already unlocked (double-click does the same) |
| Copy Wizard password | Copies the wizard password so you can paste it if the wizard asks. It is never shown on screen. To skip the password on this PC, open **Overview > Wizard unlock** in the wizard. |
| Start streaming tools | Same as the one-button start |
| Start or repair Bridge | Starts StreamBridge, or repairs it if it is not running properly |
| Stop Bridge | Stops StreamBridge |
| Open installation folder | Opens the install folder |
| Refresh status | Checks again now |
| Exit tray shell | Closes only the tray icon. StreamBridge keeps running |

The tray shows a pop-up only when something changes, for example StreamBridge becomes ready or needs attention. It never restarts a healthy StreamBridge by itself.

### If a platform disconnects in Streamer.bot

StreamBridge checks every minute that Streamer.bot is still connected to each platform you turned on (Twitch, YouTube and Kick). If one drops and stays down, the tray shows **<Platform> disconnected in Streamer.bot**: chat, follows and rewards from that platform are not arriving. In Streamer.bot open **Platforms > <Platform> > Accounts** and reconnect the **Broadcaster** account. The alert clears by itself once it is back.

### When one of your programs updates itself

StreamBridge remembers the version of every program it works with: Streamer.bot, OBS Studio and the plugins you added to OBS (Aitum Stream Suite, Move, Composite Blur and so on), plus each companion app you turned on (TikTok LIVE Studio, TikFinity, Speaker.bot, Voicemod, Streamfog). It checks two minutes after it starts, once your apps are open, and every six hours after that. When one changes, the tray shows **<Program> updated** and StreamBridge rechecks itself against the new version straight away: it fetches fresh Streamer.bot compatibility data, looks for a StreamBridge update that supports the new version, and reruns the pre-stream check. The update also appears in the pre-stream check for two weeks, so you know what changed if something behaves differently. It never blocks going live. Versions are kept in `data\state\app-versions.json`.

### If StreamBridge freezes

If StreamBridge is still running but stops answering for a minute, the tray restarts it and shows **StreamBridge froze and was restarted**. It only does this while you are offline. It never restarts StreamBridge while a platform is live, while StreamBridge is starting, or after you chose **Stop Bridge**. It tries at most once every 15 minutes, so a StreamBridge that keeps freezing is left for you to look at. Each step is written to `data\logs\tray-shell.log`. To bring the icon back after **Exit tray shell**, run **Open THSV StreamBridge Tray.cmd** in the install folder.

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

## Launchers in the install folder

| File | What it does |
| --- | --- |
| Start THSV Streaming Tools.cmd | Starts everything you chose, in order; the Stream Deck target |
| Start THSV StreamBridge.cmd | Starts StreamBridge and opens the wizard |
| Open THSV Setup Wizard.cmd | Starts StreamBridge if needed and opens the wizard |
| Start THSV Streamer.bot Safely.cmd | Starts only Streamer.bot after checking its WebSocket port; for repairs |
| Stop THSV StreamBridge.cmd | Stops StreamBridge safely |
| Open THSV StreamBridge Tray.cmd | Brings the tray icon back |

For depth, read [Portable Windows release](../release.md) and [Troubleshooting](../troubleshooting.md).
