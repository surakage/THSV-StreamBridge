# THSV StreamBridge - Live Beacon

Import the package, replace `REPLACE_WITH_PRIVATE_DISCORD_WEBHOOK_URL` in Deliver's shared Set Argument, then Save and Compile. Approve only Deliver for Live Beacon in the wizard and keep it triggerless.

The standard import contains one private webhook argument: `liveBeaconWebhookUrl`. Recommended forum setup: create one **Live Notifications** forum, create one webhook assigned to it, store that URL in `liveBeaconWebhookUrl`, choose **Shared webhook is in one forum**, and leave every platform on **Use the shared webhook**. Live Beacon will create or reuse a separate forum post for every platform.

Discord binds each incoming webhook to one parent channel or forum. Separate Twitch, YouTube, Kick, and TikTok destinations therefore require independent webhooks. This advanced layout remains supported by manually adding only the needed Set Argument values to Deliver: `liveBeaconTwitchWebhookUrl`, `liveBeaconYouTubeWebhookUrl`, `liveBeaconKickWebhookUrl`, or `liveBeaconTikTokWebhookUrl`. Most creators should not add them.

Existing posts inside one parent forum need only the shared forum webhook. Copy each post's Discord Channel ID into the matching wizard field. Deliver adds Discord's `thread_id` parameter and posts the live embed into that existing thread. The welcome message remains untouched.

Alternatively choose **Create and manage the four platform posts for me** in the wizard and leave the IDs blank. The first genuine live event creates the matching permanent forum post with its editable welcome content and live embed. StreamBridge stores the confirmed thread ID privately and reuses it for later notifications.

Live Beacon posts one linked Discord embed per platform. Each provider-backed embed shows **Stream title**, **Game / Category**, **Direct link**, and **Started** when those values exist. Channel mode posts the embed to the channel; forum mode creates one post per platform with Discord's `thread_name` contract. The action allows only the creator-configured role mention, performs bounded HTTP 429 retries, never logs the webhook, response body, or notification content, and returns only bounded delivery status/message/thread IDs to StreamBridge.

For TikTok or another platform without a dependable provider start signal, attach exactly one trigger to **Broadcast Started**:

- OBS Studio > Streaming Started
- Streamlabs Desktop > Streaming Started
- Meld Studio > Streaming Started

Select only those fallback platforms in the wizard. TikTok is the recommended default. Do not attach all three broadcast-app triggers unless all three applications genuinely start independent broadcasts.
