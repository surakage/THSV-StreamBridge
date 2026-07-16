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

For the Multi-Commands offline matrix, run:

```powershell
npm run simulate -- tests/fixtures/twitch-command.json
npm run simulate -- tests/fixtures/youtube-command.json
npm run simulate -- tests/fixtures/kick-command.json
npm run simulate -- tests/fixtures/tiktok-tikfinity-command.json
npm run simulate -- tests/fixtures/facebook-command.json
```

Each receiver action should run Multi-Commands immediately. The fixtures expose canonical command `shoutout`, invoked alias `so`, one plain-string argument, moderator minimum role, and an authorized result. Private and operator command types deliberately bypass this public package.

To exercise the creator-facing prefix and alias configuration rather than a pre-structured event, run `npm run simulate -- tests/fixtures/twitch-command-chat.json`. The response includes a deterministic `derivedEventIds` entry; Streamer.bot receives the original chat followed by the correlated command in consecutive bridge-sequence order.

For the Multi-Alerts live matrix, run:

```powershell
npm run simulate -- tests/fixtures/twitch-follow.json
npm run simulate -- tests/fixtures/youtube-super-chat.json
npm run simulate -- tests/fixtures/kick-follow.json
npm run simulate -- tests/fixtures/tiktok-tikfinity-gift.json
npm run simulate -- tests/fixtures/facebook-donation.json
npm run simulate -- tests/fixtures/tiktok-tikfinity-like.json
```

The first five prove platform-neutral routing. The final actor-free milestone proves explicit unverified-field reporting. Monetary fixtures intentionally use decimal strings; numeric JSON amounts are rejected rather than converted through floating point.

The unit suite also runs a 100-event delivery burst. It verifies FIFO start order and the configured concurrency ceiling, plus a stalled-first-event case proving a later event can complete through the second delivery slot. Streamer.bot package-integrity tests verify that the receiver and all feature actions export with **Concurrent** enabled. After installing a package patch, repeat a live Alpha burst and confirm later action-history entries complete even if an earlier test action is deliberately delayed. Downstream timeline consumers always use the bridge-assigned sequence rather than action completion time.

Run a bounded live burst without editing fixtures:

```powershell
npm run simulate:burst -- tests/fixtures/twitch-chat.json 25
```

The tool creates unique local and source event IDs for 2–100 simulated copies, submits them through a worker pool capped by `security.maxConcurrentRequests`, and reports accepted/failed totals. Keep the count within `security.maxRequestsPerMinute` or intentionally raise that local test limit. It is offline test traffic and cannot be presented as production platform verification.

For a no-wait Multi-Timed Actions contract check, run:

```powershell
npm run simulate -- tests/fixtures/system-timed.json
```

This proves validation, delivery, and Streamer.bot projection only. To test the scheduler itself, copy the example configuration, add a harmless enabled `once` definition a minute in the future, start the bridge, and verify exactly one `system.timed` action-history entry. Restart after it fires and confirm it does not fire again. The deterministic unit suite separately verifies interval catch-up, skip, persistence, and exact next-occurrence behavior without waiting on wall-clock time.
