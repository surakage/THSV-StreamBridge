# THSV StreamBridge - Free Game Check

Import the generated `.sb` and keep both actions triggerless:

- **Refresh** performs one fixed GamerPower lookup after a matching viewer request.
- **Settle Twitch Reward** fulfills successful Twitch checks and refunds empty or failed checks.

Twitch and Kick reward redemptions stay on the existing THSV platform intake actions. YouTube and TikTok use the automatically registered `!freegames` command and Viewer Foundation points. Do not attach reward or command triggers directly to these imported actions.

Kick starts a lookup but cannot currently be fulfilled or refunded through Streamer.bot's documented action API. YouTube and TikTok point refunds are handled inside StreamBridge.

New games are posted to Discord by StreamBridge using the webhook you choose from **Platforms > Discord webhooks**. If you imported an older version, the **Discord Deliver** action is no longer used and can be deleted.
