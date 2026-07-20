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

## Explicitly unverified or deferred

- TikFinity stable source-event IDs and simulator provenance. The documented placeholders are allowlisted, but production rewards/statistics remain blocked until a real live event is compared with a simulator event and replay behavior is verified.
- Live rendering, sizing, transparency, and reconnect behavior in installed Meld Studio, OBS Studio, and Streamlabs Desktop builds. THSV does not yet control application scenes, layers/sources, or audio through their separate control APIs.
- Live Speaker.bot connection, installed voice aliases, speech playback, and queue-control delivery. Official request shapes and Streamer.bot integration methods are implemented, but live verification remains pending.
- Genuine live-stream, real-viewer end-to-end verification of the native Twitch, YouTube, and Kick transports below (reconnect behavior, sustained volume, and replay under real network conditions). Field-level trigger-variable mapping has been captured and corrected against real Streamer.bot Action History argument dumps (see the platform alert matrix below), but that is test-trigger capture, not a live-audience soak test.
- Durable output delivery is implemented and covered by restart replay, bounded retry, corruption fail-closed, and dead-letter tests. Delivery remains at least once: downstream high-impact actions must use the stable source event ID as their idempotency key because a crash after downstream acknowledgement but before outbox removal can replay an event.
- Platform gift-spree aggregation. Adapters must preserve a platform-provided bundle quantity, but unbundled gift events are not coalesced yet.

Third-party platform and output providers must still be explicitly registered by trusted application composition code. The framework does not dynamically execute arbitrary packages named by untrusted configuration.

Streamer.bot Alpha compatibility is verified one adopted release at a time. When the project adopts a newer Alpha, the receiver must be recompiled, its live QA matrix rerun, and `minimumStreamerBotVersion` updated if required.

Speaker.bot executes speech decisions made by Streamer.bot; it does not decide whether a message may speak. The Milestone 6 package denies raw actor names, item names, tiers, and alert messages by default and requires a creator-authored template or explicit creator-side approval before text reaches TTS.

## Production platform alert matrix

Twitch, YouTube, and Kick use native Streamer.bot relay intake (`packages/streamerbot/native-platform-intake/src/RelayPlatform.cs`), not a placeholder transport. Their event field/ID mappings below were corrected against real Streamer.bot Action History argument dumps from actual trigger executions — not assumed from documentation — with one noted exception. This confirms mapping correctness, not full production readiness: none of the three has had a genuine live-stream, real-viewer soak test (reconnect under real network conditions, sustained volume, replay), which remains the open item tracked above.

| Platform | Live transport | Alert types with corrected, Action-History-verified field mapping | Known gaps |
| --- | --- | --- | --- |
| Twitch | Native Streamer.bot relay intake | Follow, Subscription, Resubscription, Gift Subscription, Gift Bomb, Cheer/Bits, Raid, channel reward redemption | Subscription-family events expose no native message/event ID, so they use a documented deterministic fallback ID (`synthetic:` prefixed, flagged in `metadata.unverifiedFields`) instead of a platform-native one |
| YouTube | Native Streamer.bot relay intake | Subscriber (follow), Membership, Membership Gift, Super Chat, Super Sticker | Same fallback-ID treatment as Twitch subscriptions where no native ID is exposed |
| Kick | Native Streamer.bot relay intake | Follow, Subscription, Resubscription, Gift Subscription, Kicks Gifted, channel reward redemption | Mass Gift Subscription's field mapping is confirmed against Streamer.bot's own published variable reference, not a live Action History capture — its test trigger currently crashes Streamer.bot before any data can be captured. Kick reward mutation controls remain disabled; Streamer.bot does not document that contract. Same fallback-ID treatment as Twitch/YouTube where no native ID is exposed |
| TikTok/TikFinity | Streamer.bot relay intake; simulator acceptance pending | Chat, follow, gift, and like shapes implemented but transport fields explicitly unverified | Stable source-event ID and simulator provenance remain unverified; production rewards/statistics use is blocked until a real live event is compared against a simulator event |

Each production adapter must still have a genuine live-stream verification pass — reconnect/replay behavior under real network conditions, sustained event volume, and retry policy for HTTP 429/output capacity — before this table can claim more than corrected field mapping.
