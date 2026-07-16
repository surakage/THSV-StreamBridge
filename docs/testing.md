# Testing

Run the complete deterministic suite with `scripts\test.ps1`.

Individual checks are `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run build`, and `npm run config:validate`.

Fixtures cover Twitch, YouTube, Kick, TikTok through explicitly unverified TikFinity-shaped examples, and Facebook. The suite includes ingress security, queue pressure, delivery health, persistence failure, lifecycle, registry, logging, and adapter tests. Tests require no credentials, accounts, live streams, or running Streamer.bot instance.

The simulator defaults to `tests/fixtures/twitch-chat.json`. Provide another fixture with `npm run simulate -- <path>`.
