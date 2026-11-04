# Reward Timers

Named countdowns that viewers start with a channel point reward, for example **Streamer muted 5:00** or **No swearing 10:00**. Each running timer shows on stream with the viewer's profile picture, the label, the time left and a bar that empties.

## What you need

- A Twitch or Kick channel point reward for each timer you want viewers to start.

## Set it up

1. Create the rewards on Twitch or Kick, for example "Mute the streamer".
2. Turn on **Enable Reward Timers**. Two example timers are ready: Streamer muted (5 minutes) and No swearing (10 minutes). Change the labels and times, add up to ten timers, and paste each reward's ID (in Streamer.bot, right-click the reward and choose Copy Reward Id). Matching by ID means renaming a reward never breaks its timer. You can also note the reward title for reference; a timer with no ID falls back to the exact title.
3. Choose what happens when a running timer is redeemed again: add its time to what is left (the default) or start it again from the top.
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.reward-timers` as a 1920x1080 browser source in the scenes where the timers should show, then pick a corner and how many timers can show at once.
5. Restart StreamBridge.

No Streamer.bot import is needed: rewards and commands already arrive through the platform intakes.

## Good to know

- A timer with no reward ID or title never starts from a redemption, so nothing happens until you name a reward. Turn a timer off in its row to pause it.
- Moderators and you can type `!timer Streamer muted start`, `!timer Streamer muted stop` or `!timer clear`. You can rename the command or leave it empty for none.
- Optional chat messages when a timer starts and ends. `{name}` is who started it, `{label}` the timer and `{time}` the time left.
- The countdown runs by itself inside OBS. Running timers are saved, so they carry on after StreamBridge restarts, and they come back if OBS reloads the browser source.
- The Control Panel shows what is running, with buttons to start, stop or clear timers.
- Simulated test redemptions never start a timer.
