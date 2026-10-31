# Village Hydration Station

Village Hydration Station gives you friendly reminders to take a sip of water while you are live. A small overlay shows the reminder and when the next one is due. Viewers can send you a reminder too, and you tap a button or type `!water sip` when you drink, which restarts the reminder clock.

## What you need
- A browser source for the overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-hydration-station`). Size it 520 x 620 for a compact card, or 1920 x 1080 for full canvas.
- The Village Hydration Station Streamer.bot package. It creates **THSV Addon - Village Hydration Station - Log Water**, **Undo**, **Snooze**, **Reset**, **Preview Reminder** and **Speak**. Attach Log Water, Undo, Snooze and Reset only to your own Stream Deck buttons or hotkeys. Keep Preview Reminder and Speak triggerless.
- Optional: Twitch and Kick "Hydrate" channel point rewards. Paste the reward IDs into the wizard. YouTube and TikTok viewers use `!hydrate` instead.
- Optional: Speaker.bot, if you want spoken confirmations. Approve **Speak** in the wizard only then.

## Set it up
1. Open Setup Wizard > Extensions, install Village Hydration Station.
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
