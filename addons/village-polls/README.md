# Village Polls

Village Polls runs one shared poll across Twitch, YouTube, Kick and TikTok. Native platform polls only count votes from their own platform, so Village Polls keeps one combined total instead. The poll is announced in all four chats, and a compact result board can show the live votes and the winner on stream.

## What you need
- A browser source for the poll board, if you want it on stream. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-polls`).
- Nothing extra in Streamer.bot. Keep your main THSV platform chat actions as they are; do not create separate poll commands or triggers.

## Set it up
1. Open Setup Wizard > Extensions > Village Polls and turn on "Turn on universal cross-platform polls".
2. Keep the default `!` prefix and the `poll` and `vote` command names for the easiest setup.
3. Optional: change the poll length (120 seconds by default, 0 for manual close), the number of choices (6 by default) and how long the result stays (12 seconds).
4. Optional: style the board: compact or full layout, opacity, colors, percentages, vote totals, countdown, platform markers and transition.
5. Save and restart StreamBridge.
6. Add the overlay URL to an OBS browser source.
7. Test: type `!poll open Best snack? | Chips | Popcorn`, vote with `!vote 1`, then `!poll close`. Check the announcement reached each connected chat.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!poll open Question \| Choice 1 \| Choice 2` | You and moderators | Opens a poll and announces it in every chat. |
| `!poll close` | You and moderators | Closes the poll and announces the combined result. |
| `!poll reset` | You and moderators | Clears the poll and hides the board. |
| `!vote 1` | Everyone | Votes for a choice. The confirmation appears in the viewer's own chat. |

## Good to know
- A viewer can change their vote; only their latest choice counts. One poll accepts up to 5,000 voters.
- Viewers have a 3 second cooldown per command; you and moderators skip it.
- The poll closes on its own when the timer ends, and also when every platform goes offline (you can turn that off).
- Choices must be different from each other. The board refreshes at most once per second, so busy polls stay smooth.
- Privacy: account IDs are never stored as-is, only as private hashes plus the platform for the optional platform breakdown.
