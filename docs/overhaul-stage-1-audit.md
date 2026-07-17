# Revised-core overhaul: Stage 1 audit

Audit date: July 17, 2026  
Audited revision: `e74080ccb89d79175e738f6e4cc1af2f1eb5cdb2` (`main`, bridge `1.0.1`)  
Checkpoint: `checkpoint/pre-core-overhaul-2026-07-17` (pushed to `origin`)  
Working tree at audit start: clean tracked files; pre-existing untracked `.claude/` directory left untouched  
Baseline: lint and typecheck clean; 42 test files and 190 tests passed

This document is the required Stage 1 migration report. It proposes changes but performs no Stage 2 extraction, deletion, or product refactoring.

## 1. Current-state inventory

### Runtime composition

- `apps/bridge-service.ts` composes configuration, logging, adapter registry, deduplication, control-token security, Streamer.bot delivery, browser overlays, viewer progression, viewer links, and Bloom Companion.
- `bridge/core/bridge.ts` validates, deduplicates, sequences, derives commands, tracks stream-live state, controls timers, resolves viewer progression, spends companion points, publishes derived events, routes outputs, and exposes administrative operations.
- `bridge/services/http-server.ts` combines health/readiness, simulation, shutdown, timed-action control, viewer-progression administration, companion administration, and static overlay assets.
- `bridge/adapters/registry.ts` is a trusted factory registry, but it is an adapter registry rather than the required framework module registry.
- The runtime requires a mock adapter even outside tests because the configuration schema requires one simulation-capable platform entry.

### Platform and output adapters

| Component | Current role | Revised-core disposition |
|---|---|---|
| `adapter.ts` | Adapter lifecycle/status and capability declarations | Retain and expand |
| `normalization.ts` | Normalized-event construction and capability assertions | Retain and move behind versioned contracts |
| `streamerbot-native-adapter.ts` | Twitch/YouTube/Kick relay intake | Retain and split platform mapping tables if needed |
| `tikfinity-adapter.ts` | Conservative TikFinity relay intake | Retain; keep unverified fields explicit |
| `streamerbot-adapter.ts` | WebSocket output and action acknowledgement | Retain |
| `timed-actions-adapter.ts` | Session-relative timed scheduling and shuffle containers | Retain and extend |
| `mock-adapter.ts` | Simulation | Retain as diagnostics/test infrastructure, not a mandatory production platform |
| `placeholder-adapter.ts` | Disabled/unimplemented transport representation | Retain only if diagnostics still needs it |

The current capability vocabulary is too coarse: it has `chatInput`, `chatOutput`, `follows`, `subscriptions`, `gifts`, `donations`, `raids`, `moderation`, `engagement`, `channelUpdates`, and `timedActions`. It lacks explicit `commands`, `giftSubscriptions`, `cheers`, `channelRewards`, and platform-specific operation support.

### Built-in feature code

| Module | Current implementation | Gap against revised scope |
|---|---|---|
| Multi-Chat | Normalized projection, identity presentation, roles, timestamps, sequence, bot type, length bounds, overlay projection, deletion correlation | No blocker engine, reply projection, configurable per-platform visibility, or protected operator view |
| Multi-Commands | Parser, aliases, role authorization, collision validation, inert arguments, normalized projection | No CRUD wizard, response/action metadata, platform targeting, cooldown model, import/export, or supported synchronization workflow |
| Multi-Alerts | Strict normalized projection, decimal-string money, stable source-ID requirement, browser payload | No templates, priority configuration, duration/sound settings, aggregation, blocker/sanitization policy, or public success hook distinct from raw intake |
| Multi-Timed Actions | Session intervals, first-run delay, missed-run policy, fixed/shuffle selection, no-repeat container state | No random interval, activity/quiet-chat rules, scene/platform conditions, action ownership/sync, CRUD service, or templates |
| Browser Overlay | Chat/alert rendering, bounded queues, deletion handling, XSS-safe DOM text rendering, one shared event WebSocket | Companion is embedded in the same contract, routes, JavaScript, CSS, configuration, and asset server |
| Filters | Not implemented | New core module required |
| Rewards | Not implemented as a normalized contract/module | Separate Twitch and Kick capability-aware modules required |
| Wizard | Not implemented | New staged core module required |
| Module registry | Not implemented | New core host contract and lifecycle registry required |

