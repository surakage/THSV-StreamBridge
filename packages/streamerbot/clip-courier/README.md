# THSV StreamBridge - Clip Courier

1. Import the Clip Courier `.sb` package. It creates only the triggerless **Create Clip** and **Deliver** helpers. The existing Twitch intake owns `!clip` automatically.
2. Open **Create Clip**. Set `clipCourierDurationSeconds` to `30` or `60`, then Save and Compile. Do not attach a command or chat trigger.
3. Open **Deliver** and replace `clipCourierWebhookUrl` with a private Discord webhook created for the text channel or forum selected in the wizard.
4. Save and Compile Deliver. Keep it enabled and triggerless. Never paste the webhook into StreamBridge settings, exports, logs, or support messages.
5. Approve Create Clip and Deliver in the wizard, enable Clip Courier, and restart StreamBridge. Automatic current-stream discovery is optional; `!clip` does not require it.

Deliver waits for a confirmed Discord response, disables mentions, applies bounded HTTP 429 retries, and returns only bounded message or thread IDs. The webhook remains in Streamer.bot.
