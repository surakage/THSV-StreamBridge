# Village Hydration Station

**Module:** `thsv.village-hydration-station` · **Version:** `4.0.62` · **Built in (extension)**

Friendly live-only sip reminders with optional one-tap sip acknowledgments and creator-only controls.

Village Hydration Station gives you friendly reminders to take a sip of water while you are live. A small overlay shows the reminder and when the next one is due. Viewers can send you a reminder too, and you tap a button or type `!water sip` when you drink, which restarts the reminder clock.

## What you need
- A browser source for the overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-hydration-station`). Size it 520 x 620 for a compact card, or 1920 x 1080 for full canvas.
- The Village Hydration Station Streamer.bot package. It creates **THSV Addon - Village Hydration Station - Log Water**, **Undo**, **Snooze**, **Reset**, **Preview Reminder** and **Speak**. Attach Log Water, Undo, Snooze and Reset only to your own Stream Deck buttons or hotkeys. Keep Preview Reminder and Speak triggerless.
- Optional: Twitch and Kick "Hydrate" channel point rewards. Paste the reward IDs into the wizard. YouTube and TikTok viewers use `!hydrate` instead.
- Optional: Speaker.bot, if you want spoken confirmations. Approve **Speak** in the wizard only then.

## Set it up
1. Open Setup Wizard > Add-ons, install Village Hydration Station.
2. Pick a hydration style: **Friendly reminders** (default), **Reminders with a sip counter**, or the older volume tracking with a water container and ounce goal.
3. Set the reminder interval (45 minutes by default) and snooze length (10 minutes).
4. Choose when totals reset: daily (default), each stream, or only when you reset.
5. Paste the Twitch and Kick reward IDs if you made rewards, and check the viewer command platforms.
6. Optional: turn on Speaker.bot confirmations and enter a voice alias.
7. Style the overlay and add its URL to an OBS browser source. Send the template preview from the wizard to check the size.
8. Import the Streamer.bot package and attach Log Water to a Stream Deck button or hotkey.
9. Restart StreamBridge. To test offline, run Preview Reminder in Streamer.bot or type `!water remind`.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!hydrate` | Viewers on YouTube and TikTok | Sends you a hydration reminder. |
| `!water` or `!water status` | You (broadcaster only) | Shows the current status. |
| `!water sip` | You (broadcaster only) | Logs one sip and restarts the reminder clock. In volume mode, `!water 8` logs 8 ounces. |
| `!water undo` / `snooze` / `reset` | You (broadcaster only) | Removes the last sip, snoozes the next reminder, or resets the total. |
| `!water remind` | You (broadcaster only) | Shows a reminder now. |

## Good to know
- Automatic reminders only run while you are live.
- Viewer reminders have a 10 minute cooldown between all viewers and a 60 minute cooldown per viewer. Viewers can remind you but never add to your sip count.
- In volume mode, Log Water with a blank `hydrationAmount` uses your default serving (8 ounces); set a whole number in that action for a fixed amount. Entries above 64 ounces are refused.
- The ounce goal (64 by default) is a personal display target only, not medical advice.
- Speaker.bot is optional; Streamer.bot Voice Control is not needed.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Hydration Station`

- `THSV Addon - Village Hydration Station - Log Water` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Undo` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Snooze` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Reset` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Preview Reminder` in `THSV Addon - Village Hydration Station`
- `THSV Addon - Village Hydration Station - Speak` in `THSV Addon - Village Hydration Station`

All controls are creator-owned local relays. Speak is triggerless and requires a one-use broker token. Viewer rewards and commands stay on the main THSV intakes.

Creator-selected triggers:

- **logWater:** Attach to a creator-controlled Stream Deck button or hotkey. Blank hydrationAmount uses the wizard's default serving; set a whole number for a dedicated amount.
- **undoSnoozeReset:** Attach only to creator-controlled hotkeys or Stream Deck buttons.
- **previewReminder:** Keep triggerless and run manually while offline to test reminder presentation without speech or state changes to ounces.
- **speak:** Keep triggerless. Approve it in the wizard only when Speaker.bot announcements are enabled.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-hydration-station` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Village Hydration Station |  | On |
| Run automatic reminders while live |  | On |
| Reminder interval (minutes) |  | 45 |
| Snooze duration (minutes) |  | 10 |
| Reset water total |  | `daily` |
| Personal stream goal (ounces) | A personal display target only, not medical advice. | 64 |
| Default button amount (ounces) |  | 8 |
| Largest accepted single entry (ounces) |  | 64 |
| Allow viewer hydration reminders |  | On |
| Twitch Hydrate reward ID |  | (blank) |
| Kick Hydrate reward ID |  | (blank) |
| YouTube and TikTok reminder command |  | `hydrate` |
| Platforms using the reminder command |  | `youtube`, `tiktok` |
| Cooldown between all viewer reminders (minutes) |  | 10 |
| Per-viewer reminder cooldown (minutes) |  | 60 |
| Enable protected creator water command |  | On |
| Creator water command |  | `water` |
| Use Speaker.bot for hydration confirmations |  | Off |
| Speaker.bot voice alias |  | (blank) |
| Automatic reminder wording |  | `Hydration check. Time for a sip of water.` |
| Viewer reminder wording | Token: {viewer} | `{viewer} is reminding you to drink some water.` |
| Water logged confirmation | Tokens: {amount}, {total}, {goal} | `Logged {amount} ounces. You are at {total} of {goal} ounces.` |
| Goal reached confirmation | Tokens: {total}, {goal} | `Hydration goal reached! You logged {total} ounces.` |
| Show hydration reminders |  | On |
| Water container |  | `bottle` |
| Show amounts in optional volume mode |  | On |
| Show next reminder time |  | On |
| Overlay background |  | `glass` |
| Background color |  | `#0b1720` |
| Background opacity |  | 0.9 |
| Water color |  | `#55d6ff` |
| Water highlight |  | `#b8f3ff` |
| Accent color |  | `#7ff5cc` |
| Main text color |  | `#ffffff` |
| Secondary text color |  | `#c9e7ef` |
| Hydration style |  | `reminder` |
| Sip acknowledgment |  | `Nice! A little sip goes a long way.` |

## Health checks

- **thsv.village-hydration-station.runtime:** Confirms live-only scheduling, command or Stream Deck ounce logging, viewer cooldowns, optional Speaker.bot output, and fill-overlay projection.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`, `chat.send`, `streamerbot.run-approved-action`, `schedule.bounded`.

Private storage: `data/addons/thsv.village-hydration-station/`, `data/addons/.state/thsv.village-hydration-station/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves bounded hydration totals and recent entries for recovery.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
