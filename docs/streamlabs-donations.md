# Streamlabs donations

StreamBridge reuses Streamer.bot's existing Streamlabs connection. It does not request, read, copy, store, log, or export the Streamlabs credential, and it does not open a second Streamlabs WebSocket.

## Setup

1. In Streamer.bot, open **Integrations > Streamlabs**.
2. Complete the connection shown by your installed Streamer.bot version.
3. Enable **Auto Connect** and **Auto Reconnect**.
4. Keep Streamer.bot's WebSocket Server enabled; StreamBridge already uses this connection.
5. Restart StreamBridge after upgrading so its shared subscription includes `Streamlabs.Donation`.
6. In the StreamBridge wizard, open **Alerts > Streamlabs > Donation** to configure the card and preview it.
7. To show donations in the chat activity feed, open **Chat overlay > Chat events**, enable **Streamlabs events**, and edit the Streamlabs donation message.

No Streamer.bot trigger or extra C# intake action is required for Streamlabs donations. The existing `THSV Twitch/YouTube/Kick - Intake` actions are unrelated and should not receive Streamlabs triggers.

## Financial-event safety

Live donations are accepted only when Streamer.bot's WebSocket event preserves a provider-stable `event_id`, `donation_id`, `_id`, or `id`. Missing identities fail closed instead of using the donor, amount, message, or timestamp as a financial fingerprint. Explicit Streamer.bot test events may use an isolated simulated identity and remain marked simulated throughout the pipeline.

Run one Streamlabs donation trigger test after setup and inspect StreamBridge's log. A successful path logs **Native Streamer.bot Streamlabs donation accepted**. A rejection states which stable identity or required money field was missing. This runtime check is still required because Streamer.bot's public WebSocket page does not publish a schema for `Streamlabs.Donation`.

Official references: [Streamer.bot Streamlabs setup](https://docs.streamer.bot/guide/integrations/streamlabs), [Streamer.bot donation trigger variables](https://docs.streamer.bot/api/triggers/integrations/streamlabs/donation/), [Streamer.bot WebSocket event](https://docs.streamer.bot/api/websocket/events/streamlabs/donation), and [Streamlabs Socket API](https://dev.streamlabs.com/docs/socket-api).
