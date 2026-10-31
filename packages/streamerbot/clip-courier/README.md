# THSV StreamBridge - Clip Courier

1. Import the Clip Courier `.sb` package. It creates only the triggerless **Create Clip** helper. The existing Twitch intake owns `!clip` automatically.
2. Open **Create Clip**. Set `clipCourierDurationSeconds` to `30` or `60`, then Save and Compile. Do not attach a command or chat trigger.
3. Approve Create Clip in the wizard, choose your Discord webhook in Clip Courier settings, enable Clip Courier, and restart StreamBridge. Automatic current-stream discovery is optional; `!clip` does not require it.

StreamBridge posts the clip to Discord itself, using the webhook you added under **Platforms > Discord webhooks**. If you imported an older version, the **Deliver** action is no longer used and can be deleted.
