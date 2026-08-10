# THSV StreamBridge - Follower Pulse

Import the `.sb` file, keep **Snapshot Page** triggerless, and approve only that stable action in the Follower Pulse wizard card. **Reconcile Now** is optional and may be attached to a creator-only hotkey or deck button.

The Twitch broadcaster connection must grant `moderator:read:followers`. The action uses Streamer.bot's existing broadcaster credentials only with Twitch's fixed `channels/followers` endpoint. Credentials never leave Streamer.bot.

Snapshot Page relays bounded API failures back to StreamBridge immediately so the wizard can show the problem without waiting for a timeout. StreamBridge retries transient failures with bounded backoff and keeps the last complete baseline intact.
