# THSV StreamBridge - Clip Library Cache

This is the one shared Twitch clip lookup used by Clip Courier, Random Clip Player, and future clip tools.

1. Import the `.sb` package.
2. Leave **THSV Addon - Clip Library Cache - Refresh** enabled and triggerless.
3. In the StreamBridge wizard, approve only that Refresh action.
4. Enable Clip Library Cache, save, and restart StreamBridge.

The action uses Streamer.bot's existing Twitch account to return bounded public clip metadata. It does not download videos or expose credentials. It is excluded from Pending and Action History because it is internal maintenance.
