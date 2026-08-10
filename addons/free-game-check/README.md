# Free Game Check

Free Game Check performs one bounded GamerPower lookup only after a valid viewer request. It has no periodic timer and never posts to chat merely because the Bridge started or refreshed.

Viewer access uses the shared intake path:

- Twitch: a pending Free Games channel reward. A successful lookup is fulfilled; an empty or failed lookup is refunded.
- Kick: a Free Games channel reward. Kick starts the lookup, but Streamer.bot does not currently expose equivalent automatic reward settlement.
- YouTube and TikTok: the configured command spends Viewer Foundation points. Empty or failed lookups refund those points with an idempotent rollback.

When current giveaways exist, only the requester's live source chat receives the short Discord guide. Newly discovered games can also be added to Discord through the approved Discord Deliver action. When no games exist, the source chat receives the configurable no-games response and every supported payment path is refunded.

Import the bundled Streamer.bot package and keep **Refresh**, **Discord Deliver**, and **Settle Twitch Reward** triggerless. Approve Refresh, approve Settle Twitch Reward for Twitch, and approve Discord Deliver only when Discord posting is enabled. The THSV invite defaults to `https://discord.gg/PKHzdhppMu`.

Refresh calls only the fixed GamerPower HTTPS endpoint with a bounded response size. Discord Deliver accepts only Discord webhook hosts and verified GamerPower links, disables mentions, and never returns or logs its webhook.
