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

This proves validation, delivery, and Streamer.bot projection only. To test the scheduler itself, copy the example configuration and add a harmless definition with `everyMinutes: 1`, `firstRunAfterMinutes: 0`, and either fixed or shuffle-container selection. The deterministic suite verifies independent intervals, container exhaustion before repetition, persisted bag state, catch-up, and skip behavior without waiting on wall-clock time.

Runtime controls are available with `scripts\timed-actions.ps1 -Operation start|pause|resume|stop`. Tests verify that timers stay dormant before start, pause freezes the remaining interval, controls reject missing bearer tokens, and stopping reports an inactive session in diagnostics.

For an offline Browser Overlay Hub check, open `http://127.0.0.1:8787/overlay/`, `/overlay/chat`, and `/overlay/alerts` in Chrome or Edge and simulate `twitch-chat.json`, `youtube-super-chat.json`, or another public fixture. Chat must render only on the combined/Chat pages and alerts only on the combined/Alerts pages. With Chat and Alerts open in the same browser profile, compare `browserOverlay.clients` in `/diagnostics` before and after opening both pages: `SharedWorker` support should increase the client count by one, not two. The integration suite opens the actual loopback WebSocket, verifies every fixed route plus worker-aware CSP headers, and observes a projected public message. Source-integrity tests prohibit `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, and `eval` in the reviewed browser scripts.

Live acceptance requires adding the selected URL(s) as Browser layers/sources in each adopted broadcasting application and confirming transparent rendering, independent movement/sizing, reconnect, and expected client count. This is a presentation check only; offline fixtures do not prove production platform transports.
