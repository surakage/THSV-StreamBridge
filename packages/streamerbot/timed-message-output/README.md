# THSV StreamBridge Timed Message Output

This triggerless Streamer.bot action receives either one shared shuffled message, independently
shuffled platform messages from Multi-Timed Actions, or a creator-authored reply from the local
multichat dock. It dispatches the matching message once to each selected platform. Twitch, YouTube,
and Kick use their native Streamer.bot C# chat methods. TikTok uses TikFinity's documented
`sendChatbotMessage` WebSocket broadcast.

**This is the only THSV StreamBridge package that automatically posts messages to your live
channel.** Select only platforms where you intend the configured messages to appear publicly.

Import `THSV-StreamBridge-Timed-Message-Output-4.0.5.sb`, inspect Streamer.bot from the wizard,
then choose **THSV StreamBridge - Send Timed Message** as the timer's execution action. Select
one or more delivery-platform switches. The wizard's **Test saved** operation validates the full
chain but never sends externally because simulated executions are suppressed by this action.

The recommended wizard mode uses one shared message list. One physical line is one complete
message. Each run sends one unused message to every selected platform, and the list is reshuffled
only after every entry has appeared once. The wizard enforces the strictest selected destination
limit before save: Twitch 500, YouTube 200, Kick 500, and TikTok/TikFinity 150 characters.

For TikTok output, enable **Allow Streamer.bot to push messages to TikFinity** in TikFinity's
chatbot settings. Streamer.bot's platform send APIs do not return end-to-end chat acknowledgement,
so `timedMessageDispatchedPlatforms` means the API call completed without throwing; it does not
prove that a platform displayed the message.

Timed messages preserve the historical bot-preferred behavior. The interactive dock explicitly
passes `multiTimedUseBotAccount=false` and `multiTimedAllowAccountFallback=true`, so Twitch,
YouTube, and Kick replies prefer the connected creator account and use the connected bot when the
creator account cannot send. This prevents a locally accepted dock message from disappearing without
a practical delivery attempt.
TikTok uses the sender selected in TikFinity because its relay contract has no equivalent account flag.
