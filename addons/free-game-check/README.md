# Free Game Check

Discovers newly listed PC and console giveaways from the public GamerPower feed. It can post the list to Discord, then answer viewer requests with a short source-chat message that directs them to that Discord list. It is disabled by default, requires no API key, performs at most one scheduled lookup per configured interval, and stores only bounded giveaway IDs, request cooldowns, and delivery status.

Import the bundled Streamer.bot package and leave both actions triggerless. Approve **Refresh** in the wizard. If you enable Discord delivery, also approve **Discord Deliver** and replace its private `freeGameDiscordWebhookUrl` Set Argument with your Discord channel or forum webhook.

Viewer access uses the shared intake path:

- Twitch: create a Free Games channel reward and paste its stable reward ID.
- Kick: create a Free Games channel reward and paste its stable reward ID.
- YouTube and TikTok: create the configured no-response `!freegames` command through Command Sync.

Add a valid Discord invite, customize the guide wording, then enable the add-on. Requests reply only to their source platform and are protected by a bounded per-viewer cooldown. Automatic full-link chat announcements remain independently optional. This is discovery assistance, not a guarantee that a promotion remains available in every region.

Refresh calls only the fixed GamerPower HTTPS endpoint with a bounded response size and neutral major-version user agent; it cannot accept an arbitrary URL or creator secret. Discord Deliver accepts only Discord webhook hosts and verified GamerPower links, disables mentions, uses bounded retries, and never returns or logs the webhook.
