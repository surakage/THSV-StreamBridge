# Village Roll Call

Village Roll Call is a daily check-in for your community. Viewers check in once per day, using a channel point reward on Twitch and Kick or a `!checkin` command on YouTube, TikTok and Facebook. Check-ins build a monthly leaderboard, and the top viewer of each month is announced as the winner.

## What you need
- The **Viewer Foundation** extension, enabled. YouTube, TikTok and Facebook check-ins cost StreamBridge points.
- A Twitch check-in channel point reward, created inside Streamer.bot with Skip Reward Queue on, and a matching Kick reward. Paste both reward IDs into the wizard.
- Reward Redemption triggers attached to your main Twitch and Kick intake actions in Streamer.bot (usually already the case).
- Optional: a browser source for the leaderboard card. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-roll-call`).
- No separate Streamer.bot import is needed.

## Set it up
1. Create the Twitch and Kick check-in rewards and copy their reward IDs.
2. Check that Reward Redemption is attached to your Twitch and Kick intake actions in Streamer.bot.
3. Open Setup Wizard > Add-ons > Village Roll Call and paste the reward IDs.
4. Choose the check-in command name (`checkin` by default) and the points cost (25 by default).
5. Optional: set your calendar time zone (for example `America/New_York`); leave it blank to use this PC's time zone.
6. Check the chat messages and the leaderboard card settings.
7. Turn on "Enable Village Roll Call", save and restart StreamBridge.
8. Optional: add the overlay URL to an OBS browser source and press **Send preview card** in the wizard.
9. Test by checking in once from a viewer account; a second check-in the same day should get the "already checked in" reply.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!checkin` | Viewers on YouTube, TikTok and Facebook | Spends points and checks the viewer in for today. |

## Good to know
- Each viewer can check in once per calendar day, counted per platform. A repeat check-in on YouTube, TikTok or Facebook costs no points.
- Kick reward claims cannot be refunded automatically, so a duplicate Kick claim is not given back.
- The monthly winner has the most check-ins; ties go to whoever checked in first. The new month starts at the first stream or check-in in that month.
- After each check-in, a leaderboard card shows the top 5 for 20 seconds (you can change both).
- StreamBridge stores only platform IDs, current display names and check-in counts for this add-on.
