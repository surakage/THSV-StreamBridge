# Version 3 first-live checklist

Complete the offline checklist before going live. Record the date, platform, event ID, expected result, actual result, and relevant Streamer.bot Action History entry for every live check. A simulated trigger proves routing only; it is not provider acceptance.

## Before the stream

- [ ] Bridge `/health` is `healthy` and `/ready` is `ready`.
- [ ] Wizard reports Version `3.5.0`, Streamer.bot connected, and only intended platforms/add-ons enabled.
- [ ] Twitch and Kick intake actions contain only the triggers listed in the [trigger matrix](streamerbot-trigger-matrix.md).
- [ ] Core Receiver and downstream processors remain triggerless.
- [ ] Chat and Alerts browser sources connect and show no persistent OFFLINE badge.
- [ ] Custom Counter increments, decrements, resets, survives overlay refresh, and rejects viewer control when moderator/broadcaster permission is required.
- [ ] One queueable overlay waits behind another exclusive overlay; Subathon, Countdown, Custom Counter, statistics, and chat continue independently.
- [ ] The wizard emergency coordination reset clears an intentionally held test lease and does not erase add-on state.
- [ ] Restarting the bridge restores persistent state and does not create duplicate Streamer.bot connections or duplicate deliveries.

## Genuine provider checks

- [ ] One real Twitch chat message arrives once with the correct stable user ID, badges, avatar, and source.
- [ ] One real Kick chat message arrives once with the correct stable user ID and source.
- [ ] One real Twitch follow/subscription/cheer or other intended alert produces exactly one normalized event and one alert.
- [ ] One real Kick follow/subscription/reward event produces exactly one normalized event and uses only the fields Kick supplies.
- [ ] One harmless Twitch custom reward reaches the intended add-on once. If the add-on owns settlement, confirm fulfill/refund behavior in Twitch and Streamer.bot history.
- [ ] One harmless Kick reward reaches the intended add-on once. Confirm that failure messaging does not claim a refund or reward mutation.
- [ ] Disconnect and reconnect each enabled provider once. No duplicate WebSocket, replay storm, or duplicate event appears.

## Coordination and persistence

- [ ] Trigger two incompatible visual/media add-ons. Confirm priority, queue order, timeout recovery, and logs explaining queued/skipped/cancelled status.
- [ ] Run an independent counter or timer while an exclusive add-on owns a visual resource. Confirm it remains active.
- [ ] Refresh every active overlay. Persistent values remain and transient media does not restart endlessly.
- [ ] Restart Streamer.bot. The bridge reconnects without rebuilding settings or re-importing packages.
- [ ] Restart the bridge. The delivery outbox, deduplication, add-on private state, and counter state recover without corruption.

## Emergency procedure

1. In the wizard, open diagnostics and press **Emergency add-on reset**.
2. Confirm the creator-approval prompt. This clears active coordination leases, queued coordination work, cooldowns, and the legacy media slot; it does not delete configuration or add-on state.
3. If output remains stuck, disable the affected add-on, stop its Streamer.bot action, and restart StreamBridge.
4. Preserve logs and the acceptance record. Do not repeatedly fire a financial, reward, moderation, raid, Discord, chat-output, TTS, or scene-changing test while diagnosing it.

## Release decision

Mark a provider path live accepted only after its genuine event is observed end to end. Missing live evidence remains **pending**, not passed. High-impact provider paths without a stable upstream event ID must remain display-only or blocked.
