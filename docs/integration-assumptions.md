# Integration assumptions

## Verified

- Streamer.bot WebSocket requests and responses correlate through a string `id`.
- `DoAction` accepts an action name or GUID plus arguments.
- Optional WebSocket authentication uses the server Hello salt/challenge exchange.
- The documented default WebSocket bind is `127.0.0.1:8080` with endpoint `/`.
- Core receiver package `1.0.2` compiles with Streamer.bot's bundled CPH API and default Newtonsoft.Json/JObject C# reference in `1.0.5-alpha.31` without adding `System.Core`.
- Package patch releases `1.0.3`/`1.1.1`/`1.0.1` export the stateless receiver and feature actions on Streamer.bot's Default queue with concurrent execution enabled. Automated export-integrity tests verify the setting. An equivalent installed configuration completed a 25-event live burst in Streamer.bot `1.0.5-alpha.31`; action-history entries started in the same second, all 25 deliveries completed, and none failed.
- Streamer.bot `Run Action Immediately` passes the receiver-populated argument stack into the Multi-Chat action in `1.0.5-alpha.31`.
- Multi-Chat package `1.1.0` compiles and produces its declared output contract for live simulated Twitch, YouTube, Kick, and TikTok chat events.
- Live review probes verified public message identity/time/sequence, bot provenance, and private-message bypass through the inline receiver-to-Multi-Chat action chain.
- Core Receiver `1.0.4`, Multi-Commands `1.1.0`, and Viewer Progression `1.0.0` import with populated author/description metadata in Streamer.bot `1.0.5-alpha.31`. A rebuilt immediate receiver chain completed both a linked simulated Twitch chat and its derived progression delivery; the source envelope exposed the bridge-resolved viewer ID and receiver contract `1.2.0`.
- Streamer.bot `1.0.5-alpha.31` currently reports all eight configured connections active. Twitch has connected broadcaster and bot accounts, YouTube has connected broadcaster and bot accounts, and Kick has a linked broadcaster account. This verifies account availability for native-variable probes; it does not verify any StreamBridge production input transport.
- TikFinity successfully established a loopback WebSocket connection to Streamer.bot `1.0.5-alpha.31` at `127.0.0.1:8080/`. The adopted profile maps Chat, Follow, Gift, and Like events. TikFinity Intake `1.1.0` adds a fifth Subscription action; creators must map that event explicitly after importing the updated package.
- Meld Studio, OBS Studio, and Streamlabs Desktop officially support URL-based Chromium/CEF Browser layers/sources; the local THSV overlay assets and loopback WebSocket are integration-tested in Chrome-compatible semantics.
- On July 28, 2026, Speaker.bot `0.1.7` stored the `THSV Male` and `THSV Female` aliases with Microsoft David Desktop and Microsoft Zira Desktop respectively. Streamer.bot `1.0.5-beta.2` acknowledged the approved Voice Relay Speak action, and the creator audibly confirmed the direct connection phrase plus all ten alert-category acknowledgement phrases. Playback-completion timing remains unavailable through the adopted API.
- On July 28, 2026, Discord Chat Archive delivered one clearly labeled, viewer-free acceptance message to the creator's private normal-channel webhook. Streamer.bot completed the approved action once, Discord returned a message ID with no error code, and the bridge restored simulated-message suppression immediately afterward. Forum-thread behavior remains unverified.

## Explicitly unverified or deferred

