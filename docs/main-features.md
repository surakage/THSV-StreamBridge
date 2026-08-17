# Main features

StreamBridge presents the components creators use together as seven main features. The wizard is organized around the job being performed while preserving each existing package's stable identity and Streamer.bot wiring.

Viewer Foundation and Community Analytics sit beneath those seven feature groups as Bridge integrations. Each has its own Wizard page, neither is counted as an extension or add-on, and neither needs separate installation, updating, or removal. Viewer Foundation owns private identity and progression; Community Analytics owns bounded private attendance and activity projections for features such as Viewer Spotlight.

The wizard calls these seven included feature groups **extensions**. An extension is part of the StreamBridge operating experience even though its components retain isolated package identities internally. An **add-on** is an optional feature that the creator installs separately. The wizard gives Extensions and Add-ons their own navigation pages so neither inventory, its settings, nor package-install controls crowd the other.

The feature catalogue and presentation lanes now come from one Bridge-owned registry. The wizard receives that registry from the authenticated add-on inventory instead of maintaining another hard-coded list. Official packages inside a family are presented as Bridge-managed extension components; standalone optional packages remain add-ons. This reduces the creator-facing add-on wall without merging component state or weakening failure isolation.

Each feature card has a **System details** disclosure. It combines bounded runtime metrics with per-component Healthy, Disabled, Restart required, Not active, or Runtime unknown states. Component buttons open the existing detailed editor; the summary never mutates settings or dispatches a live action.

The Browser Overlay Hub publishes a versioned presentation policy in diagnostics. Reward cards and Automated Shoutouts share the foreground queue. Random Clip Player and Raid Scout media use the independent media lane. Ad Break Companion and Starting Soon Countdown use the independent timer lane. Chat Guard, Discord Chat Archive, and Quote Vault remain background-only and never consume an overlay slot. Exact template previews always bypass the queue.

## Broadcast Director

Broadcast Director owns the stream lifecycle view:

- Live Beacon reports which platforms are online.
- Starting Soon Countdown owns launch timing.
- Scene Actions reacts to creator-selected scenes.
- Ad Break Companion tracks the active ad window independently from transient overlays.
- Raid Scout performs the end-of-stream suggestion, clip, raid, and shutdown sequence.

Diagnostics show the current stage, online platform count, scene, ad state, Raid Scout state, and the health of every installed component. Simulated events never change the live lifecycle state.

## Clip Engine

Clip Engine provides one shared clip foundation:

- Clip Library Cache owns the bounded Twitch metadata snapshot.
- Random Clip Player rotates creator clips without repeating the current cycle.
- Raid Scout plays the selected channel's clip during the raid sequence.
- Clip Courier creates or publishes clips without creating another background lookup loop.
- The capability broker remains the single owner of shared media-slot arbitration.

The coordinator records counts, timestamps, component health, and media ownership only. It does not retain clip IDs, titles, creator names, video bytes, or temporary signed playback URLs.

## Community Rewards

Community Rewards groups First Five, Fan Crown, Viewer Spotlight, Village Roll Call, and Village Hydration Station. The shared wizard surface shows session redemption count, component operations, failed results, capability failures, and the shared foreground-overlay queue. A new live cycle resets the session counters. Redemption rules, reward IDs, state, resets, and overlays remain isolated per component.

## Community Messaging

Community Messaging groups Automated Shoutouts, Discord Chat Archive, Chat Guard, and Quote Vault. The feature status combines session chat throughput, component operations, failed results, pending outbound work, and capability failures. It stores no chat text, names, quote text, IDs, or webhook data. The components reuse the normalized chat stream but keep separate permissions and destinations. Moderation failure cannot block archiving, and a Discord failure cannot block the public chat pipeline.

## Community Insights

Community Insights adds optional Follower Pulse reconciliation on top of the built-in Community Analytics provider. Follower history, cross-platform participation totals, and reporting remain private and local. The shared feature reports only bounded operational health; it does not expose follower identities or viewer records in ordinary diagnostics.

## Community Play

Community Play combines Custom Counter, Chat Play Pack, and Village Fun Commands. Counters, game state, commands, and platform routing remain isolated per component while the wizard provides one interactive-toolkit entry point and combined health summary.

## Voice & Language

Voice & Language combines Village Voice and Translate. Speaker.bot delivery, viewer TTS controls, translation approvals, and originating-platform replies retain their existing safeguards while appearing in one accessible communication feature.

## Migrating an older installation

The portable installer never silently activates a component copied from an older layout. It moves the verified package into persistent component storage in a disabled state and places its saved settings and history in the private migration inbox.

Open **Setup Wizard > Bridge Features > Private migration inbox** and review each retained component separately:

- **Import saved settings and history** copies that component's retained private state into the current Bridge.
- **Enable component after restart** controls whether its code becomes active; importing data does not enable it automatically.
- **Replace current component data** appears only when both current and migrated data exist. It requires a separate choice and uses a rollback-safe replacement.

Skipped data remains local in the migration inbox. It is not sent to THSV, Streamer.bot, Discord, or any platform, and can be reviewed again later.

## Compatibility promise

- Existing module IDs, action IDs, reward IDs, settings, and stored state remain valid.
- Existing Streamer.bot packages do not need duplicate triggers.
- Feature cards select the original component editor for detailed settings.
- Missing or unhealthy optional components degrade only their feature card.
- Add-ons may still be installed, updated, disabled, backed up, or removed independently.

This structure gives creators one operating surface without turning optional add-ons into one failure-prone package.
