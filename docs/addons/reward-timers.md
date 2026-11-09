# Reward Timers

**Module:** `thsv.reward-timers` · **Version:** `4.1.67` · **Built in (extension)**

Named countdowns that viewers start with a channel point reward, shown on stream with their picture, the label, the time left and a bar that empties.

Named countdowns that viewers start with a channel point reward, for example **Streamer muted 5:00** or **No swearing 10:00**. Each running timer shows on stream with the viewer's profile picture, the label, the time left and a bar that empties.

## What you need

- A Twitch or Kick channel point reward for each timer you want viewers to start.

## Set it up

1. Create the rewards on Twitch or Kick, for example "Mute the streamer".
2. Turn on **Enable Reward Timers**. Two example timers are ready: Streamer muted (5 minutes) and No swearing (10 minutes). Change the labels and times, add up to ten timers, and paste each reward's Twitch and Kick reward ID (in Streamer.bot, right-click the reward and choose Copy Reward Id). With an ID set, renaming the reward never breaks the timer. You can type the reward title instead; it is used only when no ID is set for that platform, and capital letters do not matter.
3. Choose what happens when a running timer is redeemed again: add its time to what is left (the default) or start it again from the top. Different timers run one at a time by default: a new one waits in line until the current timer ends, then starts with its full time, and the viewer gets a chat message saying how many are ahead. Switch to "Together" to run them side by side.
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.reward-timers` as a 1920x1080 browser source in the scenes where the timers should show, then pick a corner and how many timers can show at once.
5. Restart StreamBridge.

No Streamer.bot import is needed: rewards and commands already arrive through the platform intakes.

## Good to know

- A timer with no reward ID or title never starts from a redemption, so nothing happens until you link a reward. Turn a timer off in its row to pause it.
- Moderators and you can type `!timer Streamer muted start`, `!timer Streamer muted stop` or `!timer clear`. You can rename the command or leave it empty for none.
- Optional chat messages when a timer starts and ends. `{name}` is who started it, `{label}` the timer and `{time}` the time left.
- The countdown runs by itself inside OBS. Running timers are saved, so they carry on after StreamBridge restarts, and they come back if OBS reloads the browser source.
- The Control Panel shows what is running, with buttons to start, stop or clear timers.
- Simulated test redemptions never start a timer.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.reward-timers` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Platforms it works on | Untick a platform to turn this off there. Only platforms you stream on need a tick. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Enable Reward Timers |  | Off |
| Timers | Each row is one timer: on or off, its label, how long it runs (5 seconds to 180 minutes), the reward title, and the Twitch and Kick reward IDs. An ID is matched first, so renaming the reward never breaks the timer; the title is used only when no ID is set for that platform. | `on \| Streamer muted \| 5 \| minutes \|`, `on \| No swearing \| 10 \| minutes \|` |
| When a running timer is redeemed again |  | `add` |
| When different timers are redeemed | One at a time: a new timer waits until the current one ends, then starts with its full time. Together: timers run side by side. | `queue` |
| Moderator command | Moderators and you type !timer <label> start, !timer <label> stop or !timer clear. Leave empty for no command. | `timer` |
| Post in chat when a timer starts |  | On |
| Start message | Placeholders: {name} (who started it), {label}, {time} (time left). | `⏳ {name} started {label} for {time}!` |
| Message when a timer has to wait | Placeholders: {name}, {label}, {time} and {ahead} (how many timers are ahead of it). Sent to the chat it was redeemed in. | `⏳ {name} queued {label}. It starts when the current timer ends ({ahead} ahead).` |
| Post in chat when a timer ends |  | On |
| End message | Placeholders: {name} (who started it), {label}. | `⏰ {label} is over!` |
| Where the timers show |  | `top-right` |
| Most timers on screen at once |  | 4 |
| Show the viewer's profile picture |  | On |
| Bar colour |  | `#7ee0ff` |

## Health checks

- **thsv.reward-timers.runtime:** Confirms reward title matching, added or restarted time, the moderator command, saved end times and the timer overlay.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.reward-timers/`, `data/addons/.state/thsv.reward-timers/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source. Running timers are forgotten.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
