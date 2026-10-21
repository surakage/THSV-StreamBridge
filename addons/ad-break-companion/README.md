# Ad Break Companion

Ad Break Companion shows viewers a small countdown card before and during a Twitch ad break. About one minute before an ad, the card fades in and counts down. When Twitch reports that the ad has started, the same card switches to the ad length and counts down to zero, then fades away. It only displays timing. It never starts, snoozes, schedules or cancels ads.

## What you need
- **Twitch.** This add-on is Twitch-only. Streamer.bot has no YouTube ad timing trigger, so YouTube is not supported.
- The Streamer.bot package for this add-on. Import and approve these actions (group **THSV Addon - Ad Break Companion**):
  - **THSV Addon - Ad Break Companion - Upcoming Ad Intake** (comes with the **Twitch > Ads > Upcoming Ad** trigger, set to 1 minute before)
  - **THSV Addon - Ad Break Companion - Ad Run Intake** (comes with the **Twitch > Ads > Ad Run** trigger)
  - **THSV Addon - Ad Break Companion - Preview Upcoming** (no trigger)
  - **THSV Addon - Ad Break Companion - Preview Active** (no trigger)
  - **THSV Addon - Ad Break Companion - Clear Display** (no trigger)
- A browser source in OBS, Meld or Streamlabs Desktop. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/ad-break`).

## Set it up
1. Open the Setup Wizard and go to **Extensions > Broadcast Director > Ad Break Companion**. Check that **Enable Ad Break Companion** is on (it is by default).
2. Under **Turn it on**, choose how many seconds before the ad the warning appears.
3. Under **Viewer wording**, write short headings and messages for the "upcoming" and "in progress" states.
4. Under **Overlay appearance**, choose the background style and colors. The last ten seconds use the **Final ten seconds color**.
5. Import the add-on's `.sb` file into Streamer.bot. The two Twitch ad triggers are already included, so do not add them again. Leave the three Preview and Clear actions without triggers.
6. Copy the overlay URL from the wizard and add it as a browser source. A compact 480 x 180 source works best. Crop or move it instead of stretching it.
7. Restart StreamBridge if you just enabled the add-on. Then test it offline: in Streamer.bot, run **Preview Upcoming** and then **Preview Active** by hand to size both states. Run **Clear Display** to hide the card again.

## Good to know
- The warning time can be set from 15 to 300 seconds (default 60). The Twitch Upcoming Ad trigger is set to fire 1 minute before the ad, so a longer warning only helps if you change that trigger's timing in Streamer.bot.
- If the countdown reaches zero and Twitch has not confirmed the ad yet, the card shows "STARTING" for a short grace period (default 15 seconds, an advanced setting), then hides.
- The upcoming card also shows how many snoozes Twitch reports you have left. It does not snooze for you.
- **Show Streamer.bot trigger tests** (advanced, on by default) lets the Preview actions show the card. Turn it off to ignore previews.
- The add-on keeps only small timing details (current phase, times, ad length and snooze count). It sends no chat messages and makes no outside network requests.
