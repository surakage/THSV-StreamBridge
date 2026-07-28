# Offline and private acceptance

THSV StreamBridge can be exercised without publicly broadcasting. The safest sequence is fixture tests, local browser-source previews, Streamer.bot Test triggers, and then an unlisted/private provider session only where a genuine provider acknowledgement is unavoidable.

## Four acceptance levels

1. **Repository gate** — run lint, typecheck, unit/integration tests, build, and Playwright. This proves deterministic behavior and failure isolation.
2. **Local simulation** — use the bridge simulator, wizard preview/test buttons, mock adapter, and authenticated local overlay URLs. Simulated events must remain visibly labeled and must not mutate rewards, send live chat, raid, moderate, or post to Discord.
3. **Streamer.bot test trigger** — use Streamer.bot's built-in Test action while every outbound or destructive sub-action is disabled or targets a harmless local controller. Inspect the returned `*Valid`, `*Error`, correlation ID, simulated flag, and dispatch result.
4. **Private provider acceptance** — use an unlisted YouTube broadcast, a separate Twitch test account/channel, a restricted Discord test server/channel, and test rewards with minimal cost. This is not a public stream, but it is the only honest way to verify OAuth scopes and provider acknowledgements.

## Safe local setup

1. Start Streamer.bot and StreamBridge with the release configuration.
2. Keep real outbound chat, Discord delivery, raids, reward mutations, moderation, automatic category changes, translation, and TTS disabled.
3. Open the wizard and confirm core health, Streamer.bot inspection, installed package IDs/groups, and add-on health.
4. Add browser sources using the local `127.0.0.1` URLs. A normal browser tab is sufficient for the first visual pass.
5. Use unique event IDs for every simulation. Reusing a fixture ID intentionally tests deduplication and should report a duplicate.
6. Record pass/fail in [the add-on ledger](add-on-acceptance-ledger.md); never convert a simulated pass into a provider-accepted claim.

## Recommended batches

### Visual and local-only

Test Stream Launch Countdown, Subathon Timer, Viewer Spotlight, Viewer Lobby, Random Clip Player lifecycle fixtures, chat, alerts, and overlay reconnects first. Exercise long names, missing avatars, transparent backgrounds, cropping, compact layouts, queue ceilings, and disconnect/reconnect.

### Read-only provider paths

Test Follower Pulse baseline, clip lookup, Raid Scout candidate discovery without confirmation, Category Pilot suggestions without automatic apply, translations with outbound sending disabled, and analytics/progression projections.

### Side-effect paths

Use disposable/private targets: a test Discord channel/forum, low-cost test rewards, a secondary channel, and reversible title/category values. Verify one operation at a time and its readback before enabling automation.

### Never satisfy with simulation alone

Financial stable IDs, reward fulfillment/refund, actual provider title/category changes, Discord webhook response IDs, raids, moderation actions, outbound chat, translation delivery, and Speaker.bot playback/voice acceptance require a genuine acknowledgement from the responsible product.

## Suggested commands

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run config:validate
npm.cmd run build
npm.cmd run test:browser
```

For one normalized fixture:

```powershell
npm.cmd run simulate -- tests/fixtures/twitch-chat.json
```

The simulator is appropriate for routing, validation, overlays, deduplication, aggregation, and failure handling. It is deliberately insufficient for proving a provider performed a real side effect.

## Recommended no-live acceptance run

Use a normal browser first, then OBS or Meld only for the final crop/render check:

1. Run the repository commands above. A complete working-tree pass currently means `135` Vitest files / `707` tests and `10` Playwright checks.
2. Start the bridge with the mock adapter enabled and open `/wizard/`, `/overlay/chat`, `/overlay/alerts`, and each installed add-on overlay in ordinary browser tabs.
3. Keep every delivery or mutation toggle off. In Streamer.bot, temporarily disable Send Message, webhook, raid, reward mutation, category/title update, moderation, translation reply, and TTS sub-actions.
4. Send unique fixtures for chat, alerts, online/offline lifecycle, commands, timers, and supported add-on events. Send one fixture twice to prove duplicate suppression.
5. Use wizard preview buttons for cards, timers, alerts, layout modes, long names, missing images, transparent backgrounds, queue limits, and reconnects.
6. Use Streamer.bot **Test** triggers only after inspecting the action's simulated flag and output variables. A successful relay is an Offline/manual pass, not a Provider pass.
7. Restart StreamBridge and Streamer.bot separately. Confirm persisted state resumes where documented and ephemeral overlays/queues do not replay stale identity or content.
8. Record the exact result on the add-on's **Acceptance status** card in the wizard. Do not paste tokens, webhook URLs, raw viewer IDs, or private messages.

This verifies nearly all framework behavior without a public broadcast. The remaining provider-only checks should use an unlisted/private channel or test server one at a time, with reversible settings and the smallest possible reward cost.
