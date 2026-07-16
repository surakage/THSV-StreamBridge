# Integration assumptions

## Verified

- Streamer.bot WebSocket requests and responses correlate through a string `id`.
- `DoAction` accepts an action name or GUID plus arguments.
- Optional WebSocket authentication uses the server Hello salt/challenge exchange.
- The documented default WebSocket bind is `127.0.0.1:8080` with endpoint `/`.
- Core receiver package `1.0.2` compiles with Streamer.bot's bundled CPH API and default Newtonsoft.Json/JObject C# reference in `1.0.5-alpha.31` without adding `System.Core`.
- Package patch releases `1.0.3`/`1.1.1`/`1.0.1` export the stateless receiver and feature actions on Streamer.bot's Default queue with concurrent execution enabled. Automated export-integrity tests verify the setting. An equivalent installed configuration completed a 25-event live burst in Streamer.bot `1.0.5-alpha.31`; action-history entries started in the same second, all 25 deliveries completed, and none failed.
- Streamer.bot `Run Action Immediately` passes the receiver-populated argument stack into the Multi-Chat action in `1.0.5-alpha.31`.
- Multi-Chat package `1.1.0` compiles and produces its declared output contract for live simulated Twitch, YouTube, Kick, TikTok, and Facebook chat events.
- Live review probes verified public message identity/time/sequence, bot provenance, and private-message bypass through the inline receiver-to-Multi-Chat action chain.

## Explicitly unverified or deferred

- TikFinity event names and payload fields. All TikFinity fixtures label unverified fields and do not claim production accuracy.
- Meld Studio scene, layer, visual, audio-routing, or overlay-hosting control.
- Speaker.bot speech generation, voice aliases, queue controls, and generated-audio metadata.
- Production Twitch, YouTube, Kick, TikTok, and Facebook transports.
- Crash-recoverable output delivery. The current delivery queue is memory-only; production financial adapters must not be enabled until a durable outbox and replay test exist.
- Platform gift-spree aggregation. Adapters must preserve a platform-provided bundle quantity, but unbundled gift events are not coalesced yet.

Third-party platform and output providers must still be explicitly registered by trusted application composition code. The framework does not dynamically execute arbitrary packages named by untrusted configuration.

Streamer.bot Alpha compatibility is verified one adopted release at a time. When the project adopts a newer Alpha, the receiver must be recompiled, its live QA matrix rerun, and `minimumStreamerBotVersion` updated if required.

Future Speaker.bot integration will execute speech decisions made by Streamer.bot; it will not decide whether a message may speak. Raw actor names, item names, tiers, and alert messages are denied for speech by default. Milestone 6 must require a creator-authored template or explicit creator-side allowlist/filter before any untrusted field reaches TTS.

## Production platform alert matrix

All five first-party platform entries currently use placeholder transports. The generic contract and offline fixtures prove routing only; they do not prove that a live platform exposes each event type.

| Platform | Live transport | Verified alert types |
| --- | --- | --- |
| Twitch | Placeholder | None |
| YouTube | Placeholder | None |
| Kick | Placeholder | None |
| TikTok/TikFinity | Placeholder; fixture fields explicitly unverified | None |
| Facebook | Placeholder | None |

Each production adapter must replace its row with a source-backed capability matrix, stable source-ID guarantee, reconnect/replay behavior, retry policy for HTTP 429/output capacity, and unsupported-event list before it can be enabled by default.