### Streamer.bot packages

Retained core candidates:

- Core Receiver `1.0.4`
- Multi-Chat `1.1.1`
- Multi-Commands `1.1.0`
- Multi-Alerts `1.0.1`
- Multi-Timed Actions `1.0.0`
- Native Platform Intake `1.0.0`
- TikFinity Intake `1.0.0`

Excluded from revised core:

- Viewer Progression `1.0.0`
- Bloom Companion `1.1.0`
- Speaker Orchestration `1.0.1` (not named in the exclusive revised-core feature list; preserve as a potential add-on)

Current package manifests describe runtime dependencies but do not implement the requested versioned module-manifest contract or framework object ownership registry.

### Storage and operational tooling

Retain atomic state writes, bounded/rotated structured logs, deduplication state, control-token handling, installation, upgrades, downgrade protection, backup, release manifests, checksum verification, and uninstall behavior.

Current core-incompatible stores are `viewer-progression.json`, viewer links in local configuration, and `companion.json`. Timed-action state and deduplication state are valid core storage. Command cooldown state should remain in Streamer.bot where its documented command cooldown operations are sufficient; any bridge fallback must be minimal, bounded, and keyed by platform plus stable user ID without creating a viewer profile.

## 2. Dependency graph

```text
apps/bridge-service.ts
├─ core host: StreamBridge
│  ├─ normalized event schema
│  ├─ deduplicator + persisted dedup store
│  ├─ event bus + output delivery manager
│  ├─ command derivation
│  ├─ timed-actions controller
│  ├─ ViewerProgressionEngine                 [excluded hard dependency]
│  │  ├─ ViewerProgressionStore               [excluded]
│  │  └─ ViewerLinkStore                      [excluded]
│  └─ CompanionEngine                         [excluded hard dependency]
│     ├─ CompanionStore                       [excluded]
│     └─ ViewerProgressionEngine              [excluded]
├─ adapter registry
│  ├─ native Streamer.bot relay
│  ├─ TikFinity relay
│  ├─ timed actions
│  ├─ mock simulation
│  └─ Streamer.bot output
├─ DiagnosticsServer
│  ├─ core diagnostics and controls
│  ├─ viewer progression endpoints            [excluded]
│  ├─ companion endpoint                      [excluded]
│  └─ overlay static assets
└─ BrowserOverlayHub
   └─ browser-overlay projection
      ├─ Multi-Chat
      ├─ Multi-Alerts
      └─ Companion action                     [excluded contract branch]
```

The excluded systems are not isolated plugins today. They cross the composition root, core class, configuration schema, event schema, diagnostics interface, HTTP routes, overlay projection, static assets, tests, documentation, packaging, and Streamer.bot receiver arguments.

## 3. Core-versus-add-on classification

### Revised core

- Adapter lifecycle, capability reporting, platform configuration, normalization, validation, deduplication, sequencing, routing, delivery, logging, security, diagnostics, and module lifecycle.
- Twitch, YouTube, and Kick intake through verified Streamer.bot triggers; TikTok through conservative TikFinity relay mappings.
- Multi-Chat, Multi-Commands, Multi-Alerts, Multi-Timed Actions, Chat Filters, Twitch Rewards, Kick Rewards, Wizard, Diagnostics, installation, backup, export, update, and optional browser overlays for chat/alerts.
- Minimal bounded cooldown/synchronization/ownership state only.

### Future optional add-ons

- Viewer identity linking, points, progression, XP, levels, inventories, economy, and viewer statistics.
- Bloom Companion and all mood/fullness/energy/sleep/point-spending behavior and visual assets.
- Speaker.bot orchestration.
- Goal trackers, stream labels, games, combat, quests, wagering, gambling, competitive systems, and AI engagement.

Core must expose contracts these add-ons can consume, but must not import them or require their configuration/state.

## 4. Files proposed for retention

