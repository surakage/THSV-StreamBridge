# StreamElements tips

StreamBridge reuses Streamer.bot's own StreamElements connection. It does not request, read, copy, store, log, or export your StreamElements token, and it does not open a second StreamElements connection.

## Setup

1. In Streamer.bot, open **Integrations > StreamElements**.
2. Paste your StreamElements **JWT token** there (StreamElements dashboard > your profile > **Channels** > **Show secrets**) and connect. The token stays in Streamer.bot.
3. Enable **Auto Connect**.
4. Keep Streamer.bot's WebSocket Server enabled; StreamBridge already uses this connection.
5. Restart StreamBridge after upgrading so its shared subscription includes `StreamElements.Tip`.
6. In the StreamBridge wizard, open **Alerts > StreamElements > Donation** to configure the tip card and preview it.
7. To show tips in the chat activity feed, open **Chat overlay > Chat events**, enable **StreamElements events**, and edit the StreamElements tip message.

No Streamer.bot trigger or extra C# action is required. Tips then work everywhere other donations do: alerts, the chat activity feed, Goal Bars and Scoreboard tips, End Credits supporters, Stream Labels "Latest support", Subathon Timer, Voice Relay thank-yous and Streamer Punishments. In End Credits, Stream Labels and Subathon Timer, StreamElements is a platform you can untick; a saved list that already had every platform ticked includes it automatically.

## Financial-event safety

Live tips are accepted only when Streamer.bot's WebSocket event carries a StreamElements `tipId`, `_id`, `id`, or `activityId`. A tip without one fails closed instead of being fingerprinted from the donor, amount, message, or time. Test tips (StreamElements' **Emulate** or a Streamer.bot test) get an isolated simulated identity and stay marked simulated throughout.

Send one emulated tip from the StreamElements dashboard after setup and check StreamBridge's log. A successful path logs **Native Streamer.bot StreamElements tip accepted**. A rejection says which identity or money field was missing. Streamer.bot does not publish a schema for the `StreamElements.Tip` WebSocket event, so StreamBridge accepts both its action-variable names (`tipUsername`, `tipAmount`, `tipCurrency`, `tipMessage`) and StreamElements' own activity fields.

Official references: [Streamer.bot StreamElements Tip trigger](https://docs.streamer.bot/api/triggers/integrations/streamelements/tip).
