# Village Roll Call

Village Roll Call turns native Twitch and Kick rewards, plus a points command on YouTube and TikTok, into a daily attendance streak and bounded monthly leaderboard.

## Setup

1. Create a Twitch **Village Roll Call: Check In** reward and a matching Kick reward, then copy both stable IDs.
2. Confirm Reward Redemption is attached to `THSV Twitch - Intake` and `THSV Kick - Intake`.
3. Install Viewer Foundation and create the no-response `!checkin` command for YouTube and TikTok through Command Sync.
4. Choose the points cost and calendar time zone, then enable the add-on.
5. Optional: add `/overlay/addons/thsv.village-roll-call` as an OBS, Meld, or Streamlabs browser source and press **Send preview card**.

One platform-qualified viewer can score once per calendar day. The monthly winner is the highest check-in count; ties use the earliest first check-in. Rollover occurs on the first stream-online or valid check-in event in a new month. Kick duplicates cannot be refunded automatically; YouTube and TikTok points are rolled back if saving fails.

The add-on stores only platform-qualified stable IDs, current display names, bounded counters/timestamps, and replay IDs in private atomic StreamBridge state. It has no separate C# import, direct trigger, or hard-coded file path.
