# Integration assumptions

## Verified

- Streamer.bot WebSocket requests and responses correlate through a string `id`.
- `DoAction` accepts an action name or GUID plus arguments.
- Optional WebSocket authentication uses the server Hello salt/challenge exchange.
- The documented default WebSocket bind is `127.0.0.1:8080` with endpoint `/`.

## Explicitly unverified or deferred

- TikFinity event names and payload fields. All TikFinity fixtures label unverified fields and do not claim production accuracy.
- Meld Studio scene, layer, visual, audio-routing, or overlay-hosting control.
- Speaker.bot speech generation, voice aliases, queue controls, and generated-audio metadata.
- Production Twitch, YouTube, Kick, TikTok, and Facebook transports.

Future Speaker.bot integration will execute speech decisions made by Streamer.bot; it will not decide whether a message may speak.
