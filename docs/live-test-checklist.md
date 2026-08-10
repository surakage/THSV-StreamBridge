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
- [ ] One real native Twitch or YouTube emote renders inline; a failed image remains readable as its original code.
- [ ] One enabled third-party emote renders on each intended platform: BTTV on Twitch/YouTube, FFZ on Twitch, or 7TV on Twitch/YouTube/Kick. A platform without a channel catalog continues showing normal chat without errors.
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

## Live acceptance record — August 9, 2026

This stream exposed one startup failure and several downstream effects. Preserve the Streamer.bot and StreamBridge daily logs for this date until every item below is repaired and repeated with a genuine provider event.

| Area | Live evidence | Result | Follow-up required |
| --- | --- | --- | --- |
| Bridge lifecycle | Streamer.bot ran `THSV StreamBridge - Launch Bridge` at 10:19:07 AM; the launcher returned exit code 1 after about 11 seconds. Manual recovery reached healthy/ready at 10:30:02 AM. | **Failed** | Make startup idempotent for an already healthy process, safely replace an unresponsive process, retry once after stale runtime cleanup, and retain the detailed launcher error. |
| Countdown | `THSV Addon - Stream Launch Countdown - Start` was enabled with zero triggers. Under the repaired 3.5.0 contract this is expected because StreamBridge follows normalized program-scene changes directly. | **Reclassified; genuine retest pending** | Keep Start and Stop free of OBS scene triggers. Verify the configured exact program scene starts once, Studio Mode preview changes do not restart it, and leaving the program scene follows the saved stop behavior. |
| Ad Break Companion | Genuine Twitch upcoming-ad and ad-start events arrived while StreamBridge was offline. | **Pending retest** | Do not replay an expired ad. Repeat on the next genuine Twitch ad after lifecycle recovery. |
| First Five | Rahfal's genuine first-place redemption was processed, persisted, and announced in Twitch chat. The overlay was not visible in the active OBS program layout. | **State passed; overlay failed** | Verify the First Five browser source is active through the shared nested overlay scene, then repeat with the next valid placement. |
| Village Hydration Station | Genuine Twitch reward `931674e6-eaa1-4013-8b89-eabb819cfba8` matched configuration, but the module ignored it because the late-started bridge had missed `stream.online` and its in-memory live-platform set was empty. | **Failed** | Reconcile current provider live state after late startup without fabricating a new stream cycle or resetting stream-scoped state. |
| Village Roll Call | Rahfal's genuine redemption was persisted and announced, but the overlay publication waited behind First Five and the module exceeded the five-second event-handler limit. | **State passed; overlay failed** | Queue acceptance must finish within the handler budget even when visual dispatch waits longer. |
| Viewer Spotlight | Genuine redemption `24f46f0e-fb64-4cfa-acee-a248e4dcfe37` entered the queue, exceeded the five-second handler limit, then its continuing settlement/state operations were denied. The Twitch redemption remained unfulfilled. | **Failed** | Refund this redemption manually; make queued execution and settlement retain valid capability scope and complete exactly once. |
| Shared overlay placement | Diagnostics reported one connected add-on overlay browser client while multiple redeemed add-ons required rendering. | **Failed** | Put the shared/nested THSV overlay scene in every broadcast scene and confirm all required browser sources remain active without allowing Countdown, ads, or clips to block one another. |
| Core Alerts | Genuine TikTok 100-like and 200-like milestones were accepted and projected, but the active OBS Alerts browser source remained pixel-identical when the alerts fired. A cache-busted source refresh plus disabling **Refresh browser when scene becomes active** restored rendering; an exact TikTok milestone preview changed the captured OBS source from a transparent 2,838-byte PNG to a rendered 50,894-byte PNG. | **Recovered; genuine retest pending** | Keep `[B] Alerts` at `http://127.0.0.1:8787/overlay/alerts?obs=20260809-1`, with shutdown-when-hidden and refresh-on-activation disabled. Confirm the next genuine follow, gift, subscription, or like milestone appears once with sound. |
| Random Clip Player on BRB and Stream Ending | Streamer.bot returned signed MP4 URLs from the new exact host `d1ndex63qxojbr.cloudfront.net`; the cache now accepts only that additional Twitch host and produced complete H.264/AAC files with valid timestamps and frame counts. Direct local-HTTP playback, a longer buffering recovery window, and a forced canvas repaint were each verified in browser tests, but the live OBS 32.2.1 browser source still froze decoded frames and advanced only when its duration watchdog expired. | **Failed in live OBS browser decoder** | Disable or hide the browser clip source for the current stream. Replace browser-based video decoding with a creator-configurable OBS Media Source controlled by Streamer.bot/OBS, while retaining the browser layer only for title/frame presentation. Retest both BRB and Stream Ending after the stream. |
