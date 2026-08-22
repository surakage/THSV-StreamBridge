# Ad Break Companion

Ad Break Companion is a Twitch-only display add-on for THSV StreamBridge. One minute before an ad, it fades in a compact countdown. When Twitch reports the ad has started, the same card switches to the ad duration and counts down to zero before fading away.

It does not start, snooze, schedule, or cancel ads. It displays only the timing delivered by Streamer.bot's documented Twitch **Upcoming Ad** and **Ad Run** triggers.

## Setup

1. Install and enable the add-on in the local wizard.
2. Import `THSV-StreamBridge-Ad-Break-Companion-4.0.4.sb` from the add-on ZIP.
3. In Streamer.bot, attach **Twitch > Ads > Upcoming Ad** to **THSV Addon - Ad Break Companion - Upcoming Ad Intake**.
4. Attach **Twitch > Ads > Ad Run** to **THSV Addon - Ad Break Companion - Ad Run Intake**.
5. Keep **Preview Upcoming**, **Preview Active**, and **Clear Display** triggerless. Run both previews manually while sizing the browser source.
6. Add the wizard's Ad Break Companion overlay URL to OBS, Meld, or Streamlabs Desktop. A compact 480 x 180 browser source is recommended; crop or position it rather than stretching it.

## YouTube limitation

Streamer.bot currently exposes YouTube broadcast, chat, membership, and poll triggers, but no YouTube ad timing trigger. Ad Break Companion therefore makes no unsupported YouTube timing claim and does not guess from video playback.

## Privacy and safety

The add-on stores only the current phase, bounded timestamps, ad duration, and snooze count. It sends no chat message and makes no external network request.
