# THSV StreamBridge - Live Beacon

You only need this import for TikTok or another platform without a dependable "went live" event. StreamBridge posts the Discord notifications itself, using the webhooks you added under **Platforms > Discord webhooks**.

Import the package and attach exactly one trigger to **Broadcast Started**:

- OBS Studio > Streaming Started
- Streamlabs Desktop > Streaming Started
- Meld Studio > Streaming Started

Select only those fallback platforms in the wizard. TikTok is the recommended default. Do not attach all three broadcast-app triggers unless all three applications genuinely start independent broadcasts.

If you imported an older version, the **Deliver** action and its webhook argument are no longer used. You can delete that action from Streamer.bot and remove its approval in the wizard.
