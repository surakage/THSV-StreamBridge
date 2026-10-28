# Stream Break & End Guard

**Module:** `thsv.stream-session-guard` · **Version:** `4.0.59` · **Built in (extension)**

A built-in live-session wellness timer that derives breaks from the planned stream length, warns before deadlines, and switches only to scenes detected from the connected broadcast app.

Stream Break & End Guard helps you take regular breaks and stop on time. While you are live, it plans breaks from your stream length, warns you (and optionally chat) before each break, switches to your break scene, and brings you back afterward. When you reach your maximum stream length, it gives a five-minute warning and then switches to your ending scene. It never starts or stops your broadcast.

## What you need
- The Stream Break & End Guard Streamer.bot import. **THSV Extension - Stream Break & End Guard - Scene Controller** must stay triggerless and be approved for this extension. The optional **Pause Automation**, **Resume Automation** and **Toggle Pause** actions can go on a hotkey or deck button.
- A break scene and an ending scene in OBS, Meld or Streamlabs. The defaults use the Break and Ending scenes you chose under Add-ons > Scene roles.
- Optional: a browser source for the countdown reminder. Copy the URL from the wizard and add it to the scenes where you want to see the warning. Its sounds also play from this source.

## Set it up
1. In Streamer.bot, import the package. Open **Scene Controller**, click Save and Compile, and leave it with no triggers.
2. Open Setup Wizard > Extensions > Broadcast Director > Stream Break & End Guard.
3. Choose your broadcast app (OBS, Meld or Streamlabs) and connection number (0 for the first connection).
4. Refresh the scene list and pick your break scene, ending scene and, if you like, a five-minute warning scene. Picking from the detected list avoids typing mistakes.
5. Set the maximum stream length (default 240 minutes) and choose whether the ending scene switches automatically at zero or waits for you.
6. Set up breaks: automatic schedule (default) or a manual interval, break length (default 5 minutes), and whether to return to the previous scene or a chosen one.
7. Optional: limit breaks to certain platforms or scenes, and edit the chat messages and sounds.
8. Approve **Scene Controller**, turn on **Enable Stream Break & End Guard**, save, and restart StreamBridge if asked.
9. Run the overlay preview offline, then try one short private test stream before relying on automatic scene changes. Test events never switch real scenes.

## Good to know
- Automatic breaks: a one-hour stream breaks at 30 minutes; streams of two hours or longer break every hour.
- The guard only runs after a real go-live signal. The end limit always wins, so a break that would overlap the end warning is skipped.
- With **Scenes that allow breaks** set, reminders are hidden and due breaks are skipped on other scenes. An empty list allows every scene.
- Chat gets one message when a break warning or the end warning starts (on by default). A sound plays then and again 10 seconds before.
- Pausing automation freezes all timers, so resuming never forces an instant scene switch.
- Opening your ending scene yourself also hands off to the ending sequence. The broadcast keeps running for your raid or manual ending.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Stream Break & End Guard`

- `THSV Extension - Stream Break & End Guard - Scene Controller` in `THSV Extension - Stream Break & End Guard`
- `THSV Extension - Stream Break & End Guard - Pause Automation` in `THSV Extension - Stream Break & End Guard`
- `THSV Extension - Stream Break & End Guard - Resume Automation` in `THSV Extension - Stream Break & End Guard`
- `THSV Extension - Stream Break & End Guard - Toggle Pause` in `THSV Extension - Stream Break & End Guard`

Scene Controller must remain triggerless. StreamBridge supplies a one-use broker token plus one exact provider, connection index, and wizard-selected scene name.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.stream-session-guard` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Stream Break & End Guard |  | Off |
| Broadcast app |  | `obs` |
| Streamer.bot connection number | Use 0 for the first OBS or Streamlabs connection. Meld also accepts 0 for its first saved connection. | 0 |
| Schedule wellness breaks |  | On |
| Break schedule |  | `automatic` |
| Manual break interval (minutes) | Used only for a manual schedule. Automatic scheduling uses half of streams under two hours, capped at one break per hour for longer streams. | 60 |
| Warning time (minutes) |  | 5 |
| Break length (minutes) |  | 5 |
| Break scene | Choose the exact scene to show when the break begins. role:break uses the Break scene you chose under Add-ons > Scene roles. | `role:break` |
| After the break |  | `previous` |
| Return scene | Used only when After the break is set to a selected scene. | (blank) |
| Limit total stream length |  | On |
| Maximum stream length (minutes) |  | 240 |
| Ending scene | Used for automatic ending. Opening this scene manually also hands off to your configured ending sequence. role:ending uses the Ending scene you chose under Add-ons > Scene roles. | `role:ending` |
| Show countdown reminders on the extension overlay |  | On |
| Font style |  | `broadcast` |
| Background style |  | `glass` |
| Background color |  | `#101722` |
| Background opacity |  | 0.92 |
| Accent color |  | `#f4c95d` |
| Timer color |  | `#ffffff` |
| Secondary text color |  | `#d9e2ef` |
| Warning color |  | `#f4c95d` |
| Final minute color |  | `#ff6b7d` |
| Border color |  | `#f4c95d` |
| Channels that allow automatic breaks | Select the platforms that can activate the break schedule. No selections disables automatic breaks. Scene changes apply to the shared broadcast layout. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Scenes that allow breaks and reminders | Choose exact scene names. An empty list allows every scene. Outside these scenes, reminders are hidden and due breaks are skipped; an active break still returns after its saved duration. | (none) |
| Five-minute warning scene | Switch here when the end warning begins. Leave empty to keep the current scene. | (blank) |
| At the end of the countdown |  | `automatic` |
| Announce breaks and the stream end in chat | Posts once in every live chat when a break warning or the end warning starts. | On |
| Break announcement | Placeholders: {breakMinutes} (break length) and {warningMinutes} (time until the break). | `Heads up! A mandatory {breakMinutes}-minute wellness break starts in {warningMinutes} minutes. We will be right back!` |
| Stream end announcement | Sent only when Limit total stream length is on. Placeholder: {warningMinutes}. | `Heads up! The stream wraps up in {warningMinutes} minutes. Thank you for hanging out!` |
| Play a sound when a countdown starts and near the end | Plays on the extension overlay, so that browser source must be in the scene. | On |
| Sound |  | `soft-chime` |
| Sound volume |  | 0.6 |
| Second sound plays this many seconds before |  | 10 |
| Heads-up before switching to the warning scene (seconds) | When the end warning starts, the countdown, chat notice and sound appear on your current scene first. The five-minute warning scene follows after this many seconds. 0 switches immediately. | 30 |

## Health checks

- **thsv.stream-session-guard.runtime:** Confirms persisted live timing, bounded warnings, and guarded scene-switch dispatch.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `overlay.publish`, `schedule.bounded`, `state.private`, `chat.send`.

Private storage: `data/addons/thsv.stream-session-guard/`, `data/addons/.state/thsv.stream-session-guard/`.

Dependencies: none.

## Remove or repair

1. Disable the extension. Its small local schedule audit remains preserved unless extension data is explicitly deleted.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
