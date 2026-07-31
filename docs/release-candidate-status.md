# Published release and acceptance status

Snapshot: July 31, 2026. Version baseline: `2.5.2`.

Release `2.5.2` is the current stable source baseline prepared for publication, with the main Windows archive, an add-on index, and `32` separately downloadable first-party add-ons. The detailed ownership, privacy, dependency, and implementation plans remain in [Future projects and add-on roadmap](future-projects-and-addons.md). Per-package evidence is tracked in [Add-on acceptance ledger](add-on-acceptance-ledger.md). **Published**, **offline accepted**, and **provider accepted** are deliberately different states.

## Completed in the published baseline

| Area | Confirmed state |
| --- | --- |
| Bridge core | Normalized Twitch, YouTube, Kick, and TikTok intake; one Streamer.bot connection; durable outbox; deduplication; authenticated loopback wizard; browser overlays; safe lifecycle and recovery. |
| Automated validation | Lint, typecheck, build, configuration validation, 140 test files / 760 tests, and 16 browser tests pass on the current source baseline. Production dependency packaging reports zero known vulnerabilities. |
| Windows package | The self-contained `THSV-StreamBridge-2.5.2.zip`, its SHA-256 checksum, the synchronized add-on index, and all `32` individual add-on archives/checksums were regenerated and verified together. GitHub attestations are produced by the tag-triggered release workflow. A separate clean-machine install/update walkthrough remains an acceptance task, not a publication blocker. |
| Add-on packaging | Thirty-two first-party implementations are present. Each builds as a separate verified download; an `.sb` import is included only when the add-on needs Streamer.bot actions. |
| Streamer.bot source packages | Twenty add-ons require Streamer.bot actions and use distinct `THSV Addon - <Name>` groups in source. Core packages remain in their existing core groups. |
| New viewer stack | Viewer Foundation, Community Analytics, and Viewer Spotlight are packaged, installed locally, and report healthy. Foundation and Analytics are enabled; Spotlight remains disclosure-gated and disabled by default. |
| Chat Guard | Observe mode remains the default. Optional warn/delete/timeout/ban modes require double approval, one stable action grant, provider capability checks, simulation suppression, and a rolling action cap. Live destructive acceptance remains pending. |
| Public documentation | Current add-on, capability, privacy, release, Viewer Foundation, Scene Actions, Ko-fi, product-scope, module-system, and roadmap guides are included in the portable release. |
| Main wizard templates | Commands/Help, source-gated Coin Flip and Magic 8-Ball, multi-platform Game Suggestion, Twitch Account Age/Uptime/Follow Age, four creator-review-gated timed-message packs, and per-platform chat/alert Minimal, Warm, and Hype wording presets are complete. Twitch lookup commands use fixed official Helix endpoints inside their generated Streamer.bot C# actions and keep OAuth credentials in Streamer.bot. |
| Shared Discord delivery | Live Beacon, Clip Courier, and Discord Chat Archive use one channel/forum safety contract with private Streamer.bot-held webhooks, explicit mention policy, confirmed responses, bounded rate-limit retry, and correlated Discord IDs. Discord Chat Archive normal-channel delivery is provider accepted; forum mode plus Live Beacon and Clip Courier delivery remain pending. |

## Work remaining after publication

1. **Streamer.bot organization acceptance:** source manifests and generated packages use one `THSV Addon - <Name>` group per action-bearing add-on. The four newly missing packages (Chat Guard, Clip Library Cache, Free Game Check, and Viewer Spotlight) were imported into the live Streamer.bot installation, which now reports 93 actions. Creator-owned triggers on existing actions were preserved by not overwriting already-present packages.
2. **Wizard installed-state tracking:** completed in the working tree. Direct intakes now compare stable ID, expected name, expected group, enabled state, and trigger count. Approved action grants preserve human-readable names while not inspected and report remembered rename/group drift after inspection.
3. **Expanded implementations:** Creator Controls, Category Pilot, Live Beacon, Clip Courier, Viewer Lobby, Voice Relay, and Follower Pulse are complete in source and pass the refreshed full package/browser gate. Creator-specific live acceptance remains required.
4. **Runtime acceptance:** Streamlabs Donations now reuses Streamer.bot's authenticated `Streamlabs.Donation` WebSocket event and fails closed without a provider-stable ID. A live Streamlabs test donation must confirm the installed Streamer.bot build preserves that raw ID.
5. **New add-on live acceptance:** observe at least one genuine event through every stateful or provider-mutating add-on before labeling it live accepted.
6. **Publication gate:** push the reviewed source and `v2.5.2` tag, then require the GitHub release workflow to publish the matching core, add-on index, packages, checksums, SBOM, and attestations together.

High-impact financial, reward, raid, or moderation paths still require their provider-specific live evidence. Missing evidence must keep those operations gated; it is not permission to simulate success in release notes.

## Acceptance order for the completed package set

The earlier recommendation to freeze at seventeen packages was superseded by the creator on July 27, 2026. The release now contains the practical non-companion add-ons selected for this cycle. Implementation and packaging are complete; the remaining sequence is acceptance work. **Packaged** must not be presented as **Live accepted**.

Acceptance order:

