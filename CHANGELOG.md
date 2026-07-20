# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0-rc.4] - 2026-07-20

- Added: a `slothbloom.com` link in the wizard header ("A Slothbloom project") and a matching byline at the top of this README, so creators configuring the bridge see where it comes from. No functional or architectural change — StreamBridge remains entirely local, with no accounts and no hosted component.
- Added: alert layout and media placement presets. Each alert card now has an independent text layout (Classic — avatar left/text right, unchanged default; Stacked — avatar above centered text; Centered — no avatar) and media placement (Behind — full-bleed dimmed, unchanged default; Below — an undimmed banner strip beneath the text; Inset — a small undimmed box in the avatar's spot, or centered above the text for the Centered layout). The two choices combine freely and are configurable per alert type from the Alerts editor, with the live preview pane reflecting both.
- Changed: a wizard-wide visual pass across every panel — a real button hierarchy (primary/ghost/danger, previously all buttons looked identical), hover/focus transitions, themed scrollbars, purple-accented native checkboxes, rotating chevrons on collapsible sections, and consistent card/typography spacing.
- Changed: long descriptive paragraphs (Advanced Blockers, Command Sync, Rewards, Add-ons) now collapse to two lines with a "Show more" toggle instead of always taking full space. The Platforms tab's per-card "Input enabled"/"Output enabled" explanations — identical text repeated on all six platform cards — moved to a hover tooltip, cutting each card by about four lines.
- Added: alert cards can now use an animated GIF or a short uploaded background video (MP4/WebM, up to 5 MB) instead of a static image, with the video's own embedded audio replacing the alert's separate sound setting — "an mp4 with its own song," per the original request. Uploads are validated by file signature (not just declared content type), and an image and a video can't be set on the same card at once. Fixed two real, previously-unnoticed bugs found while wiring this up: neither the alert overlay page's nor the wizard's own Content-Security-Policy had a `media-src` directive at all, which — under CSP's fallback rules — silently blocked *all* audio and video playback on both pages, including the pre-existing custom alert sound upload feature.
- Added: a live preview card directly inside the Alerts editor, showing the title/detail templates (filled with example values), card color, font, and background image/GIF/video as you edit — updating on every keystroke — so a creator can see roughly what an alert will look like without opening OBS or Meld. This is separate from "Fire test alert," which still sends the real design to a connected overlay.
- Added: the Rewards panel remembers the platform and Reward ID from each successful live operation (locally, in the browser) and offers them back as one-click quick-select chips, so a creator doesn't have to keep the reward GUID copied on the side. Also added inline explanations for which operations need only a Reward ID versus which also need a Redemption ID.
- Fixed: the Overview panel's heading read "Stage 8 configuration" — leftover internal build-stage numbering with no meaning to a creator — now "Setup overview".

- Windows release lifecycle launchers now remain visible with explicit results, the release-only installer shortcut is no longer copied into installed layouts, and uninstall tolerates directory-handle locks by preserving creator data while deferring application-only cleanup until its window closes.
- Fixed: uploaded overlay backgrounds and sounds were being written under the disposable, per-version app folder instead of the persistent data root, so they were silently deleted on every upgrade; they are now correctly anchored to the configured data root.
- Fixed: the Bridge Launcher Streamer.bot actions (Launch/Shutdown) reported success as soon as a process handle existed, without waiting for the launcher to actually confirm the bridge started or stopped; they now wait for the launcher to finish and check its exit code before reporting success. Bumped to 1.3.0.
- Fixed: the portable installer's Start launcher could force-terminate an unrelated process if a stale PID file happened to be reused by Windows after an unclean shutdown; it now verifies the recorded PID is actually the bundled runtime before ever signaling it.
- Fixed: native platform intake (`RelayPlatform.cs`) hardcoded the literal item name "Kick Gift" as the default for every platform and event type, leaking into unrelated events (YouTube subscriptions, memberships, etc.).
- Fixed: Twitch/Kick reward redemptions were rejected as lacking a stable event ID even though Streamer.bot provides `redemptionId`; it's now used as a valid fallback.
- Fixed: YouTube Super Chat and Super Sticker were rejected despite carrying valid amount/currency data, because Streamer.bot hands the amount over pre-formatted (e.g. `"$42.00"`) and nothing stripped the currency symbol before validation. Also fixed `quantity` incorrectly inheriting that same formatted amount when no other quantity field was present.
- Fixed: Twitch Subscription, Resubscription, Gift Subscription, and Gift Bomb alerts never fired because these Streamer.bot triggers expose no message/event ID at all (confirmed via a full Action History argument dump, not assumed). The relay now builds a deterministic ID from fields that cannot repeat for a genuinely new event, explicitly flagged as unverified rather than platform-native.
- Fixed: Kick's "Kicks Gifted" trigger was silently unsupported because Streamer.bot's real event name is `KickKicksGifted`, not `KickGifted` as previously assumed everywhere in the codebase (relay, normalization, overlay display, and manifest).
- Fixed: YouTube Membership Gift alerts never fired because its real stable ID is exposed under the argument name `id`, not any of the previously-checked `messageId`/`msgId`/`eventId` names.
- Fixed: Kick Subscription, Resubscription, and Gift Subscription alerts never fired for the same no-platform-ID reason as their Twitch equivalents; extended the same deterministic, honestly-flagged fallback-ID mechanism to them using Kick's real available fields (`expiresAt`, `recipient.userId`, `subscribedAt`).
- Fixed: Kick's "Kicks Gifted" item name and quantity now read from the real argument names (`kicks.name`, `kicks.amount`) instead of the generic fields that were never actually populated for this trigger.
- Improved: YouTube monetary amounts now prefer the platform's integer micro-units field (`microAmount`) over string-parsing the pre-formatted currency display value, avoiding any risk from thousands-separator or locale formatting; conversion uses integer arithmetic only, never floating point.
- Fixed: Kick Mass Gift Subscription alerts never fired for the same no-platform-ID reason as the other Kick subscription-family triggers; extended the fallback-ID mechanism using the gifter's userId plus the shared `subscribedAt` timestamp, confirmed against Streamer.bot's own published variable reference rather than a live test (its test trigger currently crashes Streamer.bot before any data can be captured). Its recipients are indexed arrays (`recipient.0.userId`, `recipient.1.userId`, ...), unlike single Gift Subscription, so no recipient field is used in the fallback ID.
- Improved: the wizard's Alerts panel now explains what each alert template token (`{actor}`, `{amount}`, `{itemName}`, etc.) actually means and when it's populated, instead of showing a bare comma-separated list of token names with no context.
- Changed: alert presentation profiles are now scoped per platform *and* event (`alerts.profiles.<platform>.<alertType>`) instead of per event only, so, for example, Twitch Follow and Kick Follow can have entirely independent titles, sounds, and durations. This is a breaking configuration-schema change with no migration shim, since the shipped config's alert profiles were still empty; anyone who had already customized alert profiles in a preview build will need to re-enter them under the new per-platform layout. The wizard's Alerts panel was rebuilt around this: a platform-grouped event tree replaces the old flat card list, each event has its own inline enable/disable toggle, and a single "Fire test alert" action replaced the old scattered per-card preview buttons and the redundant alert-type/platform preview form.
- Changed: the Command Sync and Timed Actions wizard panels were rebuilt around the same list-plus-editor pattern as Alerts — a left-hand list (tracked commands / queued batch entries, or configured timers with an inline enable toggle) and a right-hand editor form that only appears when adding or selecting an item, instead of one long always-visible form stacked above a flat card list. The Chat Overlay panel's single long settings form is now grouped into collapsible sections (Layout & text, Canvas & message cards, Branding & visibility, Chat events, Ignored names) instead of one continuous field list. The wizard's left navigation is now sticky so it stays reachable while scrolling a long panel. The "Inspect now" and "Sync now" buttons were renamed to "Inspect" and "Sync". Also removed two dead, unreachable duplicate form-submit handlers left over from an earlier command/timer design that a `stopImmediatePropagation()` in the real handler had silently prevented from ever running.
- Changed: the wizard's Platforms panel now renders each platform as a compact, evenly spaced card instead of a single grid row that let long capability lists wrap unpredictably. Provider capabilities are shown as small badges instead of a raw comma-separated line, and each of the three toggles (Platform enabled, Input enabled, Output enabled) now has a plain-language explanation of what it actually does — including that Output enabled is honestly disclosed as reserved for future features and not yet enforced by any current adapter, rather than implying it already gates something it doesn't.
- Changed: the Advanced Blockers wizard panel was rebuilt around the same list-plus-editor pattern as the other panels — a left-hand rule list with an inline enable toggle and delete button, and a right-hand form that only appears when adding or selecting a rule. Existing rules can now be edited in place (previously the panel could only add or delete a rule, never edit one, and its own ID was preserved across an edit instead of being regenerated from a possibly-changed name). The Scope, Target, and Match dropdowns now each carry an inline plain-language explanation instead of leaving that distinction only in the panel's intro paragraph. Fixed a bug found in testing: toggling or deleting a rule while none was selected for editing left a stale status message on screen because `stageFilters()`, unlike every other panel's stage function, never wrote its own confirmation text.
- Fixed: `docs/integration-assumptions.md`'s "Production platform alert matrix" and `docs/production-readiness.md`'s preview-limitations note still described Twitch/YouTube/Kick as placeholder transports with no verified event mapping, which was stale — both now reflect the native Streamer.bot relay intake and the specific alert types whose field/ID mapping has been corrected against real Action History argument dumps, with the one exception (Kick Mass Gift Subscription) still called out explicitly since its live test trigger crashes Streamer.bot.

## [2.0.0-rc.3] - 2026-07-19

### Changed

- The public Windows installer now explains its local verification and privacy behavior, displays an unmistakable success or failure summary, and waits for the creator before closing.
- The public Windows uninstaller now explains exactly what is removed and preserved, displays an unmistakable success or failure summary, and waits for the creator before closing and removing its own wrapper.

## [2.0.0-rc.2] - 2026-07-19

### Changed

- Windows-only PowerShell acceptance tests skip on Linux, and the Windows CI matrix runs them under Windows PowerShell 5.1 so its native cmdlet/module environment matches supported installations.
- Real PowerShell backup/restore integration tests have an explicit hosted-runner time budget without weakening their assertions.
- Durable-delivery retry assertions tolerate hosted-runner scheduling delays while still requiring the event to reach the dead-letter queue.
- GitHub-hosted CI and release workflows use the current Node 24-based checkout, setup-node, and artifact-upload actions.

### Fixed

- Safety backups combine a readable timestamp with a random suffix so an immediate restore cannot collide with a backup created in the same second.

## [2.0.0-rc.1] - 2026-07-19

### Added

- Stage 9 v2 add-on descriptors with complete SHA-256 file manifests, compatibility bounds, safe-path validation, atomic creator-approved install/remove operations, and runtime manifest matching.
- A verified no-op reference add-on, optional-module discovery, failure isolation, public developer documentation, and add-on install/remove tests.
- Hashed backups that include installed add-ons plus an approval-gated, verified, staged restore workflow with rollback.

### Changed

- Promoted the v2 Windows distribution to a public release candidate with a self-contained installer, SHA-256 manifest verification, SBOM generation, and GitHub artifact attestations.
- Preview and release-candidate tags now publish as GitHub prereleases and cannot replace the latest stable release.
- Updated public documentation to reflect the durable output outbox, restart replay, bounded retry, and dead-letter behavior that is now implemented.
- Windows launchers and the setup wizard now accept valid JSON configuration files saved with a UTF-8 byte-order mark by common Windows editors.
- The public Windows uninstaller now normalizes its trailing installation-path separator before handing the path to Node, preventing a quoted-path failure during removal.
- JavaScript release assets are pinned to LF checkout semantics so add-on manifest sizes and hashes remain reproducible on Windows GitHub runners.
- CycloneDX release SBOMs are written as BOM-free UTF-8 JSON for GitHub attestation compatibility on Windows PowerShell 5.1.

### Safety

- High-impact provider events still require provider-stable event IDs; unverified TikFinity financial and progression use remains blocked during RC acceptance.

## [2.0.0-preview.1] - 2026-07-17

### Added

- Parallel v2 preview contracts for normalized events, chat, commands, alerts, timed actions, rewards, capabilities, module manifests, configuration extensions, module health, and browser overlays.
- A strict core-only v2 configuration schema and non-writing v1-to-v2 migration preview that enumerates excluded configuration/state before extraction.
- Revised product-scope, contract-boundary, and module-system documentation.
- Stage 2/3 migration acceptance criteria from the independent Stage 1 review.
- A manifest-validated module registry with dependency ordering, event subscriptions, isolated lifecycle failures, and per-module health.
- Built-in Chat, Commands, Alerts, and Timed Actions module registrations plus registry acceptance tests.

### Changed

- Completed the Stage 1 adapter inventory with the Streamer.bot relay and package-envelope helpers and explicitly retained the timed-actions control script.
- Archived Viewer Progression, Bloom Companion, and Speaker.bot implementations under `archive/future-add-ons` and removed their runtime, HTTP, configuration, event, overlay, and Streamer.bot argument dependencies from core.
- Rebuilt the Core Receiver and Multi-Commands imports as `2.0.0-preview.1` without viewer-progression identity arguments.
- Startup now emits a structured warning listing any archived `viewerIdentity`, `companion`, or companion-overlay configuration paths that were safely ignored, while preserving their state for creator review.

### Safety

- Stable `main` remains unchanged. Legacy config keys load without reactivation, migration preview is non-writing, and upgrade/uninstall flows preserve excluded state until explicit creator deletion.

## [1.0.1] - 2026-07-17

### Added

- Explicit SemVer downgrade protection with an intentional `-AllowDowngrade` escape hatch and backward-state warning.
- Bloom image-generation provenance, asset-license scope, trademark boundary, and direct production dependency notices.
- A centralized compatibility and platform-support matrix linked from first-run and troubleshooting documentation.

### Changed

- Release packaging now includes `THIRD-PARTY-NOTICES.md` and tests its presence.

## [1.0.0] - 2026-07-17

### Added

- Checksummed Windows release manifests and adjacent SHA-256 archive files.
- A staged public-release installer with custom-path support, hash verification, production-only dependency installation, configuration bootstrap, state-preserving upgrades, and rollback on final-swap failure.
- A managed uninstaller that preserves creator data by default and requires an explicit switch to remove it.
- A production-safe PowerShell simulation helper that does not require development dependencies.
- Automated Windows lifecycle coverage for install, upgrade, tamper rejection, data-preserving uninstall, and full removal.

### Changed

- Public release documentation now distinguishes source setup from archive installation and states the license and production-transport publication boundaries.
- The project is now licensed as open-source software under the MIT License.
- The accepted release candidate is promoted to the first stable public release.

## [0.12.2] - 2026-07-17

### Fixed

- Kept Bloom's raised-arm celebration poses inside their sprite cells so the jump no longer clips the head or leaves neighboring-frame artifacts.
- Added a sprite-generation boundary check that rejects any future pose that would escape its fixed cell.

## [0.12.1] - 2026-07-16

### Added

- Eight-frame registered animations for Bloom idle blinking, waving, eating, sleeping, waking, and celebrating.
- Persistent sleep state and a free `!bloom-wake` interaction that reverses the sleep transition.

### Fixed

- Normalized every sprite to a fixed square cell, centerline, baseline, and face scale so poses do not stretch, shrink, slide, or bleed into adjacent frames.
- Removed detached generation fragments and replaced the artificial berry and eyelid overlays with fully drawn poses.

## [0.12.0] - 2026-07-16

### Added

- Bloom Companion with unified progression spending, creator-configured commands, cooldowns, bounded shared stats, and atomic local state.
- Wave, eat, sleep, and celebrate animations in an independent shared-WebSocket browser source.
- A projection-only Streamer.bot package and authenticated PowerShell visual-test helper.

### Fixed

- Companion persistence failures roll state back and automatically refund spent points.
- Derived commands receive their trusted bridge sequence before companion validation.

## [0.11.1] - 2026-07-16

### Added

- Loopback-only authenticated viewer progression add, remove, reset, and deletion controls with required operator and reason audit fields.
- A PowerShell administration helper for bounded moderator corrections and verified privacy deletion requests.

### Fixed

- Serialized progression administration with ordinary awards so adjustments and deletion cannot race the state writer.
- Viewer deletion now removes matching creator-configured account links and rolls them back if progression persistence fails.

## [0.11.0] - 2026-07-16

### Added

- Native Streamer.bot intake actions and normalized adapters for Twitch, YouTube, and Kick chat, follow, subscription, gift, raid, cheer, and paid-message triggers.
- Dedicated Streamer.bot action groups for Twitch, YouTube, Kick, and TikTok while reusing one authenticated WebSocket connection.

### Changed

- Standardized TikFinity action names under the `THSV TikTok - ...` naming scheme.

### Removed

- Removed Facebook from the platform schema, configuration, fixtures, documentation, and test matrix because it is no longer an implementation target.

## [0.10.3] - 2026-07-16

### Fixed

- Subscribed the shared Streamer.bot connection to `General.Custom` events before reporting it ready, allowing `WebsocketBroadcastJson` TikFinity relays to reach StreamBridge.
- Unwrapped Streamer.bot's live custom-event envelope before validating and normalizing TikFinity events.
- Added an integration regression test for the actual Subscribe acknowledgement and `General.Custom` wire shape.

## [0.10.2] - 2026-07-16

### Added

- A TikFinity input adapter that receives allowlisted event broadcasts over StreamBridge's existing authenticated Streamer.bot WebSocket connection.
- A four-action TikFinity Intake package for chat, follow, gift, and like mappings already configured in the adopted TikFinity profile.
- Safe TikFinity chat/alert normalization with bounded fields, simulator-default provenance, visible unverified-field markers, and no raw payload retention.

### Changed

- The example TikTok platform now uses the `tikfinity-streamerbot` adapter while remaining disabled until its Streamer.bot package is imported and tested.
- The Streamer.bot export builder now supports reviewed multi-action packages without changing existing single-action exports.

## [0.10.1] - 2026-07-16

### Fixed

- Isolated Viewer Identity and Progression from bridge availability: corrupted state now degrades only that subsystem while chat, commands, alerts, timed actions, and overlays remain active.
- Continued accepting and delivering valid events when progression persistence fails, disabled further progression work for that run, and exposed the failure through structured logs and diagnostics.
- Added bridge-level regression coverage for corrupted startup state and runtime progression write failure.

## [0.10.0] - 2026-07-16

### Added

- Explicit creator-configured cross-platform account links with stable platform-scoped pseudonyms for unlinked viewers.
- Atomic, duplicate-bounded local progression state with fixed event points, cross-platform cooldowns, configurable levels, and default exclusion of simulated/bot/system activity.
- Derived `viewer.progression` events plus Core Receiver `1.0.4`, Multi-Commands `1.1.0`, and Viewer Progression `1.0.0` Streamer.bot packages.
- Privacy and recovery documentation for viewer identity state, link configuration, testing, and backups.

## [0.9.9] - 2026-07-16

### Fixed

- Bounded waiting alerts, skipped malformed alert cards without freezing the queue, made combined branding configurable, and exposed standalone reconnect status.
- Hid broken avatars and documented Browser Source refresh and scene-lifecycle behavior.

## [0.9.8] - 2026-07-16

### Fixed

- Limited standalone Chat to eight visible cards by default and faded the oldest card when the next message arrives.
- Added a larger bottom-safe area so the newest chat card remains fully visible after a browser source is cropped.

## [0.9.7] - 2026-07-16

### Fixed

- Applied the standalone Chat clarity treatment to Alerts with an opaque high-contrast card, crisp type, and an opacity-only entrance.
- Made standalone Alerts use a centered, bounded card on a full 1920 by 1080 browser canvas so broadcasting apps can crop transparent space without squeezing the webpage.
- Versioned the shared browser-event worker so updated overlay pages cannot remain attached to a stale event session after a source reload.

## [0.9.6] - 2026-07-16

### Fixed

- Replaced translucent blur on standalone Chat cards with an opaque high-contrast surface for crisp browser-source text.
- Made the Chat container fit narrow and wide source viewports without stretching text or changing card proportions.
- Replaced the translated arrival animation with an opacity-only transition to avoid compositor softening after messages settle.

## [0.9.5] - 2026-07-16

### Fixed

- Made the plain `/overlay/chat` URL use the Meld-safe, full-canvas layout without query-string sizing parameters.
- Removed vertical scale compensation so chat cards preserve their proportions at every browser-source size.
- Increased standalone chat readability with responsive card widths, spacing, names, labels, and message text.
- Disabled browser caching for overlay assets and added query-safe HTTP routing so broadcasting apps reliably receive overlay updates.

## [0.9.4] - 2026-07-16

### Fixed

- Added a canvas-native Chat layout for Meld Studio so its editor-controlled browser viewport no longer compresses chat inside a tall layer.
- Preserved the fill-source layout as `?layout=compact` for OBS Studio, Streamlabs Desktop, and hosts with explicit browser viewport sizing.

## [0.9.3] - 2026-07-16

### Fixed

- Kept the standalone Chat source transparent when empty and bottom-anchored message cards instead of stretching the chat panel across the entire browser-source canvas.

## [0.9.2] - 2026-07-16

### Added

- Independently movable Chat-only and Alerts-only browser-source URLs alongside the existing combined overlay.
- A same-origin `SharedWorker` that multiplexes separate overlay sections over one WebSocket when supported, with a safe direct-connection fallback for isolated browser-source hosts.

## [0.9.1] - 2026-07-16

### Changed

- Generalized Meld-specific naming into the Browser Overlay Hub for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible Chromium/CEF browser sources.
- Renamed creator configuration to `browserOverlay` while automatically migrating the deprecated `meldOverlay` key.
- Preserved the existing `http://127.0.0.1:8787/overlay/` URL and event contract.

## [0.9.0] - 2026-07-16

### Added

- Local cross-compatible Browser layer/source and loopback-only public event WebSocket.
- Context-safe unified chat with bounded retention and moderation/deletion correlation.
- Priority-aware visual alert queue with explicit subscription lifecycle and gift provenance fields.
- HTTPS avatar/badge metadata, validated name colors, role badges, bot and simulated-event controls.
- Browser CSP, projection, injection-sink, fixed-asset, and live loopback WebSocket tests.

## [0.8.1] - 2026-07-16

### Added

- Timed actions remain dormant until an explicit session start or normalized `stream.online` event.
- Multi-platform live tracking stops timers only after every observed live platform goes offline.
- Token-protected runtime start, stop, pause, and resume endpoints plus a PowerShell operator script.
- Pause freezes the remaining interval instead of creating catch-up promotional messages.

## [0.8.0] - 2026-07-16

### Added

- Session-relative local scheduling with independent creator-configured minute intervals.
- Persistent shuffle-container message selection with no repeats until every configured message is used.
- Streamer.bot timestamp parsing preserves ISO strings instead of allowing Json.NET date coercion.
- Explicit skip or single-catch-up behavior with occurrence, missed-run, and lateness diagnostics.
- Atomic completed-occurrence state and deterministic scheduled-event identities.
- Platform-neutral `system.timed` projection and a triggerless concurrent Multi-Timed Actions Streamer.bot package.
- Deterministic scheduler, persistence, contract, safety, fixture, and export-integrity tests.

## [0.7.1] - 2026-07-16

### Changed

- Speaker Orchestration now requires a positive CPH transport result before reporting `speakerDispatched=True`.
- Dispatch documentation distinguishes local UDP send success from voice-alias validation, engine acceptance, audio generation, and playback.
- Creator-side cooldown, stable request-ID deduplication, URL/markup transformation, and speak serialization responsibilities are explicit; priority, caption timing, and audio ducking are carried into the appropriate future milestones.

## [0.7.0] - 2026-07-16

### Added

- Platform-neutral Speaker.bot orchestration contract for speak, stop, pause, resume, and clear operations.
- Triggerless, concurrent Streamer.bot package using the official `TtsSpeak` integration and Speaker.bot localhost UDP queue controls.
- Default-deny speech safety: explicit creator approval, approved text provenance, forced bad-word filtering, simulated-event blocking, and no-audio dry runs.
- Honest generated-audio metadata outputs that remain unavailable on the selected C# dispatch path.
- Automated contract, safety, source-integrity, and reproducible-export tests.

## [0.6.1] - 2026-07-16

### Added

- Schema-level stable source-event-ID requirement for public alerts, preventing legitimate repeated financial or engagement alerts from colliding in fallback deduplication.
- Machine-readable Multi-Alerts content-safety policy that classifies creator-controlled text as untrusted and defaults speech to denied until explicitly approved.
- Regression coverage proving a stalled delivery does not prevent a later delivery from completing when concurrency is available.
- A bounded `simulate:burst` tool for repeatable 2–100 event live Streamer.bot pressure checks with unique source identities.
- Serialized, sequence-aware accepted-state snapshots so concurrent Windows writes cannot race atomic renames or let an older event overwrite newer status.

### Changed

- Core Receiver, Multi-Chat, Multi-Commands, and Multi-Alerts exports now enable concurrent stateless invocations so one slow event cannot serialize the entire receiver pipeline.
- Streamer.bot package patch versions are now Core Receiver `1.0.3`, Multi-Chat `1.1.1`, Multi-Commands `1.0.1`, and Multi-Alerts `1.0.1`.

## [0.6.0] - 2026-07-16

### Added

- Platform-neutral Multi-Alerts projection for follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and milestones.
- Versioned Multi-Alerts Streamer.bot package with reviewed C# source and reproducible import.
- Exact decimal-string money validation, ISO currency codes, safe quantities, inert Unicode text, actor identity, and transport-verification outputs.
- Twitch follow fixture and comprehensive alert contract/package tests.

### Changed

- TikFinity like/share fixtures now use the standard `engagement.milestone` contract with explicitly unverified normalized fields.
- Adapter capabilities now represent engagement milestones explicitly.

## [0.5.1] - 2026-07-16

### Added

- Creator-facing command prefix and definition configuration with startup-time alias collision validation.
- Central derivation of structured command events from raw public chat, with deterministic correlation and consecutive bridge sequences.
- Atomic output-capacity reservation for source chat and its derived command.
- Unicode argument, cross-platform derivation, collision, malformed-input deduplication, and batch-capacity tests.

### Changed

- Production adapters must emit raw public command text as `chat.message`; the bridge now owns tokenization for every platform.
- Cooldowns and spam throttles are explicitly blocked on Milestone 9 cross-platform identity rather than being added with bypassable platform-scoped IDs.

## [0.5.0] - 2026-07-16

### Added

- Platform-neutral Multi-Commands parsing and projection contract with canonical names, aliases, quoted arguments, and explicit input limits.
- Portable role and bot authorization results while leaving final command behavior in Streamer.bot.
- Public, private, and operator command event boundaries.
- Versioned Multi-Commands Streamer.bot package with reviewed C# source and reproducible import.
- Five-platform simulated command fixtures plus parser, permission, privacy, inert-input, and package-integrity tests.

## [0.4.1] - 2026-07-16

### Added

- Process-local bridge arrival sequences that overwrite caller values after deduplication and let consumers reconstruct cross-platform order.
- Multi-Chat event ID, received timestamp, sequence, public visibility, actor type, and bot provenance outputs.
- Standard private chat, system chat, and operator message event types that never enter the public Multi-Chat path.
- Deterministic sequence, privacy-boundary, actor-provenance, and 100-event burst tests.

### Changed

- Core receiver package updated to `1.0.2` with argument contract `1.1.0`.
- Multi-Chat package and contract updated to `1.1.0`.
- Streamer.bot export generation preserves stable action and C# sub-action IDs across package upgrades.

## [0.4.0] - 2026-07-16

### Added

- Platform-neutral Multi-Chat projection contract for Twitch, YouTube, Kick, TikTok, and future registered platforms.
- Versioned `THSV StreamBridge - Multi-Chat` Streamer.bot package with reviewed C# source and reproducible import generation.
- Plain-text normalization, message-length validation, user-role flags, defensive argument initialization, and readable feature-level errors.
- Offline chat fixtures for all five planned platforms plus unit and package-integrity coverage.
- Deterministic `package:streamerbot` export builder for reviewed Streamer.bot C# packages.

## [0.3.1] - 2026-07-16

### Fixed

- Streamer.bot requests now send only the normalized event envelope, eliminating redundant unvalidated flattened wire arguments.
- Receiver failure paths clear every derived argument before validation, and identifier/type validation now mirrors the open normalized schema.
- Receiver JSON parsing now preserves ISO 8601 timestamps as strings before validating them in Streamer.bot.
- Streamer.bot package documentation now describes the actual Base64/SBAE/gzip export representation.
- Streamer.bot reconnection backoff now includes bounded equal jitter.

### Added

- Receiver queue, concurrency, dependency, uninstall, compatibility, and manual QA documentation.
- Adapter-author guidance for safely handling asynchronous emissions from real-time callbacks.

## [0.3.0] - 2026-07-15

### Added

- Versioned Streamer.bot core receiver package with a portable import, manifest, reviewed C# source, and installation guide.
- Stable platform-neutral Streamer.bot argument contract with envelope, user, channel, payload, metadata, and correlation fields.
- Export-integrity, contract, and live request-shape tests for the receiver package.

### Changed

- Streamer.bot delivery now forwards the complete receiver argument contract instead of only the raw event, event ID, and event type.
- Windows release packaging now includes the Streamer.bot package directory.

## [0.2.0] - 2026-07-15

### Added

- Token-authenticated, Origin-checked, rate/concurrency-bounded local control endpoints.
- Registry-backed input/output adapters, open platform/output records, namespaced events, and normalization helpers.
- Bounded asynchronous output queues, delivery metrics, failure-aware readiness, pending acknowledgement limits, and persisted deduplication state.
- Tests for security, delivery pressure, lifecycle, persistence, redaction, adapter registration, and failure paths.

### Changed

- Example configuration now defaults to truthful live Streamer.bot delivery; test mode is explicit and visibly non-live.
- Canonical deduplication is stable across payload key order and mixed channel ID availability.
- Post-acceptance state-write failures are reported diagnostically without falsely rejecting delivered or queued events.

## [0.1.0] - 2026-07-15

### Added

- Initial repository scaffold and Bridge Core milestone.
