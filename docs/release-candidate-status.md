# Published release status and next-add-on decision

Snapshot: July 27, 2026. Version baseline: `2.5.0`.

Release `2.5.0` is the current synchronized release candidate, with the main Windows archive, an add-on index, and `29` separately downloadable first-party add-ons prepared by the release pipeline. The detailed ownership, privacy, dependency, and implementation plans remain in [Future projects and add-on roadmap](future-projects-and-addons.md). Per-package evidence is tracked in [Add-on acceptance ledger](add-on-acceptance-ledger.md). **Published**, **offline accepted**, and **provider accepted** are deliberately different states.

## Completed in the current candidate

| Area | Confirmed state |
| --- | --- |
| Bridge core | Normalized Twitch, YouTube, Kick, and TikTok intake; one Streamer.bot connection; durable outbox; deduplication; authenticated loopback wizard; browser overlays; safe lifecycle and recovery. |
| Automated validation | Lint, typecheck, build, configuration validation, 135 test files / 707 tests, and 10 browser tests passed for the release candidate. Production dependency packaging reported zero known vulnerabilities. |
| Windows package | The expanded 29-add-on self-contained `THSV-StreamBridge-2.5.0.zip` is produced with its SHA-256 checksum by the refreshed source, test, configuration, dependency, integrity, and portable-package gate. A separate clean-machine install/update walkthrough remains an acceptance task, not a publication blocker. |
| Add-on packaging | Twenty-nine first-party implementations are present. Each builds as a separate verified download; an `.sb` import is included only when the add-on needs Streamer.bot actions. |
| Streamer.bot source packages | Twenty add-ons require Streamer.bot actions and use distinct `THSV Addon - <Name>` groups in source. Core packages remain in their existing core groups. |
| New viewer stack | Viewer Foundation, Community Analytics, and Viewer Spotlight are packaged, installed locally, and report healthy. Foundation and Analytics are enabled; Spotlight remains disclosure-gated and disabled by default. |
| Chat Guard | Observe mode remains the default. Optional warn/delete/timeout/ban modes require double approval, one stable action grant, provider capability checks, simulation suppression, and a rolling action cap. Live destructive acceptance remains pending. |
| Public documentation | Current add-on, capability, privacy, release, Viewer Foundation, Scene Actions, Ko-fi, product-scope, module-system, and roadmap guides are included in the portable release. |
| Main wizard templates | Commands/Help, source-gated Coin Flip, Twitch Follow Age, four creator-review-gated timed-message packs, and per-platform chat/alert Minimal, Warm, and Hype wording presets are complete. Follow Age uses the official fixed Helix followers endpoint inside its generated Streamer.bot C# action, queries only the invoking Twitch viewer, and keeps OAuth credentials in Streamer.bot. |
| Shared Discord delivery | Live Beacon, Clip Courier, and Discord Chat Archive use one channel/forum safety contract with private Streamer.bot-held webhooks, explicit mention policy, confirmed responses, bounded rate-limit retry, and correlated Discord IDs. Private live webhook acceptance remains required. |

## Work remaining after publication

1. **Streamer.bot organization acceptance:** source manifests and generated packages use one `THSV Addon - <Name>` group per action-bearing add-on. The four newly missing packages (Chat Guard, Clip Library Cache, Free Game Check, and Viewer Spotlight) were imported into the live Streamer.bot installation, which now reports 93 actions. Creator-owned triggers on existing actions were preserved by not overwriting already-present packages.
2. **Wizard installed-state tracking:** completed in the working tree. Direct intakes now compare stable ID, expected name, expected group, enabled state, and trigger count. Approved action grants preserve human-readable names while not inspected and report remembered rename/group drift after inspection.
3. **Expanded implementations:** Creator Controls, Category Pilot, Live Beacon, Clip Courier, Viewer Lobby, Voice Relay, and Follower Pulse are complete in source and pass the refreshed full package/browser gate. Creator-specific live acceptance remains required.
4. **Runtime acceptance:** Streamlabs Donations now reuses Streamer.bot's authenticated `Streamlabs.Donation` WebSocket event and fails closed without a provider-stable ID. A live Streamlabs test donation must confirm the installed Streamer.bot build preserves that raw ID.
5. **New add-on live acceptance:** observe at least one genuine event through every stateful or provider-mutating add-on before labeling it live accepted.
6. **Next patch gate:** after acceptance fixes, rerun the full automated/browser/package gate and publish matching core, add-on index, packages, checksums, and attestations together.

High-impact financial, reward, raid, or moderation paths still require their provider-specific live evidence. Missing evidence must keep those operations gated; it is not permission to simulate success in release notes.

## Creator decision: finish the remaining practical add-ons

The earlier recommendation to freeze at seventeen packages was superseded by the creator on July 27, 2026. The release scope now includes the remaining practical automation add-ons, built in dependency order and accepted independently. This expands schedule and validation surface; **Packaged** still must not be presented as **Live accepted**.

Implementation order:

1. creator-facing acceptance ledger — implemented locally; finish full validation and carry it into the next synchronized patch package;
2. shared Discord channel/forum delivery contract — source-complete; live private-webhook acceptance remains;
3. live Ko-fi acceptance and one live Streamlabs donation-ID capture through the shared Streamer.bot connection;
4. Chat Guard Observe-only acceptance, followed by a separate decision on safe enforcement;
5. Category Pilot in Suggest-only mode, then Creator Controls;
6. Viewer Lobby;
7. Live Beacon and Clip Courier;
8. Follower Pulse and the Speaker.bot Orchestration rebuild;
9. final cohesion, clean-install, update, rollback, package, and live-acceptance pass.

Bloom Companion remains on the back burner by explicit creator decision. The working-tree expansion adds Creator Utility Pack, Chat Play Pack, Free Game Check, Accessibility Captions, shared clip metadata caching, digest-locked Viewer Foundation migration/achievements, and Viewer Spotlight reward requests plus Discord snapshots. Provider-mutating features do not become accepted through simulation.

## Working-tree expansion validated for release packaging

- The authenticated add-on ledger is creator-editable and keeps automated, offline, and genuine-provider evidence separate.
- Clip Library Cache supplies bounded metadata to Random Clip Player and Clip Courier; signed playback URLs and video files are never persisted.
- The Random Joke Command Sync template is original, source-gated, cooldown-bounded, and needs no external API.
- Creator Utility Pack, Chat Play Pack, Free Game Check, and Accessibility Captions are complete in source and remain disabled or conservative by default where they can create public output.
- The full repository and browser gates pass: `135` Vitest files / `707` tests, `10` Playwright checks, and `36` regenerated Streamer.bot imports. The release packaging gate produces and verifies all `29` add-on archives before publication. Genuine provider acceptance remains deliberately separate and pending where listed in the ledger.
