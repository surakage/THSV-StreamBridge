# Integration assumptions

## Verified

- Streamer.bot WebSocket requests and responses correlate through a string `id`.
- `DoAction` accepts an action name or GUID plus arguments.
- Optional WebSocket authentication uses the server Hello salt/challenge exchange.
- The documented default WebSocket bind is `127.0.0.1:8080` with endpoint `/`.
- The receiver package compiles with Streamer.bot's bundled CPH API and default Newtonsoft.Json/JObject C# reference in `1.0.5-alpha.31`.
- The exported receiver action uses Streamer.bot's Default queue and has concurrent execution disabled.

## Explicitly unverified or deferred

- TikFinity event names and payload fields. All TikFinity fixtures label unverified fields and do not claim production accuracy.
- Meld Studio scene, layer, visual, audio-routing, or overlay-hosting control.
- Speaker.bot speech generation, voice aliases, queue controls, and generated-audio metadata.
- Production Twitch, YouTube, Kick, TikTok, and Facebook transports.

Third-party platform and output providers must still be explicitly registered by trusted application composition code. The framework does not dynamically execute arbitrary packages named by untrusted configuration.

Streamer.bot Alpha compatibility is verified one adopted release at a time. When the project adopts a newer Alpha, the receiver must be recompiled, its live QA matrix rerun, and `minimumStreamerBotVersion` updated if required.

Future Speaker.bot integration will execute speech decisions made by Streamer.bot; it will not decide whether a message may speak.
