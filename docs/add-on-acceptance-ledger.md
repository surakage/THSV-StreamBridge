# Add-on acceptance ledger

Snapshot: July 28, 2026. Published baseline: `2.5.0`.

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
| User Translate | Passed | Pending | Translation provider timeout, Unicode, attribution, splitting, and source-only reply. |
| Auto Translate | Passed | Pending | Sustained-chat rate limits, moderation behavior, privacy disclosure, and source-only reply. |
| Ko-fi Donations | Passed | Pending | One real Ko-fi test webhook with stable-ID replay suppression. |
| Subathon Timer | Passed | Pending | Real contribution rules, restart recovery, pause/resume, and long-running overlay. |
| Stream Launch Countdown | Passed | Pending | Streamer.bot controls, finish sound, optional approved scene action, and browser-host rendering. |
| Scene Actions | Passed | Pending | OBS, Meld, and Streamlabs scene-name changes plus reconnect behavior. |
| First Five | Passed | Pending | Real Twitch reward enable/update/refund sequence and concurrent redemption serialization. |
| Fan Crown | Passed | Pending | Real Twitch title/cost update, fulfillment/refund rollback, reset, and overlay. |
| Raid Scout | Passed | Pending | Twitch candidate discovery and an explicitly confirmed raid. |
| Quote Vault | Passed | Pending | Cross-platform commands, moderator approval, restart persistence, and source-routed replies. |
| Discord Chat Archive | Passed | Pending | Private webhook delivery to a normal channel and one session-scoped forum thread. |
| Viewer Foundation | Passed | Pending | Identity link, progression, achievements, digest-locked legacy migration, privacy export/correction/deletion, and consumer isolation. |
| Community Analytics | Passed | Pending | Stream rollover, ignored identities, bounded reports, and deletion propagation. |
| Viewer Spotlight | Passed | Pending | Self/manual/reward card, fade/credits, Stream Score, Discord snapshot, settlement, browser hosts, reconnect, and deletion cleanup. |
| Chat Guard | Passed | Pending | Observe mode plus separately approved warn/delete/timeout/ban capability and abort-rate checks. Destructive modes require genuine provider evidence. |
| Creator Controls | Passed | Pending | Title/category mutation and result readback on every enabled provider. |
| Category Pilot | Passed | Pending | Windows process matching, debounce, suggest/apply/dismiss, lock, and opt-in automatic mode. |
| Live Beacon | Passed | Pending | Stable stream identity, coalescing, reconnect deduplication, and private Discord delivery. |
| Clip Courier | Passed | Pending | New Twitch clip discovery, duplicate suppression, and confirmed channel/forum delivery. |
| Viewer Lobby | Passed | Pending | Join/leave/position, revision conflicts, restart recovery, ordering, and operator controls. |
| Voice Relay | Passed | Pending | Voice alias, filtering, queue pressure, pause/resume/stop, and emergency control behavior. |
| Follower Pulse | Passed | Pending | Twitch authorization, first baseline, pagination, two-scan confirmation, and refollow behavior. |
| Clip Library Cache | Passed | Pending | One real Twitch metadata refresh shared by Random Clip Player and Clip Courier without duplicate steady-state polling. |
| Creator Utility Pack | Passed | Pending | Cross-platform counters, casual giveaway lifecycle, poll voting, source-routed replies, and restart/stream-end behavior. |
| Chat Play Pack | Passed | Pending | Number Guess, creator-authored Trivia, Prediction rounds, anti-replay awards, and source-routed replies. |
| Free Game Check | Passed | Pending | Fixed-provider lookup, silent baseline, deduplication, attribution, and selected-platform announcements. |
| Accessibility Captions | Passed | Pending | Browser-host readability, public-chat consent, bot suppression, bounds, cropping, transparency, and reconnect behavior. |

## Current automated and local evidence

- `135` Vitest files and `709` tests pass on the current source baseline.
- `11` Playwright checks pass, including add-on installation/configuration, persisted collapsible UI state, Chat Guard safety controls, overlay presentation, crop-safe layouts, and the acceptance ledger.
- lint, typecheck, configuration validation, production build, release packaging, and the production dependency audit pass; the audit reports zero known vulnerabilities.
- All `29` indexed add-on archives and `36` Streamer.bot imports are generated from synchronized `2.5.0` source and covered by the release integrity gate.
- On July 28, the local bridge reported `healthy`/`ready`; its creator-selected `19` add-ons were upgraded to compatible `2.5.0` packages and all reported `installed`. Their private acceptance entries now carry version `2.5.0`.
- Disposable Windows lifecycle coverage passed `21` focused installer/package tests plus custom-port start, replacement-start, stale-build rebuilding, active-config shutdown, upgrade data preservation, downgrade/tamper rejection, and conservative uninstall behavior.
- None of this local or automated evidence changes a pending provider-acceptance row. Provider status requires the exact real-event evidence described in the table.

### Isolated runtime smoke — July 27, 2026

- Started a disposable bridge on `127.0.0.1:8799` with Streamer.bot test mode, temporary state/log/token paths, and no provider accounts or installed add-ons.
- `/health` reported `healthy`; `/ready` reported `true`; the wizard, chat overlay, and alerts overlay returned HTTP `200`.
- Twitch, YouTube, Kick, and TikTok chat fixtures plus YouTube Super Chat, Twitch Follow, and TikTok Gift fixtures were accepted once and queued only through the test delivery path.
- Replaying the Twitch chat fixture returned `duplicate: true` and `delivery: none`.
- An empty invalid event was rejected with HTTP `400`.
- The installed-add-on host is covered separately by the passing Playwright install/render test; a direct add-on URL is expected to return `404` in this empty disposable harness.

Update a row only after preserving the date, tested version, provider/build, exact trigger or fixture, observed result, and any limitation. Do not store webhook URLs, OAuth tokens, raw private chat, or viewer identifiers in this file.
