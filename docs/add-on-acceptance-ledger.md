# Add-on acceptance ledger

Snapshot: August 2, 2026. Current release candidate and installed baseline: `3.5.0`.

This ledger prevents **packaged**, **offline accepted**, and **provider accepted** from being treated as the same claim. A package is production-capable only for the rows and environments whose evidence has actually been recorded.

## Status meanings

- **Automated passed**: source, schemas, package cohesion, failure isolation, and relevant fixtures passed the repository gate.
- **Offline pending**: the add-on still needs the local wizard, Streamer.bot Test trigger, simulator, or private browser-source procedure in [Offline acceptance](offline-acceptance.md).
- **Provider pending**: a genuine provider event, credential, mutation, or delivery result has not been recorded. Simulated events never satisfy this column.
- **Not required**: the feature has no provider-specific side effect for that acceptance surface.

## Published add-ons

| Add-on | Automated | Offline/manual | Genuine provider acceptance still required |
| --- | --- | --- | --- |
| Random Clip Player | Passed | Pending | Twitch clip lookup and complete playback lifecycle in each intended browser host. |
| Automated Shoutouts | Passed | Pending | Twitch first-chat/manual shoutout, optional clip, and each enabled source-routed welcome. |
| Translate | Passed | Pending | Provider timeout, Unicode, attribution, splitting, sustained-chat limits, privacy disclosure, and source-only reply. |
| Ko-fi Donations | Passed | Passed | Streamer.bot Test-trigger routing, stable-ID normalization, simulation marking, and durable delivery are locally accepted. One real Ko-fi test webhook plus stable-ID replay suppression remains provider acceptance. |
| Subathon Timer | Passed | Pending | Real contribution rules, restart recovery, pause/resume, and long-running overlay. |
| Stream Launch Countdown | Passed | Pending | Streamer.bot controls, finish sound, optional approved scene action, and browser-host rendering. |
| Scene Actions | Passed | Pending | OBS, Meld, and Streamlabs scene-name changes plus reconnect behavior. |
| First Five | Passed | Pending | Real Twitch reward enable/update/refund sequence and concurrent redemption serialization. |
| Fan Crown | Passed | Pending | Real Twitch title/cost update, fulfillment/refund rollback, reset, and overlay. |
| Raid Scout | Passed | Pending | Twitch candidate discovery and an explicitly confirmed raid. |
| Quote Vault | Passed | Pending | Cross-platform commands, moderator approval, restart persistence, and source-routed replies. |
| Discord Chat Archive | Passed | Passed | Normal-channel delivery is provider accepted. One session-scoped forum-thread creation and reuse still requires provider acceptance. |
| Stream Labels | Passed | Passed | The retained latest-value projection and cropped OBS rendering are locally accepted. Genuine platform events remain covered by their shared intake/provider rows. |
| Village Roll Call | Passed | Pending | One genuine Twitch reward redemption, daily replay rejection, month rollover, winner announcement, and cropped OBS card. |
| Prize Wheel | Passed | Pending | Cropped hosted-wheel rendering is automated-test accepted. One live moderator command and source-routed result on each selected platform remain pending. |
| Village Draw | Passed | Pending | Verified-package tests cover direct normalized-chat commands, chat/derived-command deduplication, Viewer Foundation identity, free entry, weighted points tickets, pending-purchase lifecycle barriers, multi-platform stream-end handling, delivery warnings, draw receipts, and restart-safe batched refunds. Live chat, overlay, points spend/refund, and winner confirmation remain pending. |
| Village Jukebox | Passed | Pending | The two reviewed triggerless helpers are imported, grouped separately, stable-ID verified, and creator-approved. Private YouTube API resolution, source-routed commands, complete hosted playback, Viewer Foundation spending/refunds, native reward intake, Twitch settlement, queue controls, and music-rights acceptance remain pending. |
| Viewer Foundation | Passed | Pending | Identity link, progression, achievements, digest-locked legacy migration, privacy export/correction/deletion, and consumer isolation. |
| Community Analytics | Passed | Pending | Stream rollover, ignored identities, bounded reports, and deletion propagation. |
| Viewer Spotlight | Passed | Pending | Self/manual/reward card, fade/credits, Stream Score, Discord snapshot, settlement, browser hosts, reconnect, and deletion cleanup. |
| Chat Guard | Passed | Passed | Observe mode is locally accepted. Separately approved warn/delete/timeout/ban operations and abort-rate behavior still require genuine provider evidence. |
| Creator Controls | Passed | Pending | Title/category mutation and result readback on every enabled provider. |
| Category Pilot | Passed | Pending | Windows process matching, debounce, suggest/apply/dismiss, lock, and opt-in automatic mode. |
| Live Beacon | Passed | Pending | Stable stream identity, coalescing, reconnect deduplication, and private Discord delivery. |
| Clip Courier | Passed | Pending | Twitch `!clip` creation and current-stream filtering are automated-test accepted; genuine Twitch creation plus confirmed Discord channel/forum delivery remain pending. |
| Viewer Lobby | Passed | Pending | Join/leave/position, revision conflicts, restart recovery, ordering, and operator controls. |
| Voice Relay | Passed | Passed | Not required — aliases, audible delivery, aggregation, creator controls, and native emergency clearing are locally accepted. |
| Follower Pulse | Passed | Pending | Twitch authorization, first baseline, pagination, two-scan confirmation, and refollow behavior. |
| Clip Library Cache | Passed | Passed | Real Twitch lookup and bounded persistence are locally accepted. A longer observation must still prove Random Clip Player and Clip Courier share steady-state refreshes without duplicate polling. |
| Village Polls | Passed | Pending | One shared cross-platform poll, private hashed voting, platform-limited source replies, result overlay, and restart/stream-end behavior. Custom Counter owns counters; Village Draw owns giveaways. |
| Chat Play Pack | Passed | Pending | Number Guess, creator-authored Trivia, Prediction rounds, anti-replay awards, and source-routed replies. |
| Free Game Check | Passed | Pending | Fixed-provider lookup, silent baseline, deduplication, attribution, and selected-platform announcements. |
| Accessibility Captions | Passed | Pending | Browser-host readability, public-chat consent, bot suppression, bounds, cropping, transparency, and reconnect behavior. |
| Custom Counter | Passed | Passed | The Version 3 package imported locally as a new triggerless eleven-action group. Chat-command permissions, Stream Deck/hotkey binding, custom icon, and long-running OBS presentation remain creator acceptance rather than provider requirements. |

