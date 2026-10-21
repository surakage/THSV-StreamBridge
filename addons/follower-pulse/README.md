# Follower Pulse

Follower Pulse quietly spots Twitch unfollows. Twitch sends an event when someone follows, but not when someone unfollows, so this add-on compares full follower lists over time. Only you see the results, in a private history panel in the Setup Wizard. Names are never posted to chat, Discord or overlays.

## What you need
- Twitch connected in Streamer.bot as the broadcaster, with the `moderator:read:followers` permission.
- The Follower Pulse Streamer.bot import. It contains **THSV Addon - Follower Pulse - Snapshot Page** (keep it triggerless and approve it for this add-on) and **THSV Addon - Follower Pulse - Reconcile Now** (optional manual check).
- Nothing else. No overlay or rewards are needed.

## Set it up
1. In Streamer.bot, import the Follower Pulse package. Leave **Snapshot Page** with no triggers.
2. Optional: attach **Reconcile Now** to a hotkey or deck button that only you can use.
3. If your Twitch broadcaster login in Streamer.bot does not have `moderator:read:followers`, reconnect the broadcaster account.
4. Open Setup Wizard > Extensions > Community Insights > Follower Pulse. Approve **Snapshot Page** for this add-on.
5. Leave the recommended safety settings (check every 12 hours, 2 complete scans before confirming an unfollow), or adjust them.
6. Turn on **Enable Follower Pulse**, save, and restart StreamBridge if the wizard asks.
7. The first complete scan only creates a silent starting list. Unfollows can show up after later scans. Use **Reconcile Now** to run a check on demand.

## Good to know
- An unfollow is only confirmed after it is missing from 2 complete scans in a row (you can raise this to 3). With the default 12-hour check, expect about a day of delay.
- Failed, partial or unauthorized scans never count as unfollows. The last good list is kept, and failures retry automatically (a missing permission is rechecked every 30 minutes).
- Follower Pulse tracks up to 500 followers. If Twitch reports more than your limit, it stops instead of guessing.
- The wizard panel shows the last attempt, last complete scan, next check and any errors.
- Only Twitch IDs, current names, follow times and recent changes are kept locally, for 90 days by default. Twitch credentials stay inside Streamer.bot.
- Streamer.bot trigger tests and simulated controls are ignored.
