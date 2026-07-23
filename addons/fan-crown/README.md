# Fan Crown

Fan Crown turns one Streamer.bot-owned Twitch Channel Points reward into a rotating, increasingly valuable crown.

- The current holder cannot immediately reclaim it by default.
- The actual reward cost paid becomes the viewer's monthly score.
- Rankings use total points, then captures, longest reign, and earliest score.
- Fixed-increase and bounded multiplier pricing are supported.
- The crown may persist across streams or reset whenever Twitch goes live.
- Monthly rollover closes the active reign, archives one winner, resets the crown and cost, and optionally announces the winner.
- Invalid, concurrent, simulated, unverified, or disallowed claims never become leaderboard captures.

## Install

1. Import `THSV-StreamBridge-Fan-Crown-1.0.0.sb` into Streamer.bot.
2. Leave `THSV Addon - Fan Crown - Controller` triggerless.
3. Ensure the existing `THSV Twitch - Intake` action has Twitch Reward Redemption set to Any Reward.
4. Install `thsv.fan-crown-1.0.0.thsv-addon` through the StreamBridge wizard.
5. Inspect Streamer.bot, approve only the Fan Crown Controller action, and paste the Streamer.bot-owned reward ID into Fan Crown settings.
6. Make the Twitch reward's initial title and price match the configured base title and base cost.

The optional Reset Crown and Reset Month actions emit tightly scoped local control events. They do not edit files or rewards directly.