## Current automated and local evidence

- `148` Vitest files and `859` tests pass on Version `3.5.0`.
- `17` Playwright checks pass, including add-on installation/configuration, persisted collapsible UI state, Chat Guard safety controls, overlay presentation, cropped Stream Labels, Village Roll Call, Prize Wheel, Village Draw, Village Jukebox, and the acceptance ledger.
- lint, typecheck, configuration validation, production build, release packaging, and the production dependency audit pass; the audit reports zero known vulnerabilities.
- Thirty-four first-party add-on implementations and all `37` generated Streamer.bot imports are synchronized at `3.5.0`. The portable release, add-on index, all `34` add-on bundles, and `38` archive checksums verify successfully. Stream Labels, Village Roll Call, Prize Wheel, and Village Draw continue to use the shared core intakes and require no extra Streamer.bot import.
- On August 2, the installed bridge reported `healthy`/`ready` after upgrading from `3.0.0` to `3.5.0`. All `34` first-party add-ons were installed, enabled, integrity-verified, and version-aligned. All `39` loaded modules reported healthy, Streamer.bot was connected, the latest startup contained no warnings/errors, all `20` add-on overlay routes returned HTTP 200, and all `23` recommended helper actions were found before exact stable-ID grants were saved for the `18` add-ons that require them.
- Custom Counter's Version 3 import created its eleven reviewed triggerless actions inside the dedicated `THSV Addon - Custom Counter` group. Existing trigger-bearing packages were not blindly overwritten; their Version 3 import files are installed locally for intentional upgrades that preserve or reattach creator trigger bindings using the published trigger matrix.
- Village Jukebox's two reviewed helpers were imported into `THSV Addon - Village Jukebox`, verified by their stable IDs, and granted only to that add-on. A harmless Twitch chat fixture was then accepted and queued through the installed full add-on set without a new warning or error. This closes package installation and grant wiring only; the row remains pending for its resolver, playback, points, and reward paths.
- The July 28 `2.5.0`/20-add-on and earlier August 1 `2.6.0`/33-add-on snapshots remain historical evidence but are superseded by the Version 3 local installation above.
- Disposable Windows lifecycle coverage passed `21` focused installer/package tests plus custom-port start, replacement-start, stale-build rebuilding, active-config shutdown, upgrade data preservation, downgrade/tamper rejection, and conservative uninstall behavior.
- Safe local overlay smoke on July 28 returned HTTP `200` and accepted simulated wizard previews for Automated Shoutouts, Fan Crown, First Five, Raid Scout, Random Clip Player, Stream Launch Countdown, Subathon Timer, and Viewer Spotlight. Their rows remain pending because control/state, Streamer.bot, and genuine-provider behavior was not covered by that visual-only smoke.
- Streamer.bot `1.0.5-beta.2` was inspected directly with `93` actions and separate add-on groups. One harmless Twitch, YouTube, and Kick chat **Test Trigger** per platform reached the installed bridge exactly once as an accepted, non-duplicate, durably queued event. This validates shared native intake routing only and does not change any add-on or provider-acceptance row.
- Voice Relay manual playback passed on July 28 with StreamBridge/Streamer.bot/Speaker.bot connected, `THSV Male` and `THSV Female` backed by Microsoft David and Zira, and `THSV Male` selected in the enabled add-on. Streamer.bot acknowledged one connection phrase and all ten alert-category phrases; the creator confirmed every phrase was audible. Automated coverage proves bounded queue pressure behavior, while the later manual emergency-audio check proves native clearing and interruption.
- Voice Relay's imported Pause, Resume, Stop, and final Resume controls returned `ok` in Streamer.bot and reached StreamBridge as unique, durably queued `addon.thsv.voice-relay.control` events. Automated coverage separately proves pause suppression, resume dispatch, stop clearing, and five-second rapid-cheer aggregation.
- Voice Relay emergency audio acceptance then passed: a long harmless phrase began, native Clear Pending removed the queued marker sentence, and native Stop Speaking interrupted the active phrase. The creator confirmed the interruption and confirmed that the queued marker never played. Voice Relay therefore requires no separate provider-acceptance row; provider alert identity remains the responsibility of each intake adapter.
- Chat Guard Observe-only acceptance passed on July 28 against the installed bridge. Its authenticated status reported `observe` with no incidents or permits; the non-persisting local tester flagged a repeated-message sample, returned `persisted: false`, and returned `enforcementPerformed: false`. No chat reply or moderation operation was dispatched. Destructive provider modes remain pending and require separate creator approval.
- Discord Chat Archive normal-channel acceptance passed on July 28 through the installed StreamBridge and its single shared Streamer.bot WebSocket. A clearly labeled message containing no viewer data was accepted once, the approved delivery action completed successfully, and Discord returned a stable message ID with no error code. The temporary simulation allowance was restored to `false` immediately afterward. Forum-thread creation and reuse remain pending.
- Ko-fi Donations offline acceptance passed on July 28. Streamer.bot's Ko-fi Donation Test trigger supplied a stable `messageId`, the intake explicitly marked it simulated, and StreamBridge normalized and durably queued exactly one Ko-fi donation alert. This is not provider acceptance; a Ko-fi-originated test webhook and replay remain pending.
- Clip Library Cache offline/runtime acceptance passed on July 28. The approved triggerless Streamer.bot action performed one real Twitch refresh and returned `40` clips; StreamBridge persisted a bounded `21,264`-byte metadata-only snapshot with no signed query credentials and no reported error. The observed startup window contained one refresh dispatch, and installing the dependency restored Clip Courier and Random Clip Player to healthy. Longer steady-state shared-consumer polling remains provider acceptance.
- Stream Launch Countdown's repaired control path was exercised on July 28 through the actual imported Streamer.bot actions. **Set & Start** created a visible, running, persisted 600-second timer and **Stop** hid it cleanly; both controls arrived once as unique, durably queued add-on relay events. The preview-only **Complete Now** action then displayed the configured completion message cleanly in the real browser overlay, emitted no browser error, hid after ten seconds, and did not dispatch the approved Go Live action. Its row remains offline pending only for audible tone confirmation and provider pending for a separately approved harmless scene transition.
- Subathon Timer's imported Reset, Start, Pause, Add Time, Resume, and final Pause controls all returned `ok` on July 28 and produced six unique durable relay events. The manual add moved the timer from 3600 to 3900 seconds, the final reset restored 3600 seconds, and the real browser overlay rendered a clean `01:00:00` READY state without errors. An authenticated simulated TikTok gift was accepted by the bridge but correctly left the production timer unchanged because simulated awards are disabled. The row remains pending for genuine contribution rules, restart recovery, and a longer running observation.
- None of this local or automated evidence changes a pending provider-acceptance row. Provider status requires the exact real-event evidence described in the table.

### Isolated runtime smoke — July 27, 2026

- Started a disposable bridge on `127.0.0.1:8799` with Streamer.bot test mode, temporary state/log/token paths, and no provider accounts or installed add-ons.
- `/health` reported `healthy`; `/ready` reported `true`; the wizard, chat overlay, and alerts overlay returned HTTP `200`.
- Twitch, YouTube, Kick, and TikTok chat fixtures plus YouTube Super Chat, Twitch Follow, and TikTok Gift fixtures were accepted once and queued only through the test delivery path.
- Replaying the Twitch chat fixture returned `duplicate: true` and `delivery: none`.
- An empty invalid event was rejected with HTTP `400`.
- The installed-add-on host is covered separately by the passing Playwright install/render test; a direct add-on URL is expected to return `404` in this empty disposable harness.

Update a row only after preserving the date, tested version, provider/build, exact trigger or fixture, observed result, and any limitation. Do not store webhook URLs, OAuth tokens, raw private chat, or viewer identifiers in this file.
