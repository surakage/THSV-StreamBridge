# THSV StreamBridge - Ko-fi Donations

1. Configure Ko-fi in Streamer.bot using its website webhook and Ko-fi verification token.
2. Import `THSV-StreamBridge-KoFi-Donations-1.0.1.sb` and accept the reviewed C# warning.
3. Attach only **Integrations > Ko-Fi > Donation** to `THSV Addon - Ko-fi Donations - Intake`.
4. Install the matching `.thsv-addon`, enable it in the wizard, and restart StreamBridge.

The action rejects events without Ko-fi's stable `messageId`. Amounts are invariant decimal strings; private supporter identity and messages are hidden before the normalized alert is published. The verification token stays in Streamer.bot and is never stored by StreamBridge.
