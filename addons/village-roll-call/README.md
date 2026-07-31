# Village Roll Call

Village Roll Call turns one Streamer.bot-owned Twitch Channel Points reward into a fun daily attendance streak and bounded monthly leaderboard.

## Setup

1. In Streamer.bot, create a Twitch reward named **Daily Check-In**.
2. Enable **Skip Reward Queue** because a daily repeat is harmless and does not need a refund transaction.
3. Copy its stable Reward ID.
4. Confirm **Twitch Reward Redemption (Any Reward)** is already attached to `THSV Twitch - Intake`.
5. Install this add-on, paste the Reward ID, choose the calendar time zone, and enable it.
6. Optional: add `/overlay/addons/thsv.village-roll-call` as an OBS, Meld, or Streamlabs browser source and press **Send preview card**.

One viewer can score once per calendar day. The monthly winner is the highest check-in count; ties use the earliest first check-in. Rollover occurs on the first Twitch stream-online or valid check-in event in a new month.

The add-on stores only stable Twitch user IDs, current display names, bounded counters/timestamps, and replay IDs in private atomic StreamBridge state. It has no separate C# import, direct trigger, hard-coded file path, or artificial currency.
