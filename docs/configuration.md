# Configuration

`config/bridge.example.json` is the runtime-validated example, not the normal creator runtime. `scripts\start.ps1` now reuses `data/runtime/active-config.txt`, then `data/runtime/bridge.local.json`, and falls back to the example only on a first run. Override it explicitly with `THSV_STREAMBRIDGE_CONFIG` or `scripts\start.ps1 -Config <path>`.

Run `scripts\validate-config.ps1` before startup.

## Platforms

Every platform entry preserves `enabled`, input/output flags, adapter provider, legacy compatibility requirements, and bounded reconnect settings even while disabled. Platform keys are open validated identifiers; providers are resolved through the adapter registry. Runtime diagnostics add connection state, last event time, last error, and reconnect attempts.

The selected provider is authoritative for runtime capabilities. Creator-editable legacy `capabilities` values cannot inflate a provider declaration; unsupported claims fail startup, while the runtime adapter receives the provider declaration. The wizard displays the v2 per-operation report and its verified, unverified, unsupported, and limitation states.

## Scoped blockers

`filters.enabled` controls bounded blocker evaluation. Each unique rule selects a `display`, `command`, or `module` scope; an optional platform and actor-type set; a message, username, or display-name target; and an exact, contains, or restricted-regex match.

- `display` prevents a matching public chat event from reaching browser presentation subscribers but does not suppress command parsing, Streamer.bot delivery, or modules.
- `command` prevents automatic chat-to-command derivation but does not hide the chat message.
- `module` skips only the listed internal framework module IDs and does not hide presentation or disable command parsing.

Regex patterns are capped at 200 characters and evaluated only against schema-bounded strings. Backreferences, lookarounds, nested quantified groups, and quantified alternations are rejected at configuration validation, before the rule can be enabled. Prefer exact or contains matching whenever possible.

## Secrets

Configuration stores only environment-variable names. Put the Streamer.bot password in the variable named by `streamerbot.passwordEnv`, never in JSON. The local control API uses an automatically generated token from `security.controlTokenFile`, or an explicit variable named by `security.controlTokenEnv`. `.env` files are ignored, but the service intentionally does not auto-load them.

## Output delivery

`outputs` is an open registry-backed record. Streamer.bot's queue capacity, delivery concurrency, pending acknowledgements, acknowledgement timeout, failure threshold, retry bounds, and dead-letter capacity are bounded in configuration. Before an ingestion call returns `accepted`, every required output obligation is written atomically to `streamerbot.deliveryStateFile`. Pending records are replayed after restart, retried with bounded exponential backoff, and moved into a bounded dead-letter queue after `deliveryMaxAttempts`.

Delivery is at least once, not exactly once. A crash after Streamer.bot acknowledges an action but before the acknowledgement is persisted can replay that action; downstream actions must remain idempotent using the stable event ID. Per-platform/channel lanes preserve accepted order while allowing unrelated lanes to progress concurrently. Diagnostics distinguish durable queueing, Streamer.bot acknowledgement, failed attempts, and dead letters; an acknowledgement does not prove a later platform action completed successfully.

`deliveryStatus` values returned by ingestion are `durably-queued`, `not-required`, or `duplicate-ignored`. A persistence error rejects ingestion instead of publishing the event only to in-process consumers. Input adapters must retry bounded-capacity or unavailable responses with backoff rather than silently discarding them.

`streamerbot.testMode=true` is non-live: it performs no WebSocket connection and no action execution. Remote Streamer.bot URLs require `allowRemote=true`, and remote connections must use `wss://`. URLs containing credentials or query parameters are rejected; secrets belong in environment variables.

When a Streamer.bot password is configured, its WebSocket `Hello` must contain the documented salt and challenge. A challenge-free local peer is rejected instead of being trusted merely because it occupies the expected loopback port.

## Commands

`commands` is the creator-facing source of truth for public chat commands. It defines one prefix and a bounded list of canonical names, aliases, minimum roles, and bot policy. Startup validation rejects invalid prefixes and every name/alias collision before an adapter starts.

Production chat adapters emit raw public messages as `chat.message`. The bridge centrally applies this configuration and the shared tokenizer, then emits an ordered, correlated `command.received` event when the message matches a configured command. Adapters must not independently split raw chat text. A direct `command.received` event is reserved for integrations that already provide a structured command name and string argument array rather than raw chat.

Cooldowns and spam limits are deliberately absent until Milestone 9 provides cross-platform viewer identity. Adding a per-platform cooldown earlier would allow the same person to bypass it through another platform account.

## Timed actions

