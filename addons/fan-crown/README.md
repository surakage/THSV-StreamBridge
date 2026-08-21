# Fan Crown

Fan Crown uses a Twitch reward, a Kick reward, and Viewer Foundation point commands on YouTube and TikTok to create one cross-platform rotating crown.

- The current holder cannot immediately reclaim it by default.
- The actual reward cost paid becomes the viewer's monthly score.
- Rankings use total points, then captures, longest reign, and earliest score.
- Fixed-increase and bounded multiplier pricing are supported.
- The crown may persist across streams or reset whenever Twitch goes live.
- Monthly rollover closes the active reign, archives one winner, resets the crown and cost, and optionally announces the winner.
- Invalid, concurrent, simulated, unverified, or disallowed claims never become leaderboard captures.

## Install

1. Import `THSV-StreamBridge-Fan-Crown-4.0.2.sb` into Streamer.bot.
2. Leave `THSV Addon - Fan Crown - Controller` triggerless.
3. Keep Twitch and Kick Reward Redemption on their existing intake actions.
4. Install Fan Crown and Viewer Foundation through the StreamBridge wizard.
5. Approve only the Fan Crown Controller, paste both native reward IDs, and create the no-response `!fancrown` command for YouTube and TikTok.
6. Make the Twitch reward's initial title and cost match the wizard. Kick uses its actual fixed redemption cost because documented Kick reward mutation methods are unavailable.

Fan Crown supports rewards that either use or skip Twitch's redemption queue. For complete rejected-claim refunds, keep **Redemption Skips Queue** disabled: Twitch auto-fulfills rewards that skip the queue, and an already fulfilled redemption cannot be refunded. Valid crown captures still work in either mode.

Kick captures are accepted directly and count the actual reward cost, but rejected Kick captures cannot be refunded and the Kick title/cost cannot be advanced automatically. YouTube and TikTok spend the displayed current cost from Viewer Foundation and roll it back if the state write fails.

The optional Reset Crown and Reset Month actions emit tightly scoped local control events. They do not edit files or rewards directly.
The controller shows a Streamer.bot success toast only after Twitch confirms that the reward title and base cost were restored.
