# THSV StreamBridge - Clip Courier

1. Import the Clip Courier `.sb` package. It creates **Create Clip**, **Deliver**, and a disabled Twitch-only `!clip` command.
2. Open **Create Clip**. Set `clipCourierDurationSeconds` to `30` or `60`, Save and Compile, then review and enable the imported `!clip` command. Keep its imported command trigger attached.
3. Open **Deliver** and replace `clipCourierWebhookUrl` with a private Discord webhook created for the text channel or forum selected in the wizard.
4. Save and Compile Deliver. Keep it enabled and triggerless. Never paste the webhook into StreamBridge settings, exports, logs, or support messages.
5. Approve only Deliver in the wizard, enable Clip Courier, and restart StreamBridge. Automatic current-stream discovery is optional; `!clip` does not require it.

Deliver waits for a confirmed Discord response, disables mentions, applies bounded HTTP 429 retries, and returns only bounded message or thread IDs. The webhook remains in Streamer.bot.