- `bridge/adapters/` except that mappings and capabilities require refactoring.
- `bridge/core/deduplicator.ts`, `delivery-manager.ts`, `event-bus.ts`.
- `bridge/core/multi-chat.ts`, `multi-commands.ts`, `multi-alerts.ts`, `multi-timed-actions.ts`.
- `bridge/services/atomic-state.ts`, `config-loader.ts`, `control-token.ts`, `deduplication-store.ts`, `logger.ts`, `request-guard.ts`, and the generic portion of `browser-overlay-hub.ts`.
- Core Streamer.bot packages listed above.
- Chat/alert portions of `overlays/browser/`.
- Installer, release, backup, health, simulation, lifecycle, and validation scripts.
- Existing tests for retained behavior, especially validation, deduplication, ordering, delivery pressure, security, adapters, overlays, installers, and packages.

## 5. Files proposed for refactoring

- `apps/bridge-service.ts`: become a small composition root over a module registry; remove direct excluded-engine construction.
- `bridge/core/bridge.ts`: keep transport-neutral ingest/routing only; move command, timer, filter, alert, and reward behavior into registered modules.
- `bridge/services/http-server.ts`: split health/control API, wizard API, diagnostics export, and static assets; remove excluded administration.
- `schemas/event.ts` and generated JSON schema: publish versioned core contracts, add reward redemptions and capability records, deprecate core `viewerId`, and remove excluded event types in a contract-major migration.
- `schemas/config.ts` and `config/bridge.example.json`: move to modular schemas, expand capability vocabulary, remove viewer/companion sections and Bloom commands, and stop requiring mock in production.
- `bridge/core/browser-overlay.ts`, `overlays/browser/app.js`, `styles.css`, and `http-server.ts` asset routes: retain chat/alerts and remove companion branches/assets.
- `bridge/adapters/streamerbot-native-adapter.ts`: keep platform-specific mapping within explicit Twitch, YouTube, and Kick mapper/provider boundaries.
- `bridge/adapters/registry.ts`: separate adapter registry from the new framework module registry.
- Core Receiver and Multi-Commands packages: remove progression attribution from the core contract while providing a deliberate compatibility window.
- Packaging scripts and documentation: package revised core by default and add add-on discovery/installation contracts later.

## 6. Files proposed for archival

Move intact, with history, into a build-excluded archive such as `archive/future-add-ons/` during Stage 2:

- `bridge/core/viewer-progression.ts`
- `bridge/services/viewer-progression-store.ts`
- `bridge/services/viewer-link-store.ts`
- `packages/streamerbot/viewer-progression/`
- `scripts/viewer-progression.ps1`
- `docs/viewer-identity.md`
- Viewer/progression tests and relevant historical design notes
- `bridge/core/companion.ts`
- `bridge/services/companion-store.ts`
- `packages/streamerbot/companion-actions/`
- `scripts/companion.ps1`
- `docs/companion.md`
- Companion tests, `prototypes/bloom-animation-preview/`, Bloom sprite assets, and the sprite-normalization tool
- `bridge/core/speaker-orchestration.ts`
- `packages/streamerbot/speaker-orchestration/`
- `docs/speakerbot-setup.md` and Speaker orchestration tests

The archive must contain a README per candidate add-on describing prior version, state format, extraction status, missing module manifest, and the rule that archived code is not shipped or loaded by core.

## 7. Files proposed for deletion

No tracked product file should be permanently deleted during the first extraction pass. After archival and one verified migration release, the following are deletion candidates:

- Obsolete cache-busted aliases in `http-server.ts` after stable asset routing replaces them.
- Companion-only branches from the retained overlay HTML/JavaScript/CSS after their source and assets are safely archived.
- Viewer/companion HTTP endpoints, config defaults, event variants, imports, and core receiver arguments after the compatibility migration.
- Bloom command defaults from `config/bridge.example.json`.
- Ignored generated `packages/THSV-StreamBridge-*` staging directories/archives and generated `dist/` output as local housekeeping; these are reproducible and are not tracked source.

Historical release notes and Git history should remain. The checkpoint tag provides an immutable pre-overhaul recovery point.

## 8. Migration risks

