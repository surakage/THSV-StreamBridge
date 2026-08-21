# THSV StreamBridge

A [Slothbloom](https://www.slothbloom.com/projects/thsv-streambridge) project.

THSV StreamBridge is a local-first, cross-platform livestream automation framework for creators who use Streamer.bot. It receives events from Twitch, YouTube, Kick, and TikTok through reviewed provider integrations, converts them into one predictable event format, and sends them through one shared automation and browser-overlay hub.

Instead of building a separate bot, socket, and overlay for every platform, StreamBridge gives the creator one installation, one authenticated setup wizard, one Streamer.bot connection, and reusable modules for chat, commands, alerts, timed messages, rewards, overlays, and future add-ons.

> **Version 4:** StreamBridge, its 23 bundled extension components, three built-in integrations, 11 optional add-ons, and all 41 generated Streamer.bot packages are synchronized at `4.0.1`. Version 4 replaces the former install-every-feature model with seven built-in extension groups, a single selectable Streamer.bot import, and separate downloads only for genuinely optional add-ons. Genuine provider acceptance remains separate; high-impact operations without verified provider-stable IDs stay blocked at runtime. See the [4.0.1 release notes](docs/releases/4.0.1.md).

## Start here

| Your situation | Follow this guide |
| --- | --- |
| Complete installation, wizard, and Streamer.bot setup | [Complete setup guide](docs/complete-setup-guide.md) |
| First installation | [Getting started](docs/getting-started.md) |
| First installation, simplified | [Beginner Bridge Core setup](docs/setup-for-beginners.md) |
| Updating an existing installation | [Update instructions](docs/getting-started.md#update) |
| Installing an optional add-on | [Add-on installation](docs/getting-started.md#7-install-an-optional-add-on) |
| Setting up optional add-ons, simplified | [Beginner add-on setup](docs/addon-setup-for-beginners.md) |
| Solving a startup or Windows block | [Troubleshooting](docs/troubleshooting.md) |
| Developing from source | [Source checkout setup](docs/setup.md) |

## What it does

| Area | Included functionality |
| --- | --- |
| Platforms | Twitch, YouTube, Kick, and TikTok through TikFinity, with provider-specific capability reporting and switches |
| Unified chat | Normalized messages, avatars, badges, ignored names, regular/compact/minimal cards, vertical or horizontal flow, selectable movement and alignment, platform colors, transparent backgrounds, event messages, and browser docks |
| Commands | Intake-owned add-on commands, creator-wins collision handling, source-platform gates, platform-specific replies, and an automatic viewer-safe command directory |
| Alerts | Follows, subscriptions/memberships, gifts, Bits/Cheers, Super Chats, raids, TikTok like milestones, profiles, sounds, images, priority, aggregation, and previews |
| Timed actions | Fixed or random stream-relative intervals, wizard editing groups that combine into one shared cross-platform list, shuffle without repeats, quiet-chat/live/scene gates, and missed-run policies |
| Rewards | Twitch and Kick redemption intake for reward-driven add-ons; reward creation and editing stay in Streamer.bot or the owning add-on's setup page |
| Browser overlays | Separate or combined Chat and Alerts sources for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible Chromium browser sources |
| Reliability | Durable Streamer.bot delivery outbox, restart replay, bounded retries, dead letters, deduplication, ordered lanes, health/readiness endpoints, and structured redacted logs |
| Add-ons | Version-bounded `.thsv-addon` packages, approval-gated inbox discovery, schema-rendered settings, private state, bounded scheduling, shared outbound chat, and hosted card/media overlays |
| Privacy and security | Loopback-only management, per-installation control token, secrets excluded from exports, bounded inputs, explicit live-action approvals, and creator-owned local data |

Streamer.bot remains the automation and decision engine. StreamBridge does not ask for or store Twitch, YouTube, Kick, or TikTok account passwords; those connections remain in Streamer.bot and TikFinity.

## Download and install

Public releases have a stable [Download StreamBridge](https://www.slothbloom.com/downloads/streambridge) address on SlothBloom, backed by the [official GitHub Releases page](https://github.com/surakage/THSV-StreamBridge/releases/latest). The website redirects to the exact current Windows x64 archive rather than duplicating executable files. The main archive includes the bridge, pinned Node.js runtime, production dependencies, installer, launchers, documentation, all built-in integrations and extension components, and the manifests used by the wizard's one-import generator. Optional add-ons remain separate ZIP downloads. Users do not need to install Node.js, npm, Docker, or a database.

1. Download `THSV-StreamBridge-4.0.1.zip` and its adjacent `.sha256` file from the latest Version 4 release.
2. Verify the download using [RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md). GitHub artifact attestations provide a free publisher-verification path without requiring a paid Windows code-signing certificate.
3. If Windows shows **Unblock** in the ZIP's Properties, select it before extracting.
4. Extract the ZIP to a temporary folder; do not run the installer from inside the ZIP preview.
5. Double-click **Install THSV StreamBridge.cmd**.
6. The installer creates a private local control token, saves a protected `THSV StreamBridge Recovery Key.txt` in the installed folder, starts the bridge, checks health, and opens the authenticated setup wizard.
7. In **Streamer.bot connection**, detect the running portable app or choose `Streamer.bot.exe`, configure any optional one-button apps, then create the optional **Start THSV Streaming Tools** desktop shortcut. It starts the same complete tool set as the Stream Deck target while avoiding duplicate and stale Streamer.bot WebSocket sessions.
8. Follow the [first-install walkthrough](docs/getting-started.md) and [Streamer.bot setup](docs/streamerbot-setup.md).

The installer keeps all launchers in the installed StreamBridge folder instead of adding Desktop clutter. `Start THSV Streaming Tools.cmd` starts or verifies Streamer.bot and StreamBridge together and can optionally start creator-selected OBS Studio and Speaker.bot executables first. Newly launched optional apps receive a short bounded stabilization window before Streamer.bot connects; an early optional-app exit is reported but never blocks core readiness. The launcher closes its console automatically after success but keeps failures visible. It can be selected directly in a Stream Deck **System → Open** action, and the wizard shows and copies its exact path.

The installer also starts the lightweight native Windows notification-area shell. Its THSV Village icon shows Bridge readiness and provides Setup Wizard, safe tool startup, Bridge start/stop, status refresh, and installed-folder shortcuts. It checks only the local `/ready` endpoint, never reads or displays the control token, never restarts a healthy service on its own, and notifies only when readiness changes. Exit affects the tray shell only; use `Open THSV StreamBridge Tray.cmd` in the installed folder to reopen it.

For an optional feature, download its matching `THSV-StreamBridge-AddOn-<Name>-<version>.zip`. Extract it and install the `.thsv-addon` through the wizard. Then return to **Streamer.bot → One Streamer.bot import**, select the enabled add-on, and generate one combined `.sb` file. The individual import inside an add-on bundle is a recovery option, not the normal setup path.

Default installation location: `%LOCALAPPDATA%\THSV StreamBridge`. Windows 10 or later and PowerShell 5.1 or later are required.

> **Windows 11 Smart App Control note:** machines with Smart App Control enabled can block the unsigned `.cmd` installer with no "Run anyway" option. Either unblock the verified ZIP before extracting (Properties → Unblock) or run `.\runtime\node.exe .\installer\install.mjs` from PowerShell in the extracted folder. See [Troubleshooting](docs/troubleshooting.md#smart-app-control-blocks-the-installer).

## First-time setup

1. Install core.
2. Enable Streamer.bot's WebSocket server on `127.0.0.1:8080`.
3. Import and wire the core Streamer.bot packages.
4. Open the wizard using the installed launcher.
5. Enable and test one platform at a time.
6. Add Chat and Alerts browser sources.
7. Install optional add-ons only after core events work.

The complete click-by-click sequence, exact launcher paths, receiver wiring, overlay URLs, verification checks, upgrade steps, and uninstall behavior are in [Getting started](docs/getting-started.md).

The **Commands** page provides an automatic [viewer command directory](docs/command-directory.md). Enabled add-ons register their commands through the existing platform Chat Message intakes, so creators do not generate or import duplicate Streamer.bot Command objects. Creator-made Streamer.bot commands remain separate and are never modified. Creators can either download a standalone HTML page for a host they control or opt into an authenticated creator-specific page on SlothBloom. The hosted option sends only public command metadata through one bounded HTTPS request; it never exposes localhost or opens an inbound internet port.

## Updating safely

The Bridge checks SlothBloom for newer stable releases when Streamer.bot connects or reconnects, then at most once every six hours while connected. GitHub is the automatic discovery fallback, and the authenticated wizard retains the latest result. **Download & prepare** verifies the exact Windows archive's adjacent SHA-256, tagged GitHub Actions provenance, archive paths, size limits, and release identity before preparing it in private staging. **Install verified update** is available only from a managed Windows installation and only while every platform is offline. It launches the existing rollback-aware portable installer, restarts StreamBridge, and reopens the wizard automatically; source checkouts continue to use the release installer directly.

To update, download and verify the newer release, extract it, and run its installer. The installer stages and verifies the new application, preserves creator-owned `data/` and add-on state, activates the new version, and checks startup health. A failed in-progress installation restores the working application transactionally; after success, every inactive application version is removed. Configuration, secrets, logs, backups, uploaded assets, and add-on state are not overwritten by the version swap.

See [Portable Windows release](docs/release.md) for backup, rollback, downgrade, and uninstall details.

## Add-ons

For the exact completed-versus-remaining acceptance cutoff, see [Published release and acceptance status](docs/release-candidate-status.md).

Stream Launch Countdown is included in the built-in **Broadcast Director** extension group and uses the core-hosted `/overlay/countdown` browser source. Select Broadcast Director when generating the one Streamer.bot import. See [Stream Launch Countdown](docs/starting-soon-countdown.md).

Add-ons must use the main StreamBridge installation. They reuse its normalized event bus, Streamer.bot connection, scheduler, private state, outbound router, and overlay transport instead of opening additional bridge instances or WebSockets.

Install a `.thsv-addon` through the authenticated Add-ons page, or copy it into `data/addons/inbox/` and review it there. Inbox packages are inspected but never installed or executed automatically. Executable add-ons run under the creator's Windows account, so install them only from trusted publishers. Planned projects and their safety requirements are tracked in the [future project and add-on roadmap](docs/future-projects-and-addons.md).

Optional add-ons are separate downloads on the same GitHub Release as core. Each has its own versioned `.thsv-addon`, SHA-256 checksum, and build-provenance attestation, so creators can update core without silently installing features they did not choose. The Add-ons page checks the official release index when the wizard unlocks and reports updates, compatibility problems, publisher mismatches, unlisted packages, or revocations. **Update safely** authenticates the outer release bundle, verifies both checksum layers, publisher identity, compatibility, and inner package identity, then replaces only that component's installed code while preserving its saved settings and private state. **Update all compatible** performs the same checks independently for each listed official update and continues safely if one package fails. When the authenticated bundle contains a matching Streamer.bot import, the updater preserves the verified `.sb` and checksum under `data/addons/inbox/streamerbot/` and tells the creator to re-import it; StreamBridge never silently rewrites Streamer.bot actions. **Download for review** retains the separate inbox-review workflow when desired; nothing installs without explicit approval. Future valid packages placed under the repository's `addons/` directory are discovered by release automation and published the same way.

Release packaging runs `npm run imports:sync` before validation. Every declared `.sb` is regenerated from its reviewed C# source, stale sibling exports are excluded, and `packages/streamerbot/import-index.json` records the canonical filename, version, size, and SHA-256. Add-on release bundles include the matching import plus its adjacent checksum, so extension and optional add-on imports cannot drift unnoticed from the source that produced the release.

Published packages are not automatically provider-accepted. Version 4 includes 23 extension components and three integrations in the main installation, with only 11 independently installable optional add-ons. Use the [Add-on acceptance ledger](docs/add-on-acceptance-ledger.md), [offline/private testing guide](docs/offline-acceptance.md), and [first-live checklist](docs/live-test-checklist.md) before enabling financial, reward, moderation, raid, outbound-chat, Discord, translation, voice, scene, or media side effects.

The wizard organizes frequently combined components into seven [main features](docs/main-features.md): Broadcast Director, Clip Engine, Community Rewards, Community Messaging, Community Insights, Community Play, and Voice & Language. They appear on the dedicated **Extensions** page. Separately installed packages appear on the dedicated **Add-ons** page with their install, update, and package-management controls. Existing component IDs, settings, Streamer.bot actions, and failure isolation remain compatible.

Native Streamlabs donation intake reuses Streamer.bot's existing authenticated WebSocket subscription, stores no provider credential, and requires a stable provider event or donation ID for every live financial event. Bloom Companion remains on the back burner.

[Village Jukebox](docs/addons/village-jukebox.md) is the current YouTube-first request-queue add-on. It remains disabled until its private resolver, commands, points/reward choices, browser source, and music-rights acknowledgement are configured.

Chat Guard defaults to observe-only behavior. Optional moderation modes require explicit double approval, one stable approved action, provider-capability checks, action-rate limits, and genuine live acceptance. See [Chat Guard](addons/chat-guard/README.md).

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

Version 4 keeps the v2 normalized-event and add-on API contract independently versioned at `2.0.0-preview.1`; compatibility checks describe the interface rather than the marketing release. Existing installations should follow the [Version 4 migration guide](docs/version-4-migration.md).

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
- Streamer.bot `1.0.7` stable is the supported baseline for new installations and regenerated THSV imports. It includes the 1.0.6 Custom Channel Rewards crash fix and restores website-authentication and anonymous update-check behavior. Complete the [stable 1.0.7 acceptance checks](docs/streamerbot-1.0.7-stable.md) after upgrading the host

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
- Native Twitch/YouTube emotes plus locally matched BTTV, FrankerFaceZ, and 7TV catalogs with readable text fallback
- Priority-aware public alerts with subscription lifecycle and gift provenance fields
- Loopback-only live WebSocket delivery and creator controls for duration, retention, bots, and simulated events
- Independently movable Chat and Alerts browser sources that share one WebSocket when the host supports `SharedWorker`

Use `http://127.0.0.1:8787/overlay/` for the combined canvas, add `http://127.0.0.1:8787/overlay/chat` and `http://127.0.0.1:8787/overlay/alerts` as independently movable Browser layers/sources, or add `http://127.0.0.1:8787/overlay/chat/dock` as an interactive multichat dock. The dock can reply to one enabled platform or all enabled platforms through the existing Streamer.bot connection. It prefers the connected creator account where Streamer.bot supports account selection and falls back to the connected bot account when needed. Chat appearance and ignored names are saved from the authenticated wizard. Follow the [Browser Overlay Hub guide](docs/browser-overlay.md). The same local overlay routes work as OBS Browser Sources, Meld Browser layers, and Streamlabs Desktop Browser Sources. Scene and streaming automation must use the matching OBS, Meld, or Streamlabs trigger in Streamer.bot; only the OBS/Aitum multi-output helper is OBS-specific.

## Viewer foundation and community insights

Viewer Foundation and Community Analytics are installed integrations in the current Bridge. Viewer Foundation provides salted identity resolution, replay-safe progression, permissioned consumers, and authenticated local administration. Community Analytics uses those identities for bounded session attendance and interaction counters without storing chat text or names. Retired Viewer Progression, Bloom Companion, and Speaker.bot Orchestration code and imports are not shipped or loaded. See [Viewer Foundation](docs/viewer-foundation.md) and [Main features](docs/main-features.md).

## Setup wizard

Stages 3 through 9 provide an authenticated loopback wizard at `http://127.0.0.1:8787/wizard/`. Normal users should run **THSV StreamBridge - Open Setup Wizard** in Streamer.bot or the installed **Open THSV Setup Wizard** launcher. The launcher creates a 60-second, single-use local ticket and opens the wizard already unlocked; it never places the permanent token in the URL or browser history, and it does not restart a healthy Bridge. Manual token entry remains an advanced recovery fallback. A portable installation keeps its unique token privately under `data/secrets/control-token` and writes a protected `THSV StreamBridge Recovery Key.txt` in the installation folder for easy recovery. The authenticated wizard can download another copy or copy the token when needed. A source checkout uses the path configured by `security.controlTokenFile`. The token stays local and is never included in ordinary configuration exports.

Streamer.bot inspection sends only documented `GetActions` and `GetCommands` requests. Creator-approved command administration is limited to commands already tracked by THSV StreamBridge; unrelated commands remain read-only. Configuration drafts cover platform switches, scoped blockers, command settings, and timed actions. One tab holds the mutation lease; commit rechecks the source file hash, validates the complete candidate, creates a backup, writes atomically, verifies the result, and restores the backup on failure. Safe exports omit secrets. Restart StreamBridge after committing configuration.

## TikFinity intake

The reviewed TikFinity-to-Streamer.bot intake relays TikTok chat, follows, gifts, 100-like milestones, and subscriptions. Import `packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-4.0.2.sb`, keep TikFinity pointed at `127.0.0.1:8080/`, and enable the `tiktok` platform only after the simulator acceptance check in [Streamer.bot setup](docs/streamerbot-setup.md).

TikFinity does not currently document a stable source-event ID or reliable simulator marker. Intake events therefore expose those limitations explicitly and default to simulated until live provenance is verified; do not use them for production progression or financial statistics yet.

## Native Streamer.bot platform intake

Twitch, YouTube, and Kick use one native intake action per platform, each placed in its own Streamer.bot group. Import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-4.0.2.sb`, configure the trigger matrix declared in its manifest, and enable each platform with adapter `streamerbot-native`. Native triggers reuse the existing authenticated Streamer.bot WebSocket connection, preserve Streamer.bot's test-event provenance, and carry a known first-ever-message flag without guessing when the field is absent.

The native intake also relays documented Twitch and YouTube emote ranges. StreamBridge locally matches BTTV for Twitch/YouTube, FrankerFaceZ for Twitch, and 7TV for Twitch/YouTube/Kick; unavailable catalogs and image failures preserve the original emote code as text.

Stage 8 adds Twitch and Kick reward-redemption intake to those native actions. The separate triggerless `THSV StreamBridge - Reward Administration` package exposes only documented, creator-approved Twitch operations; Kick mutations are hidden and rejected until Streamer.bot documents them. See [Channel rewards](docs/rewards.md).

## Extension and add-on packages

Stage 9 adds hash-verified, version-bounded optional module packages plus an authenticated Add-ons page in the local wizard. A declarative package can expose schema-validated settings without executing add-on code. Executable packages receive scoped handles for private state, bounded scheduling, exact creator-approved Streamer.bot actions through the bridge's single connection, and core-hosted namespaced card/media overlays with playback lifecycle reports. They still run with StreamBridge's Windows-account permissions, so the broker is not an operating-system sandbox and installation requires explicit creator approval. Packages copied into `data/addons/inbox/` are inspected and listed but never auto-installed. A failed or corrupted add-on is shown as rejected without stopping required core modules. Start with `examples/addons/declarative-settings/`, the [add-on developer guide](docs/add-on-development.md), the [capability broker reference](docs/add-on-capabilities.md), and the [future project roadmap](docs/future-projects-and-addons.md).

Official Version 4 downloads include one main StreamBridge archive and 11 independently installable optional add-ons. The 23 components in the seven extension groups are bundled in the main archive and are not duplicated as add-on downloads. Each optional add-on ZIP contains the matching `.thsv-addon`, installation notes, checksums, and a recovery `.sb` import only when it needs Streamer.bot actions. Normal setup uses the wizard to generate one combined import for the selected extensions and add-ons. Privacy-sensitive or externally mutating features start disabled, and creator-specific live acceptance remains separate from automated packaging. See the [main feature guide](docs/main-features.md) and [add-on setup guide](docs/addon-setup-for-beginners.md).

## Source development

A separate Node.js 22.22.2 or later installation is required only when developing from source:

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

See [Getting started](docs/getting-started.md), [Main features](docs/main-features.md), [Channel rewards](docs/rewards.md), [milestone checklist](docs/milestones.md), [setup](docs/setup.md), [architecture](docs/architecture.md), [configuration](docs/configuration.md), [testing](docs/testing.md), [security](docs/security.md), [troubleshooting](docs/troubleshooting.md), [Streamer.bot setup](docs/streamerbot-setup.md), [Browser Overlay Hub](docs/browser-overlay.md), and the [future project and add-on roadmap](docs/future-projects-and-addons.md).

For a versioned archive, checksum verification, state-preserving upgrades, and uninstall instructions, use the [Installer and public release guide](docs/release.md).

Reliability checks are available in **Test & finish**: version-bound live acceptance with exact invalidation reasons and periodic due dates, one-click expectations and creator-approved reconciliation from detected OBS scene/source reports, an exact snapshot preview before support-bundle download, exportable and locally comparable sanitized pre-stream reports, and the installed build fingerprint. Source maintainers can run `npm.cmd run test:startup-chaos` to exercise isolated early-exit, port-conflict, crash-loop, and installer-rollback scenarios. Tagged release packaging is gated on that harness plus clean-install, same-version repair, and previous-release upgrade tests against the actual built ZIP on Windows.

Version 4 release: [THSV StreamBridge v4.0.1](https://github.com/surakage/THSV-StreamBridge/releases/tag/v4.0.1). Use the latest release page rather than an unverified source archive.

## License

THSV StreamBridge is open-source software licensed under the [MIT License](LICENSE).

## Copyright

Copyright (c) 2026 surakage. THSV StreamBridge source code and original documentation are provided under the MIT License. Third-party software, platform names, service marks, dependencies, and archived assets remain the property of their respective owners and are covered by their own licenses or terms.

Archived Bloom asset provenance and production dependency licenses are documented in [Asset and third-party notices](THIRD-PARTY-NOTICES.md).
