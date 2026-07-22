# Ko-fi Donations add-on

Ko-fi Donations uses Streamer.bot's verified Ko-fi webhook as transport and Ko-fi's stable `messageId` for duplicate suppression. Accepted donations re-enter StreamBridge as `engagement.donation` on platform `kofi`, so they use core validation, durable outbox delivery, retry backoff, dead letters, alert rendering, and structured logs.

Private Ko-fi supporter names and messages are not exposed publicly. The add-on never stores a Ko-fi verification token or payment history. Missing IDs, malformed amounts, and malformed currency codes fail closed.

One accepted donation feeds both presentation surfaces through the existing overlay connection:

- Alerts receives the donation by default. In the wizard, open **Alerts > Ko-fi > Donation** to enable or disable it, preview it, and customize its card, duration, sound, and templates.
- Chat can show a separate Ko-fi activity message. In **Chat Overlay > Chat events**, enable **Ko-fi events**, then select **Ko-fi** under per-platform event messages to edit or disable the donation message and set its character limit.

The two controls are independent. Disabling the Ko-fi chat activity message does not suppress its alert, and neither path opens another Streamer.bot or browser-overlay WebSocket connection.

Live acceptance requires a Ko-fi test webhook after the `.sb` trigger is attached. Streamlabs remains deferred because its documented Streamer.bot Donation variables do not expose a provider-stable event ID.
