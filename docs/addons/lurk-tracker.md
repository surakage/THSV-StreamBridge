# Village Lurk Tracker

**Module:** `thsv.lurk-tracker` · **Version:** `4.0.64` · **Separate download**

Tracks explicit lurks, automatic returns, and monthly participation recaps across five platforms.

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

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Lurk-Tracker-4.0.64.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Lurk-Tracker-4.0.64.thsv-addon` and review its permissions.
3. Return to the wizard, configure the extension, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.lurk-tracker` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable lurk tracking |  | Off |
| Lurk command | Match Viewer Foundation’s lurk command. | `lurk` |
| Monthly calendar time zone | Leave blank to use this PC's time zone, or enter an IANA time zone such as America/New_York. Invalid values fall back to this PC's time zone. | (blank) |
| Thank viewers for lurking |  | On |
| Welcome viewers back in chat |  | Off |
| Accounts to ignore | Your broadcaster and connected bot accounts are ignored automatically. Add any other account names here, one per line. | (none) |

## Health checks

- **thsv.lurk-tracker.runtime:** Tracks explicit lurks with monthly rollover and bounded private state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `schedule.bounded`, `viewer.foundation.read`.

Private storage: `data/addons/thsv.lurk-tracker/`, `data/addons/.state/thsv.lurk-tracker/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable or uninstall the tracker; private reports stay available.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