1. **Breaking normalized-event contract:** removing `viewer.progression`, `companion.action`, and `metadata.viewerId` requires a major contract version and coordinated Receiver/Multi-Commands updates.
2. **Existing local configuration:** current files contain `viewerIdentity`, `companion`, `maxCompanionQueue`, and possibly Bloom commands. A versioned migration must preserve excluded state in backup, remove obsolete keys safely, and never silently discard totals or companion state.
3. **Live installation behavior:** the active local configuration is a Milestone 10 test configuration and the live `/overlay/companion` source exists. Stage 2 must not leave the service unable to start; companion removal must be announced as a core-scope change and old state backed up.
4. **Streamer.bot ownership:** existing actions/packages have no complete ownership registry. Name matching alone is unsafe; the first wizard pass must be read-only until explicit ownership is established.
5. **Documented API limits:** official WebSocket APIs list actions and commands and execute actions, while documented C# methods list/enable/disable commands and manage cooldowns. They do not document general command/action/trigger creation, editing, or deletion. Automatic CRUD cannot be promised without a supported mechanism.
6. **Kick reward uncertainty:** a Kick Reward Redemption trigger is documented from Streamer.bot `1.0.2`, but Kick reward sub-action pages are currently marked as missing documentation. The UI must expose redemption routing first and hide mutation operations until individually verified.
7. **Wizard UI support:** official C# documentation covers inline code and CPH methods but does not document a stable custom Streamer.bot extension-UI contract. A local browser wizard is safer than undocumented internal UI injection, but the supported launch path needs confirmation.
8. **Command authority transition:** current JSON command definitions are authoritative for bridge parsing, conflicting with the revised rule that Streamer.bot owns installed commands. A staged read/sync/backup model is required to avoid duplicate databases and collisions.
9. **Filters and regex:** blocker processing is new security-sensitive code. Native JavaScript regex has no timeout; Stage 4 must adopt safe-regex rejection and bounded input/evaluation rather than execute arbitrary creator regex against unbounded messages.
10. **Adapter capability inflation:** current configuration accepts creator-declared capability arrays. Capabilities should be provider-declared and operation-specific so configuration cannot claim support the adapter does not implement.
11. **Overlay privacy:** the current shared WebSocket intentionally publishes public presentation events only. Private operator chat requires a separate authenticated/loopback-only channel and must never leak into browser sources.
12. **Packaging size and separation:** archived assets must be excluded from core release manifests without breaking add-on packaging or losing third-party notices.

## 9. Revised architecture

Proposed target structure, introduced incrementally rather than by a single directory rewrite:

```text
apps/
  bridge-service.ts
  wizard-service.ts                 # local authenticated wizard host
bridge/
  core/
    host.ts                         # validation, dedup, routing, lifecycle only
    module-registry.ts
    router.ts
  contracts/v2/
    normalized-event.ts
    chat.ts
    command.ts
    alert.ts
    timed-action.ts
    reward.ts
    capability.ts
    module-manifest.ts
    health.ts
    browser-overlay.ts
  adapters/
    adapter.ts
    twitch-streamerbot.ts
    youtube-streamerbot.ts
    kick-streamerbot.ts
    tiktok-tikfinity.ts
    streamerbot-output.ts
  modules/
    chat/
    commands/
    alerts/
    timed-actions/
    filters/
    rewards/twitch/
    rewards/kick/
    diagnostics/
    wizard/
  services/
    config/
    storage/
    logging/
    security/
    backup/
    streamerbot/
packages/streamerbot/
  core-receiver/
  platform-intake/
  wizard-launcher/
archive/future-add-ons/
  viewer-progression/
  bloom-companion/
  speaker-orchestration/
docs/
  future-add-ons.md
```

Module rule: core host imports contracts and registered module interfaces only. A built-in or optional module may import core public contracts; core must never import an optional module implementation. Platform-specific mapping and capability discovery remain inside adapters. The wizard reads capability and ownership services rather than branching on platform names in shared editors.

## 10. Ordered implementation plan

