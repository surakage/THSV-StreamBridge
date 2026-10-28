# Subathon Timer

**Module:** `thsv.subathon-timer` · **Version:** `4.0.57` · **Optional add-on**

Maintains one bounded multi-platform subathon countdown that decreases over time and increases from selected live events.

Subathon Timer keeps one countdown for your whole stream, across Twitch, YouTube, Kick, TikTok, Streamlabs and Ko-fi. It counts down while you are live, and follows, subs, gifts, raids, likes and (if you choose) donations add time to it. Viewers see the timer on an overlay in your scene.

## What you need
- A browser source for the timer overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.subathon-timer`).
- Optional: the Subathon Timer Streamer.bot package, which creates **THSV Addon - Subathon Timer - Start**, **Pause**, **Resume**, **Reset** and **Add Time**. Attach them to hotkeys, deck buttons or scene triggers if you like. No triggers are attached for you.
- Your platforms connected to StreamBridge, so the timer knows when you go live and offline.

## Set it up
1. Open Setup Wizard > Add-ons, install Subathon Timer and enable it.
2. Pick the platforms that may affect the timer.
3. Set the starting time (60 minutes by default) and the maximum cap (720 minutes by default).
4. Set how many seconds each event adds: follows, subs, YouTube memberships, gifted subs, gifts, raids, TikTok like thresholds, and so on. Set any value to 0 to turn that event off.
5. For donations and purchases, pick your currency and set seconds per whole unit (off by default).
6. Pick the overlay label, font, background, colors and whether to show the progress bar. Check it in the wizard preview.
7. Copy the overlay URL from the wizard into an OBS browser source.
8. Optional: import the Streamer.bot package. To change how much Add Time adds, edit its `subathonSeconds` Set Argument (300 by default); no code edit needed.
9. Optional: turn on the moderator chat commands.
10. Restart StreamBridge. To test offline, run the Add Time action with a small value, then try Start, Pause, Resume and Reset.

## Chat commands
These only work after you turn on "Enable moderator and broadcaster timer control commands".

| Command | Who can use it | What it does |
|---|---|---|
| `!subathon-start` | You and moderators | Starts the timer. |
| `!subathon-pause` | You and moderators | Pauses the timer. |
| `!subathon-resume` | You and moderators | Resumes the timer. |
| `!subathon-reset` | You and moderators | Resets to the starting time. |
| `!subathon-addtime 120` | You and moderators | Adds that many seconds (300 if you leave the number out). |

## Good to know
- The timer starts on its own when you go live and pauses when every selected platform goes offline. A new stream resets it to the starting time unless you turn that off.
- Time never goes above your maximum cap. The overlay turns to warning colors at 15 minutes and critical colors at 5 minutes.
- Bits add up across the stream: each full threshold (100 by default) can add time. TikTok likes work the same way. Hype Train levels count once per level.
- Donations and purchases only count in the one currency you pick; there is no currency conversion. By default they need a verified provider ID to change the timer.
- Streamer.bot test events do not change the timer unless you turn on "Allow Streamer.bot test events".
- The timer survives a StreamBridge restart. It stores only counters, never viewer names, messages or payment details.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Subathon-Timer-4.0.57.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Subathon-Timer-4.0.57.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Subathon-Timer-4.0.57.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Subathon Timer`

- `THSV Addon - Subathon Timer - Start` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Pause` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Resume` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Reset` in `THSV Addon - Subathon Timer`
- `THSV Addon - Subathon Timer - Add Time` in `THSV Addon - Subathon Timer`

These actions publish only a bounded local timer-control envelope. They do not send chat, call external APIs, or run other actions.

Creator-selected triggers:

- Optionally attach these controls to hotkeys, deck buttons, or scene-active/scene-inactive triggers.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.subathon-timer` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Subathon Timer |  | On |
| Platforms that may affect the timer | Choose live platforms plus Streamlabs or Ko-fi if their Streamer.bot integrations should affect the timer. | `twitch`, `youtube`, `kick`, `tiktok`, `streamlabs`, `kofi` |
| Start the timer automatically when a stream goes live |  | On |
| Pause the timer when every selected platform is offline |  | On |
| Reset to the starting time when a new stream session begins |  | On |
| Allow Streamer.bot test events to change the timer | Leave disabled for production. Enable only while deliberately testing timer awards. | Off |
| Enable moderator and broadcaster timer control commands |  | Off |
| Start command |  | `subathon-start` |
| Pause command |  | `subathon-pause` |
| Resume command |  | `subathon-resume` |
| Reset command |  | `subathon-reset` |
| Add-time command |  | `subathon-addtime` |
| Default seconds added when the add-time command gets no argument |  | 300 |
| Starting timer length (minutes) |  | 60 |
| Maximum timer cap (minutes) |  | 720 |
| Seconds added per follow |  | 30 |
| Seconds added per subscription |  | 300 |
| Seconds added per YouTube membership |  | 300 |
| Seconds added per gifted subscription |  | 180 |
| Seconds added per engagement gift unit | Useful for TikTok and other gift-style alerts that expose a positive quantity. | 15 |
| Bits or Power-Up threshold | Bits accumulate for the stream session. Each completed threshold can add time. | 100 |
| Seconds added per completed Bits threshold | Set to 0 to track Bits without changing the timer. | 0 |
| Currency accepted for donation and purchase bonuses | Three-letter currency code. Other currencies are ignored because StreamBridge does not perform currency conversion. | `USD` |
| Require a stable provider ID for financial bonuses | Recommended. Unverified donations and purchases may still display as alerts but cannot alter the timer. | On |
| Seconds per whole donation currency unit | Example: 60 adds one minute per whole USD when the selected currency is USD. Set to 0 to disable. | 0 |
| Seconds per whole purchase currency unit | Applies to Streamlabs merchandise and Ko-fi shop orders. Set to 0 to disable. | 0 |
| Base seconds added for a raid |  | 300 |
| Extra seconds added per raid viewer |  | 5 |
| Minimum raid viewers before the raid bonus applies |  | 1 |
| TikTok-like threshold | A bonus is added only when the total like counter crosses another full threshold. Example: 100 means 100, 200, 300, and so on. | 100 |
| Seconds added per completed like threshold |  | 45 |
| Seconds per new Hype Train level | The same Hype Train level is counted once even when Streamer.bot sends multiple update events. Set to 0 to disable. | 0 |
| Seconds per Twitch Watch Streak event | Set to 0 to track without changing the timer. | 0 |
| Seconds per Modiversary month | Multiplied by the reported month count. Set to 0 to disable. | 0 |
| Publish timer state to the add-on overlay broker |  | On |
| Overlay label |  | `SUBATHON` |
| Overlay font style |  | `display` |
| Overlay background style |  | `glass` |
| Overlay background color |  | `#0b1017` |
| Overlay background opacity |  | 0.88 |
| Accent color |  | `#7ee0ff` |
| Primary text color |  | `#eff7ff` |
| Secondary text color |  | `#dfefff` |
| Warning color |  | `#f0c15a` |
| Critical color |  | `#ff6b7d` |
| Live badge color |  | `#61f2a4` |
| Border color |  | `#85cbff` |
| Show the progress bar |  | On |
| Warning threshold (minutes) |  | 15 |
| Critical threshold (minutes) |  | 5 |

## Health checks

- **thsv.subathon-timer.runtime:** Confirms bounded timer updates, live-state tracking, and per-event bonus handling.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.subathon-timer/`, `data/addons/.state/thsv.subathon-timer/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. The timer state is preserved for a later reinstall unless you explicitly delete add-on data.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
