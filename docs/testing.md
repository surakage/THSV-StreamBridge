# Testing

Run the complete deterministic suite with `scripts\test.ps1`.

Individual checks are `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run build`, and `npm run config:validate`.

Fixtures cover Twitch, YouTube, Kick, TikTok through explicitly unverified TikFinity-shaped examples, and Facebook. The suite includes ingress security, queue pressure, delivery health, persistence failure, lifecycle, registry, logging, and adapter tests. Tests require no credentials, accounts, live streams, or running Streamer.bot instance.

The simulator defaults to `tests/fixtures/twitch-chat.json`. Provide another fixture with `npm run simulate -- <path>`.

For the Multi-Chat offline matrix, run:

```powershell
npm run simulate -- tests/fixtures/twitch-chat.json
npm run simulate -- tests/fixtures/youtube-chat.json
npm run simulate -- tests/fixtures/kick-chat.json
npm run simulate -- tests/fixtures/tiktok-tikfinity-chat.json
npm run simulate -- tests/fixtures/facebook-chat.json
```

With live Streamer.bot delivery configured, each receiver action must run Multi-Chat immediately and expose the same `multiChat*` output contract. Fixture fields prove framework routing only; they are not claims about production platform transports.

The unit suite also runs a 100-event delivery burst. It verifies FIFO start order and the configured concurrency ceiling. Since Streamer.bot's Default queue is non-blocking, downstream timeline consumers use the bridge-assigned sequence rather than action completion time.