1. **Stage 2A — Contract and compatibility boundary:** freeze `1.x`, define versioned v2 contracts/module manifest, add core-only configuration v2 and migration preview tests.
2. **Stage 2B — Extract excluded runtime dependencies:** archive source/assets/packages, remove startup/core/HTTP/config imports, retain backups of excluded state, and prove core starts with no add-ons.
3. **Stage 2C — Module host:** introduce module registry, built-in module manifests, health isolation, event subscriptions, configuration extensions, and a no-op test module.
4. **Stage 3 — Wizard foundation:** authenticated local wizard shell, navigation, cancellation/transaction model, read-only Streamer.bot action/command inspection, ownership registry, diagnostics, and safe rollback.
5. **Stage 4 — Platform configuration and blockers:** provider-declared capability matrix, enable/disable controls, filter schemas/engine, safe-regex policy, imports/exports, separate display/command/module scopes.
6. **Stage 5 — Commands:** read Streamer.bot commands, collision detection, templates/drafts, documented enable/disable/cooldown operations, action selection, and an approved installation/synchronization workflow for operations the official API cannot create directly.
7. **Stage 6 — Timed actions:** CRUD/templates, random intervals, activity/live/scene/platform gates, action selection, approved sub-action providers, and synchronization metadata.
8. **Stage 7 — Alerts:** mapping, templates, priority/queue/duration/sound, aggregation, sanitization, test/preview, and stable public success contract.
9. **Stage 8 — Rewards:** Twitch CPH-backed supported operations; Kick redemption routing first, with unsupported mutations hidden and explained.
10. **Stage 9 — Packaging/add-on API:** clean installer/upgrade/backup/restore, module package verification, sample no-op add-on, failure isolation, install/remove tests, and public developer documentation.

Each stage must keep the previous acceptance suite green, add the requested scenario matrix, and avoid modifying unrelated creator-owned Streamer.bot objects.

## 11. Questions not resolvable from repository or official documentation

1. Should the revised-core line use a breaking product version such as `2.0.0`, or a separately named preview channel before replacing stable `1.x`?
2. May the wizard be a loopback browser UI launched from a small Streamer.bot action, or must every page render inside Streamer.bot itself? Official docs do not define a stable extension-UI API.
3. For unsupported documented CRUD operations, should the wizard generate an owner-reviewed `.sb` import/export package and guide the user through import, or stop at read-only inspection plus native-UI navigation?
4. Should Speaker.bot orchestration become its own first optional add-on, or remain archived only?
5. Should archived Bloom/progression source remain in the main repository under `archive/`, or move later to separate add-on repositories after the module API stabilizes?
6. What retention window should apply to backed-up excluded state before the installer offers deletion?
7. Kick reward sub-actions are listed but their official pages state documentation is missing. Which operations, if any, should be enabled only after live Alpha inspection and owner acceptance?
8. The exact OBS build accepted previously was not recorded. Should Stage 7 require a fresh exact-version OBS/Streamlabs/Meld compatibility pass?

## Official documentation findings used by this audit

- [Streamer.bot WebSocket requests](https://docs.streamer.bot/api/websocket/requests) document `GetActions`, `DoAction`, `GetCommands`, event discovery, and subscriptions, but not general object creation/edit/deletion requests.
- [Streamer.bot C# command methods](https://docs.streamer.bot/api/csharp/methods/core/commands) document command inspection, enable/disable, counters, and cooldown operations, but not creation/edit/deletion.
- [Streamer.bot actions](https://docs.streamer.bot/guide/core/actions) confirms the native action/sub-action model and advanced editing surface.
- [Streamer.bot sub-actions](https://docs.streamer.bot/api/sub-actions) documents state/weight controls for existing sub-actions and the broad provider surface that should not be recreated wholesale.
- [Twitch Channel Point Rewards](https://docs.streamer.bot/guide/platforms/twitch/) and [Twitch reward C# methods](https://docs.streamer.bot/api/csharp/methods/twitch/channel-reward) support a substantially richer management workflow, including Streamer.bot-owned rewards and redemption status changes.
- [Kick reward redemption trigger](https://docs.streamer.bot/api/triggers/kick/channel-reward/reward-redemption) is documented from `1.0.2`; [Kick reward sub-actions](https://docs.streamer.bot/api/sub-actions/kick/rewards) are currently labeled as needing documentation, so mutation support remains unapproved.

