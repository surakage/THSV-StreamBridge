# THSV StreamBridge

A [Slothbloom](https://slothbloom.com) project.

THSV StreamBridge is a local-first, cross-platform livestream automation framework for creators who use Streamer.bot. It receives events from Twitch, YouTube, Kick, and TikTok through reviewed provider integrations, converts them into one predictable event format, and sends them through one shared automation and browser-overlay hub.

Instead of building a separate bot, socket, and overlay for every platform, StreamBridge gives the creator one installation, one authenticated setup wizard, one Streamer.bot connection, and reusable modules for chat, commands, alerts, timed messages, rewards, overlays, and future add-ons.

> **Release status:** `2.0.0-rc.4` is the current v2 release candidate. Its automated suites and packaged Windows installer acceptance pass, while the final live high-impact provider-event matrix remains required before a stable v2 production release. High-impact operations without verified provider-stable IDs remain blocked. See the [production-readiness gate](docs/production-readiness.md). Stable `1.x` remains available from the official releases page.

## What it does

| Area | Included functionality |
| --- | --- |
| Platforms | Twitch, YouTube, Kick, and TikTok through TikFinity, with provider-specific capability reporting and switches |
| Unified chat | Normalized messages, avatars, badges, ignored names, compact/regular layouts, platform colors, transparent backgrounds, event messages, and browser docks |
| Commands | Wizard-designed commands, editable action names and templates, source-platform gates, platform-specific replies, cooldown metadata, editable C#, and Streamer.bot package export |
| Alerts | Follows, subscriptions/memberships, gifts, Bits/Cheers, Super Chats, raids, TikTok like milestones, profiles, sounds, images, priority, aggregation, and previews |
| Timed actions | Fixed or random stream-relative intervals, separate per-platform message lists, shuffle without repeats, quiet-chat/live/scene gates, and missed-run policies |
| Rewards | Twitch and Kick redemption intake plus explicitly approved Twitch reward administration; undocumented Kick mutations remain disabled |
| Browser overlays | Separate or combined Chat and Alerts sources for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible Chromium browser sources |
| Reliability | Durable Streamer.bot delivery outbox, restart replay, bounded retries, dead letters, deduplication, ordered lanes, health/readiness endpoints, and structured redacted logs |
| Add-ons | Version-bounded `.thsv-addon` packages, approval-gated inbox discovery, schema-rendered settings, private state, bounded scheduling, shared outbound chat, and hosted card/media overlays |
| Privacy and security | Loopback-only management, per-installation control token, secrets excluded from exports, bounded inputs, explicit live-action approvals, and creator-owned local data |

Streamer.bot remains the automation and decision engine. StreamBridge does not ask for or store Twitch, YouTube, Kick, or TikTok account passwords; those connections remain in Streamer.bot and TikFinity.

## Download and install

Public releases are distributed as self-contained Windows x64 ZIP files from the [official GitHub Releases page](https://github.com/surakage/THSV-StreamBridge/releases). The archive includes the bridge, pinned Node.js runtime, production dependencies, installer, launchers, documentation, and reviewed Streamer.bot packages. Users do not need to install Node.js, npm, Docker, or a database.

1. Download `THSV-StreamBridge-<version>.zip` and its adjacent `.sha256` file.
2. Verify the download using [RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md). GitHub artifact attestations provide a free publisher-verification path without requiring a paid Windows code-signing certificate.
3. Extract the ZIP.
4. Double-click **Install THSV StreamBridge.cmd**.
5. The installer creates a private local control token, starts the bridge, checks health, and opens the authenticated setup wizard.
6. Follow [Streamer.bot setup](docs/streamerbot-setup.md) to import the supplied packages, add only the [approved trigger matrix](docs/streamerbot-trigger-matrix.md), and connect the WebSocket server.

Default installation location: `%LOCALAPPDATA%\THSV StreamBridge`. Windows 10 or later and PowerShell 5.1 or later are required.

## First-time setup

1. Start Streamer.bot and enable its WebSocket server on `127.0.0.1:8080`.
2. Import the packages listed in [Streamer.bot setup](docs/streamerbot-setup.md), accepting custom C# only after verifying the package came from this repository. The Bridge Launcher includes an editable install-path **Set Argument**, so custom paths never require C# edits.
3. Confirm the required compiler references using [Streamer.bot C# references](docs/streamerbot-csharp-references.md).
4. Open `http://127.0.0.1:8787/wizard/` or use **Open THSV Setup Wizard.cmd**.
5. Enable only the platforms you have connected and configure Chat, Alerts, Commands, Timed Actions, and Rewards.
6. Add `http://127.0.0.1:8787/overlay/chat` and `http://127.0.0.1:8787/overlay/alerts` as browser sources.
7. Run simulated fixtures before enabling live automation.

## Updating safely

The wizard can check the official GitHub repository for a newer stable release and display its notes and verified release link. It never silently replaces a running bridge.

To update, download and verify the newer release, extract it, and run its installer. The installer stages and verifies the new application, preserves creator-owned `data/` and add-on state, activates the new version, checks startup health, and rolls back to the previous version if activation fails. The active and previous application versions are retained; configuration, secrets, logs, backups, uploaded assets, and add-on state are not overwritten by the version swap.

See [Portable Windows release](docs/release.md) for backup, rollback, downgrade, and uninstall details.

## Add-ons

Add-ons must use the main StreamBridge installation. They reuse its normalized event bus, Streamer.bot connection, scheduler, private state, outbound router, and overlay transport instead of opening additional bridge instances or WebSockets.

Install a `.thsv-addon` through the authenticated Add-ons page, or copy it into `data/addons/inbox/` and review it there. Inbox packages are inspected but never installed or executed automatically. Executable add-ons run under the creator's Windows account, so install them only from trusted publishers. Planned projects and their safety requirements are tracked in the [future project and add-on roadmap](docs/future-projects-and-addons.md).

## Privacy and security

- Management, diagnostics, simulation, and overlays bind to loopback by default.
- Mutating controls require the installation's random bearer token.
- Streamer.bot authentication secrets are read from environment/local secret storage, never committed configuration.
- Safe exports omit tokens, passwords, connection URLs, uploaded files, and runtime history.
- Logs are structured, bounded, rotated, and redact registered sensitive values.
- Pending Streamer.bot deliveries survive restarts; failed deliveries use bounded retry and dead-letter handling.
- Default uninstall preserves creator data. Permanent deletion requires a separate double-confirmed command.
- Package hashes prove byte integrity, not publisher identity; release attestations or a separately trusted publisher channel are still required.

Review [Security](docs/security.md), [release verification](RELEASE-VERIFICATION.md), and [integration assumptions](docs/integration-assumptions.md) before using financial, reward, or destructive automation.

The `overhaul/v2-preview` branch is the isolated `2.0.0-rc.3` release-candidate line for the approved revised core scope. The normalized v2 contract and reviewed Streamer.bot component packages retain their `2.0.0-preview.1` compatibility identifier during RC acceptance; stable `1.x` remains on `main`. Stages 2 through 9 are implemented: v2 contracts, compatibility migration preview, excluded-feature extraction, the module host, the authenticated setup wizard, provider-authoritative capability reports, platform controls, scoped blocker rules, Streamer.bot command design and synchronization, session-relative timed actions, configurable browser alerts, documented channel-reward intake and administration, packaging, and the add-on API. See [Stage 2 completion](docs/stage-2-completion.md), [Stage 3 completion](docs/stage-3-completion.md), [Stage 4 completion](docs/stage-4-completion.md), [Stage 5 completion](docs/stage-5-completion.md), [Stage 6 completion](docs/stage-6-completion.md), [Stage 7 completion](docs/stage-7-completion.md), [Stage 8 completion](docs/stage-8-completion.md), [Stage 9 completion](docs/stage-9-completion.md), [Channel rewards](docs/rewards.md), [Revised product scope](docs/product-scope.md), [v2 contracts](docs/contracts-v2.md), and [module system](docs/module-system.md).

This is a clean rebuild and has no dependency on earlier Streamer.bot, Speaker.bot, overlay, chatbot, or JSON projects.

## Implementation history

### Milestone 1

Bridge Core includes:

- A versioned normalized event contract and runtime validation
- Bounded TTL deduplication and an internal event bus
- Independently enabled platform adapters with honest capability reporting
- A deterministic mock adapter and event simulator
- A Streamer.bot output adapter with challenge authentication, durable at-least-once delivery, restart replay, bounded retries/dead letters, ordered lanes, acknowledgements, and explicit test mode
- Structured redacted logs, bounded log rotation, atomic local state, and graceful lifecycle handling
- Token-protected loopback HTTP controls plus health, readiness, diagnostics, and simulation endpoints
- Deterministic unit and integration tests that need no accounts or live stream

TikFinity production transport and direct broadcasting-app scene control are deliberately deferred. TikFinity fixtures are marked unverified.

### Milestone 2

Streamer.bot Package Foundation adds:

- A versioned, portable `THSV StreamBridge - Receive Event` action package
- Reviewed C# receiver source with normalized-event validation
- A stable platform-neutral action-argument contract for future packages
- Automated checks that the exported package contains the reviewed source
- Live validation against Streamer.bot `1.0.5-alpha.31`

Import the package and follow the instructions in the [Streamer.bot receiver package](packages/streamerbot/core-receiver/README.md).

### Milestone 3

Multi-Chat adds:

- One platform-neutral chat projection for every supported normalized `chat.message` event
- A portable `THSV StreamBridge - Multi-Chat` Streamer.bot action package
- Validated plain-text messages, consistent user identity and role flags, and safe non-chat handling
- Deterministic offline fixtures for Twitch, YouTube, Kick, and TikTok

Import the package and follow the inline action-chain instructions in the [Multi-Chat package guide](packages/streamerbot/multi-chat/README.md). Production platform transports remain deferred; these fixtures prove the shared contract without claiming live platform API support.

### Milestone 4

Multi-Commands adds:

- Deterministic command parsing with case-insensitive canonical names, aliases, quoted arguments, and explicit limits
- One creator-facing command prefix and definition registry applied centrally to raw chat from every adapter
- Portable viewer, subscriber/member, moderator, broadcaster, and bot authorization policy
- A public command boundary that excludes private and operator commands
- A versioned `THSV StreamBridge - Multi-Commands` Streamer.bot package
- Offline command fixtures for Twitch, YouTube, Kick, and TikTok

Import the package and follow the inline action-chain instructions in the [Multi-Commands package guide](packages/streamerbot/multi-commands/README.md). Command arguments remain inert data; Streamer.bot creator actions decide what authorized commands do.

### Milestone 5

Multi-Alerts adds:

- One public alert contract for follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and milestones
- Exact bounded decimal-string monetary values, ISO currency validation, and safe integer quantities
- Normalized actor identity, event ordering, Unicode-safe inert text, and honest transport-verification metadata
- A versioned `THSV StreamBridge - Multi-Alerts` Streamer.bot package with no rendering, sound, TTS, globals, or platform output

Import the package and follow the inline action-chain instructions in the [Multi-Alerts package guide](packages/streamerbot/multi-alerts/README.md). Browser-source presentation is Milestone 8. Speaker.bot orchestration is outside Stage 2 core and is preserved in the future-add-on archive.

### Milestone 7

Multi-Timed Actions adds:

- Creator-configured intervals measured from each stream-session start
- Fixed timed actions or persistent random message containers with no repeats until every message is used
- Explicit `skip` or single catch-up behavior for occurrences missed while the bridge is stopped
- Atomic restart state and deterministic occurrence identities
- Normalized `system.timed` events with scheduled time, actual fire time, lateness, occurrence, and missed-run counts
- A triggerless concurrent `THSV StreamBridge - Multi-Timed Actions` package that exposes inert data while leaving action selection to Streamer.bot
- A triggerless `THSV StreamBridge - Send Timed Message` output action with independent Twitch, YouTube, Kick, and TikFinity switches; simulated wizard tests never post externally

Configure schedules in `timedActions.definitions`, then import the packages described in the [Multi-Timed Actions guide](packages/streamerbot/multi-timed-actions/README.md) and [Timed Message Output guide](packages/streamerbot/timed-message-output/README.md). The example starts with no scheduled definitions, so installing the bridge never creates surprise automation.

### Milestone 8

Browser Overlay Hub adds one local transparent browser source for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible broadcast software, with:

- Unified public chat with bounded in-memory retention and message-deletion correlation
- Context-safe text rendering with no HTML injection sinks
- Platform, role, bot, badge, avatar, and validated name-color presentation
- Priority-aware public alerts with subscription lifecycle and gift provenance fields
- Loopback-only live WebSocket delivery and creator controls for duration, retention, bots, and simulated events
- Independently movable Chat and Alerts browser sources that share one WebSocket when the host supports `SharedWorker`

Use `http://127.0.0.1:8787/overlay/` for the combined canvas, add `http://127.0.0.1:8787/overlay/chat` and `http://127.0.0.1:8787/overlay/alerts` as independently movable Browser layers/sources, or add `http://127.0.0.1:8787/overlay/chat/dock` to a compatible custom browser dock. Chat appearance and ignored names are saved from the authenticated wizard. Follow the [Browser Overlay Hub guide](docs/browser-overlay.md). Combined and separate-source rendering are live-verified in Meld Studio and OBS Studio; OBS is the accepted Streamlabs Browser Source compatibility gate.

## Archived future add-ons

The former Viewer Identity and Progression, Bloom Companion, and Speaker.bot Orchestration implementations are no longer core features. Their source, packages, tests, documentation, and assets are preserved under `archive/future-add-ons/` until they can be rebuilt against the public module API. Core does not load their state, expose their endpoints, emit their legacy events, or serve their browser surfaces. See [Future add-ons](docs/future-add-ons.md).

## V2 preview setup wizard

Stages 3 through 9 provide an authenticated loopback wizard at `http://127.0.0.1:8787/wizard/`. A portable installation keeps its unique token under `data/secrets/control-token`; a source checkout uses the path configured by `security.controlTokenFile`. The token stays local and is never included in configuration exports.

Streamer.bot inspection sends only documented `GetActions` and `GetCommands` requests. Creator-approved command administration is limited to commands already tracked by THSV StreamBridge; unrelated commands remain read-only. Configuration drafts cover platform switches, scoped blockers, command settings, and timed actions. One tab holds the mutation lease; commit rechecks the source file hash, validates the complete candidate, creates a backup, writes atomically, verifies the result, and restores the backup on failure. Safe exports omit secrets. Restart StreamBridge after committing configuration.

## TikFinity intake

The reviewed TikFinity-to-Streamer.bot intake relays TikTok chat, follows, gifts, 100-like milestones, and subscriptions. Import `packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-1.1.0.sb`, keep TikFinity pointed at `127.0.0.1:8080/`, and enable the `tiktok` platform only after the simulator acceptance check in [Streamer.bot setup](docs/streamerbot-setup.md).

TikFinity does not currently document a stable source-event ID or reliable simulator marker. Intake events therefore expose those limitations explicitly and default to simulated until live provenance is verified; do not use them for production progression or financial statistics yet.

## Native Streamer.bot platform intake

Twitch, YouTube, and Kick use one native intake action per platform, each placed in its own Streamer.bot group. Import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.4.0.sb`, configure the trigger matrix declared in its manifest, and enable each platform with adapter `streamerbot-native`. Native triggers reuse the existing authenticated Streamer.bot WebSocket connection and preserve Streamer.bot's test-event provenance.

Stage 8 adds Twitch and Kick reward-redemption intake to those native actions. The separate triggerless `THSV StreamBridge - Reward Administration` package exposes only documented, creator-approved Twitch operations; Kick mutations are hidden and rejected until Streamer.bot documents them. See [Channel rewards](docs/rewards.md).

## V2 add-on packages

Stage 9 adds hash-verified, version-bounded optional module packages plus an authenticated Add-ons page in the local wizard. A declarative package can expose schema-validated settings without executing add-on code. Executable packages receive scoped handles for private state, bounded scheduling, exact creator-approved Streamer.bot actions through the bridge's single connection, and core-hosted namespaced card/media overlays with playback lifecycle reports. They still run with StreamBridge's Windows-account permissions, so the broker is not an operating-system sandbox and installation requires explicit creator approval. Packages copied into `data/addons/inbox/` are inspected and listed but never auto-installed. A failed or corrupted add-on is shown as rejected without stopping required core modules. Start with `examples/addons/declarative-settings/`, the [add-on developer guide](docs/add-on-development.md), the [capability broker reference](docs/add-on-capabilities.md), and the [future project roadmap](docs/future-projects-and-addons.md).

## Source development

A separate Node.js 22 installation is required only when developing from source:

```powershell
Set-Location 'F:\The Hidden Sloth Village\THSV StreamBridge'
.\scripts\install.ps1
.\scripts\start.ps1
.\scripts\health.ps1
npm run simulate
.\scripts\stop.ps1
```

Use `npm run dev` when editing source and you want automatic restarts. Development mode participates in the same authenticated single-instance lifecycle as the normal launcher: it waits for any in-progress launch, shuts down an existing local Bridge, and then starts the watcher. A second `npm run dev` therefore replaces the first instead of failing on port 8787; the earlier command returns to its prompt without forcibly closing the PowerShell window itself.

The checked-in example uses live Streamer.bot delivery and will report not-ready until Streamer.bot's WebSocket server is available. For a network-free check, copy the configuration and explicitly set `streamerbot.testMode` to `true`. Test mode is clearly reported as non-live in diagnostics and never contacts Streamer.bot.

To create creator-specific settings, copy `config/bridge.example.json` into `data/runtime`, edit the copy, and pass it to `start.ps1 -Config <path>`. Do not place credentials in JSON. A per-installation control token is generated automatically in ignored runtime storage.

See the [Stage 2 completion record](docs/stage-2-completion.md), [Stage 3 completion record](docs/stage-3-completion.md), [Stage 4 completion record](docs/stage-4-completion.md), [Stage 5 completion record](docs/stage-5-completion.md), [Stage 6 completion record](docs/stage-6-completion.md), [Stage 7 completion record](docs/stage-7-completion.md), [Stage 8 completion record](docs/stage-8-completion.md), [Stage 9 completion record](docs/stage-9-completion.md), [Channel rewards](docs/rewards.md), [milestone checklist](docs/milestones.md), [setup](docs/setup.md), [architecture](docs/architecture.md), [configuration](docs/configuration.md), [testing](docs/testing.md), [security](docs/security.md), [troubleshooting](docs/troubleshooting.md), [Streamer.bot setup](docs/streamerbot-setup.md), [Browser Overlay Hub](docs/browser-overlay.md), [Future add-ons](docs/future-add-ons.md), and the [future project and add-on roadmap](docs/future-projects-and-addons.md).

For a versioned archive, checksum verification, state-preserving upgrades, and uninstall instructions, use the [Installer and public release guide](docs/release.md).

Latest stable release: [THSV StreamBridge v1.0.1](https://github.com/surakage/THSV-StreamBridge/releases/tag/v1.0.1).

## License

THSV StreamBridge is open-source software licensed under the [MIT License](LICENSE).

## Copyright

Copyright (c) 2026 surakage. THSV StreamBridge source code and original documentation are provided under the MIT License. Third-party software, platform names, service marks, dependencies, and archived assets remain the property of their respective owners and are covered by their own licenses or terms.

Archived Bloom asset provenance and production dependency licenses are documented in [Asset and third-party notices](THIRD-PARTY-NOTICES.md).
