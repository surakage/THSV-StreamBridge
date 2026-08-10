# THSV StreamBridge - Free Game Check

Import the generated `.sb` and keep all three actions triggerless:

- **Refresh** performs one fixed GamerPower lookup after a matching viewer request.
- **Discord Deliver** posts a newly discovered game when Discord delivery is enabled. Keep its webhook private.
- **Settle Twitch Reward** fulfills successful Twitch checks and refunds empty or failed checks.

Twitch and Kick reward redemptions stay on the existing THSV platform intake actions. YouTube and TikTok use the automatically registered `!freegames` command and Viewer Foundation points. Do not attach reward or command triggers directly to these imported actions.

Kick starts a lookup but cannot currently be fulfilled or refunded through Streamer.bot's documented action API. YouTube and TikTok point refunds are handled inside StreamBridge.
