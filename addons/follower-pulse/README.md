# Follower Pulse

Follower Pulse privately detects delayed Twitch unfollows by comparing complete, bounded Helix follower snapshots. Twitch provides immediate follow events but no unfollow event, so removals require two successful missing snapshots by default.

The first scan is a silent baseline. Partial, failed, changing, oversized, or unauthorized scans preserve the previous baseline and infer nothing. Twitch OAuth credentials remain inside the imported Streamer.bot action and are never returned to StreamBridge.

Simulated reconciliation controls are ignored. A real creator-triggered reconciliation remains bounded, serialized, timeout-protected, and unable to replace the last complete baseline with partial data.

The authenticated local wizard includes a private history panel with baseline health, scan errors, pending-confirmation count, and retained confirmed changes. Twitch names in that panel are never published to chat, Discord, overlays, or ordinary logs. A full final API page is accepted as complete even if Twitch supplies an otherwise redundant continuation cursor.

Snapshot failures now return to the bridge immediately instead of waiting for the page timeout. Transient Streamer.bot or network failures retry with bounded backoff, missing-scope checks retry every 30 minutes, and the wizard shows the last attempt, last complete scan, next check, and current retry level while preserving the last complete baseline.
