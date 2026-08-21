# StreamBridge live acceptance checklist

Accepted checks show their next periodic recheck date in the Wizard and turn amber 14 days before it arrives. Startup, overlay placement, provider reconnect, and persistence checks repeat every 90 days; provider-event and feature-specific checks repeat every 180 days. A relevant build, provider-adapter contract, or settings change can require an earlier recheck.

Use this checklist for the release currently shown in the Setup Wizard. Complete the offline checks before going live. A simulated trigger proves routing only; genuine provider acceptance requires a real upstream event.

For every genuine check, record the date, platform, upstream event ID, expected result, actual result, and relevant Streamer.bot Action History entry.

## Before the stream

- [ ] `/health` reports `healthy` and `/ready` reports `ready` with no blockers.
- [ ] The Wizard shows the expected release, Streamer.bot connected, and only intended platforms and add-ons enabled.
- [ ] **Build fingerprint & provenance** matches the package under test; record the short build fingerprint with the release evidence.
- [ ] The latest startup report reached `complete`; investigate any crash-loop cooldown or readiness recovery instruction before continuing.
- [ ] The startup run ID is consistent across Start All, Streamer.bot, and StreamBridge history entries.
- [ ] Twitch and Kick intake actions contain only the triggers in the [trigger matrix](streamerbot-trigger-matrix.md).
- [ ] Core Receiver and downstream processors remain triggerless.
- [ ] Chat, Alerts, and the shared add-on overlay connect without a persistent **OFFLINE** badge.
- [ ] **Expected OBS sources by scene** lists every required surface and reports the correct visible count in each exact program scene, or the manual host checklist is complete when OBS visibility reporting is unavailable.
- [ ] The shared/nested THSV overlay scene is present in every intended broadcast scene.
- [ ] Custom Counter increments, decrements, resets, survives refresh, and enforces moderator/broadcaster permissions.
- [ ] An exclusive overlay queues behind another exclusive overlay while independent counters, timers, statistics, and chat continue.
- [ ] **Emergency add-on reset** clears a deliberately held test lease without erasing configuration or persistent add-on state.
- [ ] Restarting StreamBridge restores persistent state without duplicate Streamer.bot connections or deliveries.

## Genuine provider checks

- [ ] A real Twitch chat message arrives once with the correct stable user ID, badges, avatar, and source.
- [ ] A real Kick chat message arrives once with the correct stable user ID and source.
- [ ] A native Twitch or YouTube emote renders inline; an unavailable image remains readable as its original code.
- [ ] One enabled third-party emote renders on each intended platform. A platform without a channel catalog continues normally.
- [ ] A real Twitch follow, subscription, cheer, or other intended alert creates exactly one normalized event and one alert.
- [ ] A real Kick follow, subscription, or reward creates exactly one normalized event using only fields Kick supplies.
- [ ] A harmless Twitch custom reward reaches its intended add-on once. If that add-on owns settlement, verify fulfill/refund behavior in Twitch and Streamer.bot history.
- [ ] A harmless Kick reward reaches its intended add-on once. Failure messaging must not claim a refund or reward mutation.
- [ ] Disconnect and reconnect each enabled provider once. No duplicate socket, replay storm, or duplicate event appears.

## Coordination and persistence

- [ ] Trigger two incompatible visual/media add-ons and confirm priority, queue order, timeout recovery, and explanatory logs.
- [ ] Run an independent counter or timer while an exclusive add-on owns a visual resource; it remains active.
- [ ] Refresh every active overlay. Persistent values remain and transient media does not restart endlessly.
- [ ] Restart Streamer.bot. StreamBridge reconnects without rebuilding settings or re-importing packages.
- [ ] Restart StreamBridge. The outbox, deduplication state, add-on private state, and counter state recover without corruption.

## Open genuine retests from August 9, 2026

The original incident evidence is preserved in the August 9 Streamer.bot and StreamBridge logs. This table contains only the remaining acceptance work; code or simulated-test success is not treated as live acceptance.

| Area | Current state | Next genuine check |
| --- | --- | --- |
| Bridge startup | **Code verified; live retest pending** | Start while healthy, start after an unresponsive recorded process, and exercise one recoverable early failure. Confirm visible progress, one safe retry, and a final report with no readiness blockers. |
| Countdown | **Genuine retest pending** | Enter the exact configured program scene once. Confirm Studio Mode preview changes do not restart it and leaving the program scene follows the saved stop behavior. Keep its Streamer.bot Start and Stop actions triggerless. |
| Ad Break Companion | **Genuine retest pending** | Observe the next genuine Twitch upcoming-ad and ad-start sequence after StreamBridge is ready. Do not replay an expired ad. |
| First Five | **State accepted; overlay retest pending** | Confirm its browser source is active through the shared nested overlay scene, then observe the next valid placement. |
| Village Hydration Station | **Code verified; genuine retest pending** | Start StreamBridge after the stream is already live, redeem the exact configured hydration reward once, and confirm rendering and speech without resetting another live add-on. |
| Village Roll Call | **State accepted; overlay retest pending** | Redeem once while another visual owns the queue. Confirm acceptance finishes within the handler budget and the overlay publishes later exactly once. |
| Viewer Spotlight | **Failed redemption requires follow-up** | Confirm redemption `24f46f0e-fb64-4cfa-acee-a248e4dcfe37` was manually refunded. Then retest queued execution and settlement exactly once. |
| Shared overlay placement | **OBS layout retest pending** | Confirm the shared/nested overlay scene is active in every broadcast scene and that Countdown, ads, or clips do not block unrelated add-ons. |
| Core Alerts | **Recovered; genuine retest pending** | Keep `[B] Alerts` at `http://127.0.0.1:8787/overlay/alerts?obs=20260809-1`, with shutdown-when-hidden and refresh-on-activation disabled. Confirm the next genuine alert appears once with sound. |
| Random Clip Player | **Live OBS decoder issue remains** | Keep the browser clip source hidden or disabled. Retest BRB and Stream Ending only after playback moves to a creator-configurable OBS Media Source; retain the browser layer for framing and title presentation. |

## Emergency procedure

1. In Wizard diagnostics, select **Emergency add-on reset**.
2. Confirm creator approval. This clears coordination leases, queued coordination work, cooldowns, and the legacy media slot; it does not delete configuration or persistent add-on state.
3. If output remains stuck, disable the affected add-on, stop its Streamer.bot action, and restart StreamBridge.
4. Preserve the logs and acceptance record. Do not repeatedly trigger financial, reward, moderation, raid, Discord, chat-output, TTS, or scene-changing actions while diagnosing the issue.

## Release decision

Accept a provider path only after observing its genuine event end to end. Missing live evidence remains **pending**, never passed. Keep high-impact paths without a stable upstream event ID display-only or blocked.

If the Wizard changes an accepted item to **Recheck required**, do not carry the old acceptance forward. Record which build, provider-adapter contract, trigger catalogue, configuration, or relevant add-on version changed and repeat that item against the current fingerprint.