- TikFinity stable source-event IDs and simulator provenance. The documented placeholders are allowlisted, but production rewards/statistics remain blocked until a real live event is compared with a simulator event and replay behavior is verified.
- Live rendering, sizing, transparency, and reconnect behavior still require acceptance in each installed vendor build. THSV reads scene catalog and scene-change state through loopback-only vendor WebSockets when a creator saves a direct profile; it does not change scenes, layers/sources, streaming state, or audio through those control APIs.
- Direct connection metadata imports accept only the versioned safe schema, UUID profile IDs, supported providers, and credential-free loopback WebSocket URLs. Credentials are re-entered out-of-band and the whole merge is written only after every profile validates and every required secret can be protected.
- Acceptance baselines contain only sanitized provider outcomes, process/executable identity, scene counts, and latency. Replacing a baseline requires explicit creator approval.
- Tray notification history is bounded to 100 redacted entries and excludes credentials and full local paths.
- Duplicate-port and wrong-installation assistance is read-only. StreamBridge does not stop processes, reassign ports, or rewrite saved executables automatically.
- Older vaults migrate with strict freshness gating disabled. If enabled, readiness requires recent installed-app acceptance and recent verification only for enabled profiles that have a saved credential.
- Per-profile reliability scores are advisory snapshots based on reconnects, failed tests, latency, and acceptance outcomes; an application being intentionally closed and paused is not itself a deduction.
- Score-based tray alerts use a creator-configurable sustained-degradation delay; the score remains visible immediately, but a transient dip does not notify.
- Maintenance snoozes are profile-scoped, creator-approved, bounded to 720 hours, and suppress native reconnect attempts and score alerts without disabling or deleting the profile.
- Scheduled preflights are local read-only checks with bounded sanitized receipts. The schedule is disabled by default and never starts a broadcast or performs repair.
- Reliability exports omit connection IDs, WebSocket URLs, credentials, executable paths, and raw errors.
- Profile cloning reuses the source profile's DPAPI-protected credential without returning it to the browser, requires an unused explicit port, clears maintenance state, and creates the clone disabled.
- A saved native subscription is process-aware only when that provider executable is configured in the launcher. A closed configured app is neutral `paused` state; a manually managed provider without a saved executable retains normal connection/backoff behavior.
- Native connection attention is consolidated: paused profiles are excluded, reconnect warnings require at least three attempts while reconnecting, and the default 2,000 ms latency threshold can be adjusted per profile from 100 through 30,000 ms.
- Endpoint discovery is bounded to documented loopback defaults (`4455`, `13376`, and `59650/api/websocket`) or one creator-entered loopback port; no LAN or port-range scan is performed. Discovery only prefills the Wizard.
- The launcher process identity is authoritative for native subscription association. Runtime status exposes only the expected executable filename and PIDs, not full local paths; a different installation does not satisfy the exact-process check.
- Enabled profile edits are tested with the proposed in-memory credential before the DPAPI vault is changed. A failed test leaves the previous protected profile untouched; disabling a profile remains possible without requiring its unavailable vendor app.
- Credential verification timestamps are written only after a successful candidate test. Optional reminders are elapsed-day reminders, not assertions about vendor expiry. Acceptance receipts exclude messages, scene names, paths, and credentials and retain at most 50 runs.
- A started layout-v2 upgrade is not accepted after `/ready` alone: the installer creates and redeems a one-time local Wizard ticket, loads the authenticated overview, verifies the running version, and writes a sanitized smoke receipt before removing rollback data.
- Genuine live-stream, real-viewer end-to-end verification of the native Twitch, YouTube, and Kick transports below (reconnect behavior, sustained volume, and replay under real network conditions). Field-level trigger-variable mapping has been captured and corrected against real Streamer.bot Action History argument dumps (see the platform alert matrix below), but that is test-trigger capture, not a live-audience soak test.
- Durable output delivery is implemented and covered by restart replay, bounded retry, corruption fail-closed, and dead-letter tests. Delivery remains at least once: downstream high-impact actions must use the stable source event ID as their idempotency key because a crash after downstream acknowledgement but before outbox removal can replay an event.
- Platform gift-spree aggregation. Adapters must preserve a platform-provided bundle quantity, but unbundled gift events are not coalesced yet.

Third-party platform and output providers must still be explicitly registered by trusted application composition code. The framework does not dynamically execute arbitrary packages named by untrusted configuration.

Streamer.bot compatibility is verified one stable release at a time. The installed C# actions must be recompiled and the focused live QA matrix rerun after a host upgrade. Historical alpha and beta evidence remains useful provenance, but all current package manifests use `1.0.7` stable as their installation floor. Automated trigger repair is intentionally narrower: it writes only when the selected executable reports the exactly validated `1.0.7` schema. A later host remains inspection-only until its actions schema and trigger defaults complete the compatibility gate.

Speaker.bot executes speech decisions made by Streamer.bot; it does not decide whether a message may speak. The Milestone 6 package denies raw actor names, item names, tiers, and alert messages by default and requires a creator-authored template or explicit creator-side approval before text reaches TTS.

## Production platform alert matrix

Twitch, YouTube, and Kick use native Streamer.bot relay intake (`packages/streamerbot/native-platform-intake/src/RelayPlatform.cs`), not a placeholder transport. Their event field/ID mappings below were corrected against real Streamer.bot Action History argument dumps from actual trigger executions — not assumed from documentation — with one noted exception. This confirms mapping correctness, not full production readiness: none of the three has had a genuine live-stream, real-viewer soak test (reconnect under real network conditions, sustained volume, replay), which remains the open item tracked above.

| Platform | Live transport | Alert types with corrected, Action-History-verified field mapping | Known gaps |
| --- | --- | --- | --- |
| Twitch | Native Streamer.bot relay intake | Follow, Subscription, Resubscription, Gift Subscription, Gift Bomb, Cheer/Bits, Raid, channel reward redemption | Subscription-family events expose no native message/event ID, so they use a documented deterministic fallback ID (`synthetic:` prefixed, flagged in `metadata.unverifiedFields`) instead of a platform-native one |
| YouTube | Native Streamer.bot relay intake | Subscriber (follow), Membership, Membership Gift, Super Chat, Super Sticker, Jewels Gifted | Jewels Gifted was captured from Streamer.bot 1.0.5-beta.1 and uses `messageId` as its stable event identity; membership events without native IDs retain the honestly flagged fallback-ID treatment |
| Kick | Native Streamer.bot relay intake | Follow, Subscription, Resubscription, Gift Subscription, Kicks Gifted, channel reward redemption | Mass Gift Subscription's field mapping is confirmed against Streamer.bot's own published variable reference, not a live Action History capture — its test trigger currently crashes Streamer.bot before any data can be captured. Kick reward mutation controls remain disabled; Streamer.bot does not document that contract. Same fallback-ID treatment as Twitch/YouTube where no native ID is exposed |
| TikTok/TikFinity | Streamer.bot relay intake; simulator acceptance pending | Chat, follow, gift, and like shapes implemented but transport fields explicitly unverified | Stable source-event ID and simulator provenance remain unverified; production rewards/statistics use is blocked until a real live event is compared against a simulator event |

Each production adapter must still have a genuine live-stream verification pass — reconnect/replay behavior under real network conditions, sustained event volume, and retry policy for HTTP 429/output capacity — before this table can claim more than corrected field mapping.
