# Village Lurk Tracker

Village Lurk Tracker keeps track of viewers who say they are lurking. When a viewer types the lurk command, their lurk time starts. When they chat again, the lurk ends and the time is added to their monthly total. It works on Twitch, YouTube, Kick, TikTok and Facebook, and it saves a monthly recap before the rankings reset.

## What you need
- The **Viewer Foundation** add-on, installed and enabled. Viewer Foundation provides the `!lurk` command; this add-on tracks it.
- Nothing extra. No Streamer.bot import, overlay or rewards are needed.

## Set it up
1. Install and enable Viewer Foundation first.
2. Open Setup Wizard > Extensions > Village Lurk Tracker.
3. Make sure **Lurk command** matches the lurk command in Viewer Foundation (default `lurk` on both).
4. Optional: enter a time zone for the monthly calendar (for example `America/New_York`). Leave it blank to use this PC's time zone.
5. Choose the chat messages: a thank-you when a viewer lurks (on by default) and a welcome-back when they return (off by default).
6. Optional: add any other bot account names to **Accounts to ignore**, one per line. Your broadcaster and connected bot accounts are ignored automatically.
7. Turn on **Enable lurk tracking**, save, and restart StreamBridge if asked.
8. Test on a live stream with a second account: type `!lurk`, wait a bit, then chat. Simulated events are ignored, so they never enter the rankings.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!lurk` | Everyone (provided by Viewer Foundation) | Starts tracking the viewer's lurk time. Their next chat message or command ends it. |

## Good to know
- Typing `!lurk` again while already lurking does not add an extra visit.
- When a stream goes offline or StreamBridge shuts down, active lurks end. Time while StreamBridge was closed is not counted.
- Rankings are by total lurk time, then by number of lurks. Up to 150 lurkers are tracked each month.
- At the start of a new month, the recap is saved and appears under Monthly Village Recaps in StreamBridge. Viewer points, linked identities and lifetime totals are not touched.
- Replies go to the chat the viewer used. The thank-you message uses your community name from Settings, or your channel name.
