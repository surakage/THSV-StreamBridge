# First Five

First Five turns five Streamer.bot-owned Twitch channel-point rewards into one sequential per-stream placement chain.

- One viewer may claim only one of the five placements per stream.
- A successful claim changes that reward to `{name} was {ordinal}`, disables it, fulfills the redemption, and enables the next placement.
- A repeated or out-of-order claim is canceled and refunded.
- Placement points accumulate monthly: 5, 4, 3, 2, and 1 points.
- The monthly winner is ranked by points, then first-place wins, then earliest score.
- Stream placements reset on a verified Twitch `stream.online` event. Monthly scores roll over lazily on the first event of a new local-calendar month.

Import `packages/streamerbot/first-five/THSV-StreamBridge-First-Five-2.4.0.sb`. Keep **THSV Addon - First Five - Controller** triggerless and approve only that stable action ID for this add-on. The optional Reset action may be attached to a deck button or hotkey.

The add-on uses one atomic private state record. It does not use SlothCoins, hard-coded filesystem paths, or separate leaderboard files.
