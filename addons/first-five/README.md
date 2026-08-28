# First Five

First Five uses five Twitch rewards, five Kick rewards, and one Viewer Foundation points command for YouTube and TikTok to build a cross-platform per-stream placement chain.

- One viewer may claim only one of the five placements per stream.
- A successful claim changes that reward to `{name} was {ordinal}`, disables it, fulfills it when necessary, and enables the next placement.
- A repeated or out-of-order claim is canceled and refunded.
- Placement points accumulate monthly: 5, 4, 3, 2, and 1 points.
- The monthly winner is ranked by points, then first-place wins, then earliest score.
- All five rewards are disabled on verified Twitch `stream.offline`. A verified `stream.online` restores the five available titles, enables only first place, and clears only that stream's placements after Streamer.bot confirms the reset.
- Monthly scores are separate from stream placements and roll over only on the first First Five event in a new local-calendar month.

Keep **Skip Reward Queue disabled** on all five Twitch rewards. First Five can safely accept a valid already-fulfilled redemption, but Twitch cannot refund an already-fulfilled repeat or out-of-order redemption. Kick has no documented enable, disable, rename, fulfill, or refund methods, so all five Kick rewards remain creator-managed and invalid Kick claims cannot be returned.

Import `packages/streamerbot/first-five/THSV-StreamBridge-First-Five-4.0.9.sb`. Keep **THSV Addon - First Five - Controller** triggerless and approve only that stable action ID. Create `!firstfive` with no generated response for YouTube and TikTok. The optional Reset action may be attached to a deck button or hotkey.

The add-on uses one atomic private state record. It does not use SlothCoins, hard-coded filesystem paths, or separate leaderboard files.