`timedActions.stateFile` stores session timing and each container's remaining message indexes; it does not retain viewer data. Definitions have a unique lowercase `id`, creator-facing `name`, `enabled` flag, independent `everyMinutes`, optional `firstRunAfterMinutes`, missed-run policy, bounded JSON payload, and selection mode.

Use `selection: { "mode": "fixed" }` for an ordinary timed payload. Use `selection: { "mode": "shuffle-container", "messages": ["...", "..."] }` to select one unused creator message per occurrence. The bag persists across sessions and restarts; it resets only after every message has been accepted once. `skip` advances past occurrences missed during a crash, while `fire-once` emits the latest due occurrence. Disable either the definition or the `timers` input without deleting settings.

The example contains no definitions. This is intentional: installing or starting the bridge must not create surprise timed automation.

Timers do not arm merely because the bridge process is running. A normalized `stream.online` event starts the session; the session stops only after every observed live platform reports `stream.offline`. Until production adapters supply those events, call `scripts\timed-actions.ps1 -Operation start` from the trusted Streamer.bot Stream Online action and `-Operation stop` from Stream Offline. Operators can use `pause` and `resume` at any time without restarting the service. All four HTTP controls require the local bearer token.

## Browser overlay

`browserOverlay.enabled` controls public browser-event broadcasting. `brandLabel` customizes or hides the combined-layout heading, `maxChatMessages` bounds browser-only chat retention, `maxAlertQueue` bounds waiting visual alerts with a lowest-priority/oldest-first discard policy, `alertDurationMs` controls visual display time, and `showBots`/`showSimulated` provide explicit presentation filters. `browserOverlay.chat` saves regular/compact layout, bounded font size, approved font family, text/background/card colors and opacity, platform-label/profile-picture/badge visibility, and a case-insensitive ignored-name list. Message cards default to platform colors and may instead use one shared creator color or a fully transparent background. Its `events.platformEvents` block stores only the real event choices exposed for each platform: Twitch, YouTube, Kick, and TikTok each have a separate event list and separate templates. A 40-to-500-character Unicode-safe display cap applies per platform. These settings are non-secret and available to the local browser layer through `/overlay/config`. Legacy grouped event settings are migrated to the closest platform-specific choices; the deprecated `meldOverlay` key is also migrated for `0.9.0` compatibility.

Template tokens such as `{actor}`, `{quantity}`, `{tier}`, and `{months}` are StreamBridge's stable normalized presentation contract. They are not raw Streamer.bot argument names. The native and TikFinity intake actions translate provider-specific variables into the normalized event first, so browser templates do not need to change when two platforms name the same value differently. Unknown tokens fail configuration validation.

User presentation metadata accepts HTTPS-only avatar and badge icon URLs, six-digit hex name colors, and at most 16 bounded badges. Subscription presentation accepts explicit new/renewal/upgrade, month, streak, gift, and gifter fields; values are never inferred from unrelated platform data.

## Channel rewards

`streamerbot.rewardAdministrationActionAlias` selects the reviewed, triggerless Streamer.bot action used for creator-approved Twitch mutations. The default is `THSV StreamBridge - Reward Administration`. Twitch native intake declares reward reading, redemption intake, update, fulfill, and cancel operations. Kick native intake declares redemption intake only; unsupported Kick mutations cannot be enabled through editable capability claims. See [Channel rewards](rewards.md).

## Archived add-on configuration

Stage 2 core has no `viewerIdentity`, `companion`, or `browserOverlay.maxCompanionQueue` settings. Legacy files containing those keys still load so an upgrade does not fail, but the keys are ignored and never reactivate archived features. Startup writes an `archived-config-ignored` warning to the structured service log with the exact ignored paths. The v2 migration preview reports preserved progression and companion state paths and flags Bloom-named commands for explicit creator review. See [Future add-ons](future-add-ons.md).

## Ports

| Component | Default | Bind | Purpose |
|---|---:|---|---|
| Bridge diagnostics and overlay | 8787 | `127.0.0.1` | Diagnostics, token-protected controls, fixed browser assets, and loopback-only overlay events |
| Streamer.bot WebSocket | 8080 | `127.0.0.1` | Outbound action delivery |

Non-loopback bridge binding requires the explicit `allowNetworkAccess` opt-in. A port conflict fails startup with the host and port in the error.

Even when the HTTP listener is deliberately bound to a LAN interface, `/health`, `/ready`, `/diagnostics`, and `/overlay/config` remain loopback-only. This prevents adapter state, module health, local persistence details, and creator presentation settings from becoming unauthenticated network disclosures. Browser overlays are intended to run on the same streaming machine as StreamBridge.
