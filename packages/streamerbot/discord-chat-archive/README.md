# THSV StreamBridge - Discord Chat Archive

This package contains one action: `THSV Addon - Discord Chat Archive - Deliver`.

## Setup

1. In Discord, create a dedicated private webhook for the channel that should receive the archive.
2. Import `THSV-StreamBridge-Discord-Chat-Archive-2.4.0.sb`.
3. Accept the custom C# warning only after confirming this package came from the official THSV StreamBridge release.
4. Open the imported action.
5. Edit the **Set Argument** named `discordArchiveWebhookUrl` and replace `REPLACE_WITH_DISCORD_WEBHOOK_URL` with the new private webhook URL.
6. Open **Execute C# Code**, confirm the references from `manifest.json`, then select **Save and Compile**.
7. Run the action manually once. With no bridge arguments, it sends a safe setup test containing no viewer data.
8. In the StreamBridge wizard, install Discord Chat Archive, inspect Streamer.bot, approve only this exact action, save settings, restart StreamBridge, and then enable the add-on.

Do not attach Twitch, YouTube, Kick, TikFinity, or other triggers to this action. The add-on receives normalized `chat.message` events through core and dispatches this action through StreamBridge's creator-approved capability broker.

## Security and privacy

- Treat the webhook URL like a password. Anyone holding it can post to that Discord channel.
- The URL remains inside Streamer.bot's Set Argument and is never returned to StreamBridge or included in wizard exports.
- The action accepts live archive content only when StreamBridge supplies a short-lived one-use relay token.
- Discord mentions are neutralized before delivery.
- Public chat waiting for delivery exists only in a bounded in-memory queue. It is not written to local transcript files.
- Discord retains delivered messages under the selected server and channel's policies.

If the webhook was shown in a screenshot, stream, log, or shared import after editing, delete it in Discord and create a new one.

Official references:

- <https://docs.streamer.bot/guide/integrations/discord>
- <https://docs.streamer.bot/api/csharp/methods/integrations/discord/post-text-to-webhook>
- <https://docs.discord.com/developers/resources/webhook>