1. creator-facing acceptance ledger plus clean-machine Windows install/update/rollback/uninstall acceptance;
2. Discord Chat Archive normal-channel delivery is complete; its forum-thread path plus Live Beacon and Clip Courier private delivery remain pending;
3. Ko-fi offline routing is accepted; a Ko-fi-originated test webhook and one live Streamlabs donation-ID capture through the shared Streamer.bot connection remain pending;
4. Chat Guard Observe-only acceptance is complete; separately approved provider enforcement tests remain pending;
5. Category Pilot Suggest-only behavior and Creator Controls provider mutations;
6. Viewer Lobby operator and overlay flows;
7. Live Beacon and Clip Courier provider/Discord delivery;
8. Follower Pulse and Speaker.bot Orchestration;
9. final cohesion, clean-install, update, rollback, package, and live-acceptance pass.

Bloom Companion remains on the back burner by explicit creator decision. Creator Utility Pack, Chat Play Pack, Free Game Check, Accessibility Captions, shared clip metadata caching, digest-locked Viewer Foundation migration/achievements, and Viewer Spotlight reward requests plus Discord snapshots are packaged. Provider-mutating features do not become accepted through simulation.

## Current source validation

- The authenticated add-on ledger is creator-editable and keeps automated, offline, and genuine-provider evidence separate.
- Clip Library Cache supplies bounded metadata to Random Clip Player and Clip Courier's optional current-stream discovery. Clip Courier's main `!clip` path uses Streamer.bot's CreateClip result directly; signed playback URLs and video files are never persisted.
- The Random Joke Command Sync template is original, source-gated, cooldown-bounded, and needs no external API.
- Game Suggestion persists a shared bounded list in Streamer.bot rather than a creator-specific Windows path. Account Age and Uptime use official Twitch endpoints instead of DecAPI, and Magic 8-Ball uses an original editable answer list.
- Creator Utility Pack, Chat Play Pack, Free Game Check, and Accessibility Captions are complete in source and remain disabled or conservative by default where they can create public output.
- The full repository and browser gates pass: `140` Vitest files / `760` tests and `16` Playwright checks. All `35` generated Streamer.bot imports are version-aligned at `2.5.2`; Stream Labels, Village Roll Call, Prize Wheel, and Village Draw reuse the core intakes and need no new actions. The portable archive, add-on index, and all `32` add-on archives/checksums verify successfully. Genuine provider acceptance remains deliberately separate and pending where listed in the ledger.

### Local synchronized-install evidence — July 28, 2026

- The installed `2.5.0` bridge reports `healthy` and `ready` on loopback.
- The creator-selected set of `19` installed add-ons was upgraded from rejected `2.4.2` packages to matching `2.5.0` packages without replacing settings, private state, enabled flags, or approved action grants. Clip Library Cache was then installed as the missing declared dependency of Random Clip Player and Clip Courier, bringing the synchronized local profile to `20` add-ons.
- All `20` report `installed` at `2.5.0`; Random Clip Player, Clip Courier, and Clip Library Cache now load together as healthy modules, and their private wizard acceptance entries report the installed release rather than `unknown`.
- Disposable Windows installer tests passed install, upgrade preservation, downgrade protection, tamper rejection, normal uninstall preservation, full removal, and locked-directory cleanup. The live source lifecycle passed custom-port start, replacement-start, stale-build detection, and active-configuration shutdown.
- Direct Streamer.bot `1.0.5-beta.2` inspection confirmed the `93`-action grouped layout. Harmless Twitch, YouTube, and Kick chat **Test Trigger** runs each produced exactly one accepted, non-duplicate, durably queued `chat.message` event in the installed bridge. This is intake-routing evidence, not genuine-provider acceptance.
- The earlier `Partially Connected (8/10)` observation predated Voice Relay acceptance. Speaker.bot is now connected and its two saved aliases plus audible playback are verified; Meld remains intentionally unused because OBS is the adopted browser host.
- A separate fresh-machine walkthrough of the exact public ZIP remains pending; automated disposable evidence is not mislabeled as an external clean-machine observation.
- Clip Library Cache offline/runtime acceptance passed after repairing the missing dependency. Its approved triggerless action performed one real Twitch lookup, returned `40` bounded clip records, and wrote a `21,264`-byte metadata snapshot with no signed query credentials or error. Only one refresh action was dispatched during the observed startup window. A longer steady-state observation proving both clip consumers share refreshes without duplicate polling remains pending.
- Stream Launch Countdown's actual imported **Set & Start** and **Stop** actions now pass the repaired control-path check: the timer became visible/running with persisted state, then stopped and hid cleanly, with one unique durable relay event per control. Its preview-only **Complete Now** action also rendered the configured completion message without browser errors, hid after ten seconds, and correctly suppressed the Go Live action. Audible tone confirmation and an explicitly approved harmless scene transition remain pending.
- Subathon Timer's complete imported manual-control cycle now passes locally: Reset, Start, Pause, Add Time, Resume, and final Pause were each acknowledged once, persisted the expected 3600-to-3900-second change, and left no contribution counters or viewer data. A final reset rendered `01:00:00` READY cleanly in the browser, and a simulated TikTok gift was correctly prevented from changing production time. Genuine contribution rules, restart recovery, and long-running observation remain pending.
- This is local installation evidence only. It does not mark a pending genuine-provider row as passed.
