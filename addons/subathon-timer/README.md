# Subathon Timer

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
