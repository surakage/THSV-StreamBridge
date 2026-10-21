# Community Analytics

Community Analytics keeps a private, local count of who showed up to each stream and how your community took part: attendance, chat messages, commands and other activity across Twitch, YouTube, Kick, TikTok and Facebook. You see the results in the wizard. Viewers see nothing unless another feature, such as Viewer Spotlight, uses the counts. It is built into StreamBridge, so there is nothing separate to install.

## What you need
- **Viewer Foundation**, set up and working. It tells Community Analytics which accounts belong to the same viewer.
- Your main THSV platform intake actions in Streamer.bot, already working. There is no Community Analytics `.sb` import and no trigger to add.
- Nothing extra.

## Set it up
1. Make sure Viewer Foundation is ready.
2. Open the Setup Wizard and go to the **Community Analytics** page.
3. **Count community activity**: keep it turned on and select the platforms to count. Leave **Count simulated events** off.
4. **Optional participation score**: leave it off unless Viewer Spotlight (or another feature) should show a monthly score or rank.
5. **Advanced: exclusions and storage**: common service bots are already excluded. Add any other accounts to skip, using stable IDs where you can.
6. Save and restart StreamBridge.
7. Check it: chat once in your own stream, then open **Community snapshot**. It shows the current stream, key totals and recent streams. Open **All activity counters** for the full breakdown.

## Good to know
- These are StreamBridge's own local counts, not official platform analytics, and not revenue or payout records.
- No chat text, display names, avatars, money amounts or raw platform data are stored. Bots, system accounts, ignored accounts and test events are skipped.
- A stream session starts with the first Stream Online event and ends when every platform is offline. Activity seen without those events is marked as an approximate session.
- The monthly score uses only sessions, messages and commands, each with a monthly cap. Subs, gifts, Bits, donations and other support never count. Exact rank stays hidden until at least 5 viewers (by default) have a score.
- Privacy tools in the wizard let you export or delete one viewer's data. Deleting removes their record. Finished session totals hold no viewer IDs, so they stay.
- By default it keeps up to 500 viewer records and the last 30 finished sessions. Older records are removed automatically. If the snapshot stays empty, check that Viewer Foundation and the platform intake are healthy.
