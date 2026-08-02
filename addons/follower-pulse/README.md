# Follower Pulse

Follower Pulse privately detects delayed Twitch unfollows by comparing complete, bounded Helix follower snapshots. Twitch provides immediate follow events but no unfollow event, so removals require two successful missing snapshots by default.

The first scan is a silent baseline. Partial, failed, changing, oversized, or unauthorized scans preserve the previous baseline and infer nothing. Twitch OAuth credentials remain inside the imported Streamer.bot action and are never returned to StreamBridge.

Simulated reconciliation controls are ignored. A real creator-triggered reconciliation remains bounded, serialized, timeout-protected, and unable to replace the last complete baseline with partial data.
