# Ad Break Companion

**Module:** `thsv.ad-break-companion` · **Version:** `4.0.58` · **Built in (extension)**

Shows a compact Twitch upcoming-ad and active-ad countdown without controlling ad playback.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Ad Break Companion`

- `THSV Addon - Ad Break Companion - Upcoming Ad Intake` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Ad Run Intake` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Preview Upcoming` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Preview Active` in `THSV Addon - Ad Break Companion`
- `THSV Addon - Ad Break Companion - Clear Display` in `THSV Addon - Ad Break Companion`

These actions relay bounded Twitch ad timing only. They cannot start, snooze, schedule, or cancel an ad.

Creator-selected triggers:

- Included in the import, do not add again: Twitch > Ads > Upcoming Ad on Upcoming Ad Intake (1 minute before) and Twitch > Ads > Ad Run on Ad Run Intake.
- Leave Preview Upcoming, Preview Active, and Clear Display triggerless.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.ad-break-companion` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Ad Break Companion |  | On |
| Show the warning this many seconds before the ad |  | 60 |
| Wait for the Ad Run signal after zero |  | 15 |
| Show Streamer.bot trigger tests |  | On |
| Upcoming countdown heading |  | `AD BREAK IN` |
| Active ad heading |  | `AD BREAK` |
| Upcoming message |  | `A quick break is coming up` |
| Active ad message |  | `The stream will continue after this break` |
| Background style |  | `glass` |
| Background color |  | `#101722` |
| Background opacity |  | 0.9 |
| Accent color |  | `#f4c95d` |
| Countdown color |  | `#ffffff` |
| Secondary text color |  | `#d9e2ef` |
| Final ten seconds color |  | `#ff6b7d` |
| Border color |  | `#f4c95d` |

## Health checks

- **thsv.ad-break-companion.runtime:** Confirms Twitch ad timing events, bounded scheduling, persistence, and overlay publishing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.ad-break-companion/`, `data/addons/.state/thsv.ad-break-companion/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its small timing state remains unless add-on data is explicitly deleted.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
