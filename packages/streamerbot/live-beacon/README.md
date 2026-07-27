# THSV StreamBridge - Live Beacon

Import the package, replace `REPLACE_WITH_PRIVATE_DISCORD_WEBHOOK_URL` in the Set Argument, Save and Compile, and run a harmless manual test. Then approve only Deliver for Live Beacon in the wizard. Keep Deliver triggerless.

Channel mode posts one confirmed normal-channel message. Forum mode creates one new thread with Discord's `thread_name` contract. The action allows only the creator-configured role mention, performs bounded HTTP 429 retries, never logs the webhook, response body, or notification content, and returns only bounded delivery status/message/thread IDs to StreamBridge.
