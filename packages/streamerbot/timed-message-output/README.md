# THSV StreamBridge Timed Message Output

This triggerless Streamer.bot action receives either one shared shuffled message or independently
shuffled platform messages from Multi-Timed Actions. It dispatches the matching message once to
each creator-selected platform. Twitch, YouTube,
and Kick use their native Streamer.bot C# chat methods. TikTok uses TikFinity's documented
`sendChatbotMessage` WebSocket broadcast.

**This is the only THSV StreamBridge package that automatically posts messages to your live
channel.** Select only platforms where you intend the configured messages to appear publicly.

Import `THSV-StreamBridge-Timed-Message-Output-1.1.0.sb`, inspect Streamer.bot from the wizard,
then choose **THSV StreamBridge - Send Timed Message** as the timer's execution action. Select
one or more delivery-platform switches. The wizard's **Test saved** operation validates the full
chain but never sends externally because simulated executions are suppressed by this action.

The recommended wizard mode uses explicit message cards and a separate shuffle bag for each
platform. Visual wrapping inside a card does not create another message. Limits are enforced before
save and again before sending: Twitch 500, YouTube 200, Kick 500, and TikTok/TikFinity 150 characters.

For TikTok output, enable **Allow Streamer.bot to push messages to TikFinity** in TikFinity's
chatbot settings. Streamer.bot's platform send APIs do not return end-to-end chat acknowledgement,
so `timedMessageDispatchedPlatforms` means the API call completed without throwing; it does not
prove that a platform displayed the message.
