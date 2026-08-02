# THSV StreamBridge - Free Game Check

Import the generated `.sb` and keep both actions triggerless. Approve **Refresh** in the wizard. Approve **Discord Deliver** only when Discord posting is enabled, then replace its private `freeGameDiscordWebhookUrl` Set Argument with the desired channel or forum webhook.

Twitch and Kick reward redemptions stay on the existing THSV platform intake actions. YouTube and TikTok use the `!freegames` no-response command created through Command Sync. Do not attach reward or command triggers directly to either imported Free Game Check action.

Refresh calls only GamerPower's bounded public HTTPS endpoint. Discord Deliver accepts only Discord webhook hosts and verified GamerPower links, disables mentions, and never logs its webhook.
