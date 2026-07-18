# THSV StreamBridge Timed Message Output

This triggerless Streamer.bot action receives one receiver-validated shuffled message from
Multi-Timed Actions and dispatches it once to every creator-selected platform. Twitch, YouTube,
and Kick use their native Streamer.bot C# chat methods. TikTok uses TikFinity's documented
`sendChatbotMessage` WebSocket broadcast.

Import `THSV-StreamBridge-Timed-Message-Output-1.0.0.sb`, inspect Streamer.bot from the wizard,
then choose **THSV StreamBridge - Send Timed Message** as the timer's execution action. Select
one or more delivery-platform switches. The wizard's **Test saved** operation validates the full
chain but never sends externally because simulated executions are suppressed by this action.

For TikTok output, enable **Allow Streamer.bot to push messages to TikFinity** in TikFinity's
chatbot settings. Streamer.bot's platform send APIs do not return end-to-end chat acknowledgement,
so `timedMessageDispatchedPlatforms` means the API call completed without throwing; it does not
prove that a platform displayed the message.
