# Future projects and add-on roadmap

This document separates responsibilities that belong in THSV StreamBridge core from optional creator features. The goal is a small, dependable main installation and add-ons that reuse its authenticated services instead of opening competing processes or WebSocket connections.

Last organized: July 31, 2026.

## How this roadmap is maintained

This is the authoritative planning document for future first-party features. Whenever a new idea is accepted for planning, update all applicable parts of this document in the same change:

1. place it in the portfolio table with one honest status;
2. decide whether it belongs in core, a main-wizard template, a shared foundation, a standalone add-on, or a later platform extension;
3. identify existing features it must reuse, features it may optionally integrate with, and features it must not duplicate;
4. document data ownership, secrets, privacy, provider limitations, failure isolation, wizard organization, and Streamer.bot permissions;
5. write phased implementation and test/acceptance steps detailed enough to resume without reconstructing the design;
6. place it in the dependency-ordered build sequence.

Status meanings:

| Status | Meaning |
| --- | --- |
| Idea | Recorded but not yet fully designed. |
| Specified | Ownership, dependencies, phases, safety, UI, and acceptance are documented. |
| Implemented | Reviewed source and tests exist in the repository. |
| Packaged | A versioned `.thsv-addon` is present in the official release index, with a matching Streamer.bot package only when the add-on requires Streamer.bot actions. |
| Live accepted | The relevant real provider, Streamer.bot action, wizard flow, and overlay/output were observed successfully. |
| Archived candidate | Historical source is preserved but is inert, unsupported by current core, and must not be imported as a current package. |

Never mark a feature complete merely because files or generated archives exist. Record creator-specific live acceptance separately from automated repository validation.

## Main product boundary

The main installation owns shared infrastructure:

- normalized Twitch, YouTube, Kick, and TikTok event intake;
- one authenticated Streamer.bot WebSocket connection and one browser-overlay transport per compatible host process;
- durable delivery, deduplication, structured diagnostics, backups, and safe recovery;
- the authenticated setup wizard, platform capability truth, and shared chat/alert/timed-action presentation;
- permission-gated, source-routed and selected-platform outbound messaging with explicit character limits, per-add-on rate limits, and independent failure results;
- verified `.thsv-addon` parsing, dependency and version checks, isolated settings/state, explicit creator approval, and failure isolation;
- hosted add-on cards/media plus correlated playback lifecycle reports;
- an official GitHub release check that never silently replaces a running installation.

Core must not become a catalogue of stream-specific entertainment features. Optional features may depend on core, but core must never depend on them.

## Portfolio status

### Packaged first-party add-ons

Across the current-package tables below, thirty-three add-ons are synchronized for the `2.6.0` release. Automated packaging confirms repository and bundle cohesion; live-provider acceptance remains tracked separately. **Packaged** confirms repository/release cohesion, not that every creator-specific provider credential, trigger, webhook, browser source, or live-stream path has been accepted:

| Add-on | Current status | Standalone responsibility | Remaining acceptance emphasis |
| --- | --- | --- | --- |
| Random Clip Player | Packaged `2.6.0` | Twitch clip rotation and hosted playback | Live clip retrieval and playback in each intended browser-source host. |
| Automated Shoutouts | Packaged `2.6.0` | Category-aware Twitch promotion plus allowlisted platform welcomes | Real first-chat/manual paths and optional Twitch clip/native shoutout actions. |
| Translate | Packaged `2.6.0` | Manual and allowlisted automatic translation in one add-on | Provider timeout, Unicode, reply attribution, splitting, privacy disclosure, rate limiting, and source-only routing. |
| Ko-fi Donations | Packaged `2.6.0` | Ko-fi stable-ID donation intake | Real Ko-fi test webhook and replay/deduplication evidence. |
| Subathon Timer | Packaged `2.6.0` | Multi-provider event-to-time rules and timer overlay | Real provider contribution rules, restart recovery, and long-running timer behavior. |
| Stream Launch Countdown | Packaged `2.6.0` | Explicit scene countdown, finish message, optional local tone, and optional approved scene-switch action | Package installation, Streamer.bot scene triggers, audio routing, and OBS/Meld/Streamlabs display. |
| Scene Actions | Packaged `2.6.0` | Scene-to-approved-action routing | OBS/Meld/Streamlabs scene-name and reconnect behavior. |
| First Five | Packaged `2.6.0` | Ordered Twitch reward positions and monthly results | Real reward mutation/refund and concurrent redemption behavior. |
| Fan Crown | Packaged `2.6.0` | Rotating Twitch reward holder and leaderboard | Real reward cost/title mutation, rollback, monthly reset, and overlay. |
| Raid Scout | Packaged `2.6.0` | Safe Twitch raid suggestions and confirmation | Real followed/category candidate lookup and confirmed raid action. |
| Village Jukebox | Packaged `2.6.0`; live acceptance pending | YouTube-first multi-platform song requests, fair queueing, points/reward intake, and shared hosted playback | Private resolver setup, real YouTube quota/metadata behavior, complete playback, music-rights acknowledgement, source routing, and reward/points settlement. |
| Quote Vault | Packaged `2.6.0` | Moderated cross-platform quote library | Live commands, role checks, moderation queue, and restart-safe state. |
| Discord Chat Archive | Packaged `2.6.0` | Filtered public-chat delivery to a Discord channel or one session-scoped forum thread | Private channel/forum webhook acceptance, batching, reconnect, and end-of-session thread reset. |
| Viewer Foundation | Packaged `2.6.0` | Pseudonymous linked identity, bounded progression, privacy administration, and consumer projections | Genuine cross-platform identity/progression events plus export, correction, and deletion on the installed system. |
| Community Analytics | Packaged `2.6.0` | Bounded local session attendance, counters, reports, and viewer/session projections | Real stream lifecycle rollover, cross-platform observations, reports, and deletion propagation. |
| Viewer Spotlight | Packaged `2.6.0` | Disclosure-gated viewer cards using Viewer Foundation and Community Analytics projections | Intentional enablement, real self-requested command, manual card, overlay host, cooldown, and deletion behavior. |
| Chat Guard | Packaged `2.6.0` | Disabled-by-default observe-only public-chat rule evaluation and pseudonymous incident review | Real-chat false-positive review, temporary permits, retention, and provider capability reporting with zero enforcement. |
| Creator Controls | Packaged `2.6.0` | Guarded Twitch, YouTube, and Kick title/category profiles through one shared provider controller | Live provider mutation and result readback on each connected platform. |
| Category Pilot | Packaged `2.6.0` | Suggest-first Windows process-to-profile mapping with privacy-bounded exact-name probes | Live process matching, debounce, creator apply/dismiss, and opt-in automatic mode. |
| Live Beacon | Packaged `2.6.0` | Coalesced multi-platform Discord go-live notifications | Real stream lifecycle deduplication plus private channel/forum webhook acceptance. |
| Clip Courier | Packaged `2.6.0` | Twitch `!clip` creation plus optional current-stream-only discovery and Discord channel/forum publication | 30/60-second command clips, stream-window timestamp filtering, duplicate suppression, and confirmed Discord result. |
| Viewer Lobby | Packaged `2.6.0` | Multi-platform play queue with source-routed commands and creator controls | Live join/leave/position flows, restart recovery, overlay ordering, and operator controls. |
| Voice Relay | Packaged `2.6.0`; offline accepted | Filtered, bounded Speaker.bot event orchestration | Complete locally: aliases, audible phrases, aggregation, creator controls, Clear Pending, and Stop Speaking passed. |
| Follower Pulse | Packaged `2.6.0` | Private bounded Twitch follower reconciliation | Live broadcaster authorization, first baseline, pagination, two-scan confirmation, and refollow behavior. |

### Shared foundations and archived candidates

| Foundation | Status | Decision |
| --- | --- | --- |
| Viewer Foundation | Packaged `2.6.0`; expansion validation pending | Salted pseudonymous identities, explicit stable-ID links, fixed awards, cooldowns, replay protection, bounded private state, a permission/dependency-gated broker, authenticated status/export/correction/deletion, derived point-milestone achievements, and digest-locked legacy migration now exist as `thsv.viewer-foundation`. Core does not own viewer profiles. |
| Community Analytics | Packaged `2.6.0`; live acceptance pending | `thsv.community-analytics` resolves identities only through Viewer Foundation, records bounded session attendance/counters without chat text, names, raw IDs, money, or payloads, provides authenticated summaries/export/deletion and local JSON/CSV reports, and exposes permission-gated pseudonymous viewer plus aggregate-session projections. |
| Speaker.bot Orchestration | Rebuilt as Village Voice `2.6.0` | Independent filtered queue using the public `CPH.TtsSpeak` contract; Speaker.bot remains authoritative for clearing speech already queued inside it. |
| Bloom Companion | Back burner | Explicitly deferred. Reconsider only after the non-companion safety, creator-control, and viewer-service tracks are accepted. |
| Shared Discord delivery | Implemented pattern | Live Beacon, Clip Courier, and Discord Chat Archive use the same reviewed secret boundary, explicit mention rules, confirmed channel/forum responses, bounded rate-limit retry, and correlated Discord IDs. Each retains its own content, lifecycle, and privacy policy. |
| Shared provider control | Implemented | Category Pilot reuses Creator Controls profiles and provider controller methods; Scene Actions remains separate. |
| Shared clip discovery | Implemented pattern | Clip Library Cache owns one bounded Streamer.bot clip lookup and publishes stable-ID metadata snapshots. Random Clip Player consumes it for playback; Clip Courier uses it only when optional current-stream discovery is enabled. Its primary `!clip` path is direct. |

### Additional standalone add-on status

| Project | Status | Why it stays standalone |
| --- | --- | --- |
| Viewer Lobby | Packaged `2.6.0` | Queue state, operator controls, fairness and gamertag privacy remain independent. |
| Live Beacon | Packaged `2.6.0` | Go-live notification policy and secrets remain separate from chat archives. |
| Clip Courier | Packaged `2.6.0` | Clip publication and Discord thread identity remain independent of clip playback. |
| Category Pilot | Packaged `2.6.0` | Windows process detection and provider mapping are optional and high privilege. |
| Follower Pulse | Packaged `2.6.0` | A triggerless approved Streamer.bot controller pages only Twitch's fixed Helix follower endpoint; credentials never cross the relay and StreamBridge compares only complete bounded snapshots. |
| Creator Controls | Packaged `2.6.0` | Provider mutations require explicit operator permissions and audit. |
| Voice Relay | Packaged `2.6.0` | Speaker.bot filtering, bounded queueing and creator emergency controls remain optional. |
| Chat Play Pack | Packaged and automated-accepted `2.6.0` | Bounded Number Guess, creator-authored Trivia, Prediction rounds, and idempotent Viewer Foundation awards remain separate from stateless templates. |
| Streamlabs Donations | Implemented in core; live acceptance pending | Reuses Streamer.bot's authenticated `Streamlabs.Donation` WebSocket event, stores no provider credential, and fails closed unless the raw live event contains `event_id`, `donation_id`, `_id`, or `id`. |
| Free Game Check | Packaged and automated-accepted `2.6.0` | Conservative fixed-provider discovery, silent first scan, bounded deduplication, attribution, and selected-platform output. |
| Creator Utility Pack | Packaged and automated-accepted `2.6.0` | Bounded counters and polls share one optional package with platform-limited source routing. Its older in-memory giveaway was removed in favor of Village Draw. |
| Accessibility Captions | Packaged and automated-accepted `2.6.0` | Ephemeral high-contrast public chat/event captions with no text retention; Voice Relay remains the independent TTS boundary. |
| Clip Library Cache | Packaged and automated-accepted `2.6.0` | One bounded Twitch metadata snapshot serves clip consumers; video bytes and signed playback URLs remain uncached. |
| Stream Labels | Packaged `2.6.0`; local OBS acceptance passed | One bounded latest-value projection groups equivalent multi-platform events into OBS-ready labels without adding triggers, sockets, or viewer history. |
| Village Roll Call | Packaged `2.6.0`; live Twitch acceptance pending | One Twitch daily reward check-in, a bounded monthly leaderboard, and an optional hosted OBS card without hard-coded files or another Streamer.bot action. |
| Prize Wheel | Packaged `2.6.0`; local cropped-OBS acceptance passed | Two through ten equal slices, a server-selected result, a decelerating studded wheel, moderator command control, and bounded winner messages to selected chats. |
| Village Draw | Packaged `2.6.0`; live acceptance pending | Free or Viewer Foundation points entry, bounded weighted tickets, authenticated lifecycle controls, recoverable refunds, and hosted winner cards. |
| Village Jukebox | Packaged `2.6.0`; live acceptance pending | YouTube-only playback avoids Spotify redistribution conflicts; Streamer.bot privately resolves metadata while StreamBridge owns the bounded fair queue, Viewer Foundation spending, native reward intake, shared media slot, and source-routed controls. |

## Combination and dependency decisions

Features should share authoritative services without becoming one oversized add-on:

| Features | Combine or share | Keep separate |
| --- | --- | --- |
| Viewer Identity + Progression + Community Analytics | One Viewer Foundation identity/link/privacy authority and one private viewer record contract. Analytics may be a separately enabled module but must write through that authority. | Viewer Spotlight, Bloom, games, Fan Crown, and First Five remain consumers. |
| Viewer Spotlight + Viewer Foundation | Share viewer IDs, progression snapshots, achievements, and analytics projections. | Spotlight owns only requests, public field selection, rendering, queueing, and optional Discord snapshots. |
| Viewer Lobby + Viewer Foundation + Scene Actions | Lobby uses platform-scoped stable IDs immediately, may use Viewer Foundation to collapse explicitly linked accounts, and may consume normalized scene state for creator-approved open/close automation. | Lobby owns queue/session/fairness state and must not merge with Viewer Spotlight, progression, games, or Scene Actions. |
| Category Pilot + Creator Controls | Share provider category mappings, validated mutation methods, result readback, audit primitives, and rate limits. | Automatic process detection and manual operator commands remain independently enabled. |
| Chat Guard + future moderation dashboard | Share rule evaluation, trusted-user lists, incident audit, and provider moderation capabilities. | A dashboard must not become required for enforcement. |
| Clip Library Cache + Random Clip Player + Automated Shoutouts + Clip Courier | Clip Library Cache owns the bounded metadata lookup and stable clip IDs. | Playback rotation, shoutout presentation, and Discord publication remain independent. Clip Courier's `!clip` path creates directly; optional discovery consumes the shared cache and filters to the observed stream window. |
| Live Beacon + Clip Courier + Discord Chat Archive + Viewer Spotlight Discord export | Share one reviewed Discord channel/forum delivery controller and secret boundary. | Each add-on keeps separate destinations, retention, templates, deduplication, and enable switches. |
| Translate | Manual and automatic translation now share one provider client, action, language validation, splitting, and rate-limit layer. | Automatic mode remains separately gated in the wizard because it has materially greater privacy and spam risk. |
| Ko-fi + Streamlabs + native support events | Feed the same normalized alert/presentation pipeline. | Preserve provider-specific stable IDs, currencies, event labels, credentials, and add-on health. |
| Coin Flip + Chat Play Pack | Start Coin Flip as a stateless main-wizard template. | Move shared statistics/multi-round state into Chat Play Pack only when those features are enabled. |
| Scene Actions + other add-ons | Share normalized scene state and approved action dispatch. | Other add-ons must not duplicate scene triggers or depend on Scene Actions being installed. |
| Village Jukebox + Viewer Foundation + media add-ons | Viewer Foundation supplies optional YouTube/TikTok point spending and the shared media slot prevents overlapping THSV video playback. | Village Jukebox owns its queue and YouTube metadata policy; it does not absorb Random Clip Player, Clip Library Cache, alerts, or Spotify playback. |

## Main wizard template status

The following S•Kit-inspired features are small, bounded command or presentation templates rather than add-ons. They should extend the existing wizard generators without adding new background services, sockets, schedulers, or persistent modules:

| Template | Current state and behavior |
| --- | --- |
| Follow Age | **Implemented as a main Command Sync template.** The generated action is Twitch-only and queries the invoking viewer against Twitch's fixed `GET /helix/channels/followers` endpoint. Streamer.bot retains its broadcaster OAuth token; the action stores and logs no credential or API body, applies global/user cooldowns, and reports missing follower permission without pretending account age or `IsFollowing` is follow age. |
| Account Age | **Implemented as a main Command Sync template.** Twitch-only self lookup through `GET /helix/users`; reports the creation date and calendar age without relying on DecAPI. |
| Stream Uptime | **Implemented as a main Command Sync template.** Twitch-only broadcaster lookup through `GET /helix/streams`; reports a bounded duration or a clear offline state. |
| Game Suggestion | **Implemented as a main Command Sync template.** Multi-platform, exact duplicate protection, 120-character input bound, 1,000-entry cap, and one persisted Streamer.bot list with no creator-specific file path. |
| Magic 8-Ball | **Implemented as a main Command Sync template.** Multi-platform, question-required, cooldown-bounded, and uses one original editable response list. |
| Commands / Help | **Implemented.** Builds an editable, platform-length-bounded help response from commands already staged in the same wizard batch. An empty batch receives an explicit placeholder for a creator-maintained list or help URL rather than claiming unavailable commands exist. |
| Coin Flip | **Implemented.** Generates a stateless source-gated C# response with editable Heads/Tails choices. It uses the existing platform reply gate and sends only to the platform that invoked it. |
| Random Joke | Optional random-list command using creator-authored or clearly licensed entries. Prefer one bounded response; do not block a shared action queue with long waits between a setup and punchline. |
| Timed message packs | **Implemented.** Community Links, Rules/Help, Support, and Schedule join the existing Social, Hydration, and Stretch presets. Presets containing creator-specific links or schedules start disabled until their per-platform cards are reviewed. |
| Event-message styles | **Implemented.** Minimal, Warm, and Hype wording can be applied independently to one chat-event platform or one alert profile. They alter editable wording only and preserve event types, character limits, sounds, aggregation, and spam gates. |

Existing Lurk, Socials, Discord, Hug, Shoutout, timed announcements, first-message welcomes, and follow/subscription/gift/raid acknowledgements should be improved in place rather than duplicated from third-party starter packages.

## Installation and update model

The recommended public build remains a portable, self-contained Windows x64 ZIP hosted on the official GitHub Releases page. The wizard may check that official repository for a newer stable release and show its notes and download link. Activation remains an explicit creator action so an unavailable network, malformed release, or unexpected version can never replace a healthy live bridge.

Add-on archives use the `.thsv-addon` extension. Creators can upload one in the authenticated wizard or copy it to `data/addons/inbox/`. Inbox discovery is intentionally not auto-install: the wizard validates the archive, displays its identity, requested permissions, compatibility, and integrity status, then requires approval. Installed add-ons appear in one selector; selecting an add-on opens only that add-on's settings.

Package hashes prove that installed bytes match the package descriptor. They do not prove who published it. Release packaging emits a checksummed add-on index, and the wizard now performs a manual read-only version, compatibility, publisher, and revocation check against that official index. GitHub artifact attestations are the free publisher-authentication path for official releases; live attestation verification and guided package replacement remain future work. Executable add-ons remain a trusted-publisher feature and declarative packages remain the preferred public third-party tier.

## Detailed specifications and completion notes

### 1. Random Clip Player — Packaged 2.6.0

Random Clip Player serves as the reference executable media add-on because it exercises the public action, scheduler, state, overlay, lifecycle, settings, and update APIs without changing core scope.

Responsibilities:

- request a creator-approved Streamer.bot action that retrieves Twitch clip metadata through the creator's connected Twitch account;
- keep only bounded clip IDs, URLs, titles, creator names, duration, and rotation history in private add-on state;
- choose clips randomly without repeats until the eligible library is exhausted;
- publish one `media.play` request with a unique `playbackId` to the core-hosted add-on overlay;
- wait for `started`, `heartbeat`, and `ended`; retry or skip on `failed` or `timeout`;
- fade the final frame briefly inside the creator's configured between-clips pause, without adding hidden wait time;
- expose minimum/maximum duration, pool size, volume, mute, and interval settings in its wizard page;
- remain off after every bridge launch, then use Streamer.bot Enable and Disable actions as the only playback-session controls creators attach to scene-active and scene-inactive triggers;
- support Starting Soon, BRB, and Ending use without directly controlling OBS, Meld, or Streamlabs;
- reuse the bridge's existing Streamer.bot and overlay transports and refuse to run when the required main version/capabilities are absent.

Acceptance requires live Twitch retrieval plus playback checks in OBS, Meld, and Streamlabs-compatible Browser Sources. A simulated clip list can test rotation without going live.

### 2. Automated Shoutouts — Packaged 2.6.0

Implemented and packaged as `thsv.automated-shoutouts` `2.5.0`. It category-verifies Twitch targets with Streamer.bot's documented extended-user lookup before automatic promotion; uses platform-specific welcomes for allowlisted YouTube/Kick/TikTok first chats; accepts moderator/broadcaster manual commands; enforces a bounded queue, expiry, per-user/global/per-stream gates and strict destination limits; and sends through the shared source/selected-platform router. It optionally calls Streamer.bot's documented native Twitch shoutout method through a separate approved action. Pronouns and team membership remain deferred. See [Automated Shoutouts](automated-shoutouts.md).

### 3. Translate — Packaged 2.6.0

Implemented and packaged as `thsv.user-translate` `2.6.0`. Manual, Automatic, and Both modes share one broker-approved Streamer.bot action. Manual mode supports `!translate buenos dias`, explicit target overrides (`!translate fr hello`), shortcuts (`!es hello`), and Twitch reply translation. Automatic mode is allowlist-first and skips commands, bots, system messages, simulations, duplicates, and ignored viewers while enforcing bounded pending work, cooldowns, a per-minute ceiling, and a translated-chat percentage cap. Google web provides disclosed automatic source detection; MyMemory remains the documented fixed-source fallback. Results route only to the source platform and message text is never retained. See [Translate](user-translate.md).

### 4. Donation providers — Ko-fi packaged; Streamlabs native intake implemented

Streamlabs and Ko-fi remain separate provider identities. Each preserves its provider event ID, uses trusted Streamer.bot provenance, carries money as decimal strings, and maintains distinct alert identity and colors. Do not merge them with Twitch Bits, YouTube Super Chats, Kick KICKs, or TikTok gifts. Financial intake uses core durable delivery and dead letters.

Current progress: Ko-fi Donations `2.5.0` is implemented and packaged for stable-ID donation intake; live Ko-fi test-webhook acceptance remains pending. Streamlabs donation intake is implemented directly in core by adding `Streamlabs.Donation` to the existing authenticated Streamer.bot WebSocket subscription. This avoids copying or storing Streamlabs credentials and avoids another connection. The raw event must carry `event_id`, `donation_id`, `_id`, or `id`; incomplete trigger arguments are never fingerprinted as a substitute. Live acceptance must confirm the installed Streamer.bot build preserves one of those identifiers.

### 5. Community Analytics — Initial Viewer Foundation package implemented

Build the StreamSuite-inspired feature set as an optional analytics add-on, not core. The useful pieces are attendance, first-chat/check-in tracking, stream start/end sessions, returning-viewer detection, per-stream summaries, simple interaction counters, and exportable local reports. The add-on should store its own private state through StreamBridge instead of scattering persistent Streamer.bot globals across unrelated actions.

Current status: `thsv.community-analytics` now includes Viewer Foundation-only identity resolution, explicit/approximate session lifecycle, bounded attendance and interaction counters, stable-ID ignore controls, bot/system/simulation gates, replay fingerprints, atomic private state, authenticated aggregate summaries, per-viewer privacy export, confirmed deletion, local size-bounded session JSON and pseudonymous viewer CSV downloads, and permission/dependency-gated viewer/session projections through its serialized writer. Completed sessions retain only non-identifying aggregate totals. Live multi-platform acceptance remains next work.

Responsibilities:

- track attendance from normalized first-message, check-in command, and approved reward events;
- keep bot/service-account ignore lists in the wizard;
- distinguish new, returning, and already-counted viewers within a stream session;
- count follows, raids, subscriptions, memberships, gifts, cheers, Super Chats, TikTok gifts, and TikTok like milestones only when stable event identity is available;
- expose session summaries in the wizard and optional local report export;
- never claim official analytics, revenue, payout, or tax accuracy;
- keep all reset/clear operations explicit and backup-friendly.

Do not include private contact messages, carrier email-to-SMS, personal local paths, or credential-bearing report delivery. Those are intentionally out of scope for public add-ons.

### 6. Subathon Timer — Packaged 2.6.0

Subathon Timer is implemented and packaged as `thsv.subathon-timer` `2.5.0`. It consumes normalized events and publishes a core-hosted timer overlay that counts down and increases through creator-defined event rules. Providers or event types without stable identity must remain unavailable for production mutations until their intake is accepted.

Responsibilities:

- define per-platform contribution rules such as subscription adds time, gift count multiplies time, cheer/Super Chat/donation amount adds time, raid size adds time, and TikTok like milestones add time;
- support max total time, max per-event add, happy-hour multipliers, pause/resume, manual add/remove, reset with backup, and live-only gating;
- show timer, goal, last contributor, event rotator, and optional safety state in one hosted overlay;
- require simulated preview before live use;
- record every accepted timer mutation with event ID, platform, amount, rule, and resulting timer value;
- ignore unsupported or unstable events until the provider has verified stable IDs.

The add-on should not use a downloaded UI DLL or direct OBS control. The wizard and hosted overlay already provide the safer configuration and display layer.

### 7. Voice Relay — Packaged 2.6.0

The archived Speaker.bot feature is rebuilt as `thsv.voice-relay`. It uses normalized events and one approved, triggerless `CPH.TtsSpeak` action; starts disabled; defaults to alert events; strips links/control characters; applies a local blocked-term list; role-gates opt-in chat; and bounds phrase length, waiting work, and request spacing. Pause, Resume, and Stop prevent future StreamBridge requests. Speaker.bot's native Clear Pending or Stop Speaking control remains required to immediately clear audio already queued inside Speaker.bot because Streamer.bot exposes no equivalent documented C# method.

### 8. Viewer Foundation — Foundation slice implemented

Rebuild the archived Viewer Progression work as the optional `thsv.viewer-foundation` authority. It combines explicit platform account-linking, pseudonymous viewer identity, privacy export/deletion, moderator correction, replay-safe rewards, levels, achievements, and migration rules. Community Analytics must use this authority rather than creating a second identity store. Viewer Spotlight, games, companions, cooldown systems, Fan Crown, and First Five may consume its public projections without putting viewer profiles in core.

Implementation phases:

Current status: phases 1, 3, and 4 plus the safe new-install and legacy-import portions of phase 2 are implemented in [Viewer Foundation contract and threat model](viewer-foundation.md). The authenticated local wizard provides status, privacy export, audited correction, confirmed deletion, an exact legacy-file preview, and digest-locked import through the active provider's serialized queue. Derived point-milestone achievements are included. Link-management refinement and live acceptance remain incomplete.

1. **Contract and threat model**
   - define stable internal viewer IDs, platform-account keys, link provenance, unlink behavior, and exactly which consumers may read which projections;
   - classify identity links, progression, analytics, achievements, and public card fields separately;
   - define opt-in/disclosure choices, pseudonymous default behavior, correction, export, deletion, retention, and moderator/broadcaster authorization.
2. **Isolated storage and migration**
   - create a versioned add-on manifest, private state schema, atomic writes, backups, corruption quarantine, and bounded replay fingerprints;
   - migrate archived `viewer-progression.json` and configured account links only through an explicit preview/confirm workflow;
   - prove failed migration leaves both the source and current installation usable.
3. **Identity service**
   - resolve platform-scoped identities without name guessing;
   - support explicit creator-approved cross-platform links with uniqueness/collision validation;
   - issue read-only pseudonymous projections and invalidate them immediately after unlink/delete.
4. **Progression service**
   - implement creator-authored fixed event awards, strict stable-ID/simulation gates, cross-platform cooldowns, levels, achievements, spend/refund, and audit reason codes;
   - never infer points from message length, money, gift catalog value, or hidden exchange rates;
   - serialize changes so concurrent events cannot double-award or overspend.
5. **Community Analytics module**
   - add attendance/session/counter fields through the same stable viewer authority;
   - cap events and retention, keep raw chat text out of the record, and label approximate presence honestly;
   - publish bounded viewer and aggregate read projections rather than sharing the backing state file.
6. **Administration and public API**
   - add authenticated link, unlink, correction, export, delete, reset, and health controls;
   - expose capability-checked read projections for Viewer Spotlight, Bloom, games, Fan Crown, First Five, and cooldown consumers;
   - guarantee a failing optional consumer cannot mutate or block Viewer Foundation.
7. **Acceptance**
   - test identity collision, replay, simulation, corrupted state, failed writes, restart, migration rollback, concurrent awards/spends, unlink, deletion during in-flight activity, and consumer version mismatch;
   - live-test a linked cross-platform viewer, an unlinked platform-scoped viewer, correction, export, deletion, progression award/spend/refund, and downstream projection invalidation.

### 9. Bloom Companion — Back burner

Bloom Companion is intentionally deferred at the creator's request. Do not schedule implementation or acceptance work for it while the non-companion safety, creator-control, viewer-service, and accessibility tracks remain open. If reconsidered later, keep artwork, animation state, interaction rules, and companion storage entirely optional.

### 10. Games and interactive extensions — Idea collection

Choose the Adventure, Chat Arena, Prediction Game, Companion Care, Fishing, and Trivia should remain add-ons or later Twitch Extensions. Browser-heavy, account-linked games are better Twitch Extension candidates; chat-command versions can use the bridge add-on API. Rewards must be cosmetic or creator-defined until viewer identity and anti-abuse controls are complete.

### 11. Category Pilot — Packaged 2.6.0

Build a clean-room, Windows-only automatic game/category add-on inspired by the useful workflow of Automatic Game Switcher, without copying its implementation. `thsv.category-pilot` should use StreamBridge's existing authenticated Streamer.bot connection, private add-on state, live-session tracking, scene state, capability broker, and wizard instead of creating another socket, timer system, desktop dialog, or broad Streamer.bot global.

Recommended behavior:

- one approved, triggerless Streamer.bot controller reports a bounded snapshot of candidate game processes and performs provider category changes through documented `CPH` methods;
- scan only creator-approved folders, ignore launchers, anti-cheat helpers and crash reporters, and never include raw paths in logs, diagnostics, safe exports, or network requests;
- default to **Suggest only** mode; an unknown executable appears in a review queue with proposed provider mappings and is never changed automatically at low confidence;
- allow **Automatic for approved mappings** only after the creator confirms the executable and each platform mapping;
- require the candidate to remain stable for a configurable debounce period before changing anything, serialize changes, and enforce a cooldown to prevent category flapping;
- provide per-session and timed manual locks, pause/resume actions, an emergency disable control, and a configurable no-game grace period before returning to provider-specific defaults;
- learn from a manual category change only when the creator explicitly chooses **Save as mapping**; unrelated manual edits must not silently rewrite mappings;
- announce category changes only when explicitly enabled, with independent destination and message controls; startup announcements remain disabled by default;
- stop category mutation while offline and optionally gate detection to selected OBS, Meld, or Streamlabs scenes;
- store platform mappings independently rather than assuming one category name is valid everywhere.

Platform support must be represented honestly:

| Platform | Planned behavior |
| --- | --- |
| Twitch | Full approved game-category mapping by category ID/name. |
| Kick | Approved mapping by Kick category name, independently configurable from Twitch. |
| YouTube | Optional broad category/default mapping, such as Gaming; do not promise exact per-game categories. |
| TikTok/TikFinity | Unsupported until a documented category-update capability exists. |

Wizard sections should be compact and collapsible: Quick start, Detection and privacy, Detected games, Platform mappings, Defaults and timing, Announcements, Manual controls, and Diagnostics. Tests must cover offline suppression, folder allowlists, unknown and competing processes, debounce/flapping, manual locks, restart recovery, duplicate probes, provider-specific failures, and the imported action permission boundary.

Do not carry forward direct OAuth-token access, raw Helix calls, Windows Forms configuration, a ten-action/timer package, forced Just Chatting on startup, automatic low-confidence matches, full-path diagnostic output, or unverified accuracy claims.

### 12. Live Beacon — Packaged 2.6.0

Build `thsv.live-beacon` as a multi-platform Discord go-live notification add-on. It should consume StreamBridge's normalized `stream.online` lifecycle instead of adding platform-specific WebSocket connections, then dispatch exactly one creator-approved, triggerless Streamer.bot Discord action through the existing capability broker.

Platform link behavior:

| Platform | Planned link |
| --- | --- |
| Twitch | `https://twitch.tv/{channelLogin}` |
| YouTube | `https://youtube.com/watch?v={broadcastId}` when a broadcast ID is available, otherwise a creator-approved fallback channel URL. |
| Kick | `https://kick.com/{channelLogin}` |
| TikTok/TikFinity | `https://www.tiktok.com/@{username}/live`, using an explicitly configured TikFinity lifecycle event or manual fallback until a dependable native online trigger is documented. |

Required behavior:

- preserve platform, stable stream or broadcast ID, channel identity, title, category, start time and optional thumbnail in normalized `stream.online` payloads before implementing the add-on;
- allow independent Twitch, YouTube, Kick and TikTok switches plus either one combined notification or separate provider notifications;
- coalesce platforms that become live within a configurable metadata window so a simultaneous multistream produces one Discord notification instead of several role pings;
- persist the last notified stream identity and start time so reconnects, replayed events and bridge restarts cannot repost the notification;
- suppress simulations except through an explicit **Send Discord test** control;
- use validated provider identifiers to construct links rather than accepting an arbitrary URL from incoming event data;
- keep the Discord webhook secret in the approved Streamer.bot delivery action, never in StreamBridge settings, add-on packages, safe exports, URLs, diagnostics or logs;
- start with plain text and provider links; make rich embeds, thumbnails, webhook avatar and TTS opt-in advanced features;
- keep Live Beacon separate from Discord Chat Archive because notification and archive destinations have different privacy, retention and moderation requirements.

Wizard sections should remain short and collapsible:

1. **Quick setup** — enable, provider switches, combined or separate notification mode.
2. **Channel links** — detected identities, editable fallbacks, and YouTube broadcast-link preference.
3. **Discord destination** — approved action, configured status, and explicit test.
4. **Messages** — separate templates, supported tokens, character counters, and rendered previews.
5. **Role notification** — opt-in numeric role ID with `<@&ROLE_ID>` preview.
6. **Delivery rules** — once-per-stream deduplication, metadata/coalescing delay, retries and quiet failure reporting.

Replace the reference automation's random 1.5–3.5-second delay with a meaningful configurable 10–20-second metadata/coalescing delay. Chat-like human timing is unnecessary for a webhook notification. Live acceptance must cover individual platforms, simultaneous multistream startup, reconnect/restart replay, missing metadata, a failed Discord action, role-mention validation, simulations, and TikTok's explicitly degraded fallback.

### 13. Clip Courier — Packaged 2.6.0

Build `thsv.clip-courier` as a clean-room Twitch clip-to-Discord add-on. Its primary path is an imported Twitch-only `!clip` command that creates the previous creator-selected 30 or 60 seconds and immediately publishes the returned stable clip to a normal Discord channel or forum/media-channel post. Optional background discovery may consume the shared cache, but only clips timestamped inside the currently observed stream session qualify. The add-on must not depend on a third-party clip scanner, creator-authored JSON file, direct Twitch OAuth access, or another WebSocket connection.

Supported clip intake:

- clips created through the THSV/Streamer.bot clip command, using the documented create-clip result immediately;
- bounded recent-clip discovery through one creator-approved Streamer.bot lookup action while the broadcaster is live, with stable clip-ID deduplication across restarts;
- an explicit moderator **Publish clip** action for a validated Twitch clip ID or URL;
- an optional compatible normalized clip-created relay when another trusted provider supplies a stable Twitch clip ID.

Discord destination modes:

| Mode | Behavior |
| --- | --- |
| Normal channel | Post one bounded message or embed containing the title, clip URL, creator and optional stream/category context. |
| Forum or media channel | Create one post per clip using the sanitized clip title as `thread_name`, the clip URL as the starter content and optional creator-selected forum tag IDs. |
| Both | Advanced opt-in mode that performs two separately tracked deliveries and reports partial failure without retrying the successful destination. |

Recommended behavior:

- use the Twitch clip ID as the durable idempotency key so scanner overlap, reconnects, restarts and action retries cannot repost the same clip;
- retain only bounded clip metadata, delivery status and Discord message/thread IDs in private add-on state;
- keep webhook URLs exclusively in editable Streamer.bot Set Argument sub-actions and never send them to StreamBridge, packages, safe exports, diagnostics or logs;
- build and validate the Discord payload in the reviewed Streamer.bot controller rather than reading an arbitrary local JSON path;
- validate clip URLs and IDs, thread names, forum tag snowflakes, creator identity and avatar URLs before delivery;
- disable all Discord mentions by default with an explicit `allowed_mentions` policy;
- use Discord's confirmed-response mode, correlate the returned message/thread ID, honor bounded rate-limit retries and route failures to the add-on's health/status card;
- use a THSV-branded webhook identity by default; representing the clip creator's display name and avatar must be an explicit, clearly explained option;
- provide editable title/content templates, preview, test delivery, tag selection, duplicate history, manual retry and manual forget controls;
- never instruct creators to paste their webhook secret into a third-party editing website. A future edit operation should use the same private Streamer.bot action and retained Discord identifiers.

Wizard sections should be compact and conditional: Quick setup, Clip discovery, Discord destination, Forum settings, Message appearance, Filters and deduplication, Test and status, and Advanced recovery. Forum-only controls must disappear when Normal channel is selected.

The supplied reference package should not be copied directly. It stores the webhook, JSON path, clip data, creator identity and tag IDs in broad persisted globals; reads an arbitrary file; logs the complete JSON; has no stable clip deduplication; and performs an unrestricted raw webhook request without a correlated result. Clip Courier replaces those boundaries with one-use relay authorization, private bounded state and a reviewed Discord delivery contract.

### 14. Follower Pulse — Packaged 2.6.0

`thsv.follower-pulse` now uses one approved triggerless Streamer.bot action to page Twitch's official `GET /helix/channels/followers` endpoint. Streamer.bot retains its broadcaster OAuth token; each page is returned with a fresh one-use relay token, and StreamBridge performs the private comparison only after a complete bounded scan. Twitch still has no unfollow event, so the result means **no longer listed**, not a provider-confirmed reason.

Initial platform support:

| Platform | Planned behavior |
| --- | --- |
| Twitch | Packaged with authorized 100-item Helix pages, a silent first baseline, a 500-follower safety ceiling, and two complete missing scans by default. |
| YouTube | Unsupported for individual removal tracking because subscriber results can be private and the returned list may be limited. Aggregate subscriber trends may be a separate future feature. |
| Kick | Unsupported until a documented complete follower-list and removal contract exists. |
| TikTok/TikFinity | Unsupported until a documented complete follower-list and removal contract exists. |

Required safety and correctness:

- create the first successful complete scan as a silent baseline; never report its differences as removals;
- identify viewers by stable Twitch user ID and treat login/display names as mutable presentation fields;
- abort the entire comparison when authorization is missing, any page fails, pagination is incomplete, a response is malformed, or the returned data unexpectedly collapses;
- mark a missing ID as **Pending confirmation**, then require a second complete snapshot after a configurable grace period and, when supported, an individual follow-status confirmation before recording the change;
- clear a pending removal when a follow event or later snapshot contains the ID again;
- allow the same viewer to follow, leave and follow again without permanent suppression;
- serialize scans, discard any incomplete in-memory scan after restart, cap pages and retained identities, and show creators when their audience is too large for the configured scan budget;
- default to a daily scan with conservative configurable intervals; never poll every few minutes or while an earlier scan is incomplete;
- store follower IDs and change history only in private add-on state with bounded retention, export and explicit deletion controls;
- keep all identity-level results inside the authenticated wizard. Do not post names to chat, overlays, Discord, logs, safe exports or public reports;
- expose aggregate gained, no-longer-listed and net-change trends separately from the private identity review;
- distinguish unfollow-like removal from deleted, suspended, blocked or otherwise unavailable accounts whenever the provider supplies enough evidence; otherwise label the reason unknown.

The add-on reuses normalized `channel.follow` events to update its baseline promptly and schedules reconciliation through StreamBridge. Its fixed controller reads the already-authenticated Streamer.bot broadcaster credential only inside the action and never relays, logs, or persists it. The add-on opens no additional socket.

Wizard sections should be compact and privacy-first: Overview, Twitch authorization and scan budget, Schedule, Pending confirmations, Private change history, Aggregate trends, Retention and deletion, and Diagnostics. Identity history should be collapsed and protected by an additional confirmation before export.

Do not copy the supplied export's implementation. It accesses Twitch OAuth directly, stores the full follower ID/name dictionary in a broad persistent Streamer.bot global, performs an hourly full-list scan, omits the final follower due to an off-by-one loop, does not validate HTTP status or pagination completeness, can interpret authorization/API failures as removals, and suppresses legitimate repeat follow/remove cycles for the rest of the session.

### 15. Chat Guard — Packaged 2.6.0, optional enforcement implemented

The first `thsv.chat-guard` observe-only slice is now implemented. It is disabled by default, subscribes only to normalized public `chat.message`, applies bounded literal and heuristic signals plus normalized exact parent/subdomain allow/deny policy, accepts stable-ID and role exemptions, and persists only salted hashes plus incident metadata. Its authenticated wizard view exposes aggregate counts, an explicit observe-only provider-capability matrix, confirmed clearing, a non-persisting sample-message rule tester, creator-approved temporary link permits bounded by expiry and use count, and recent pseudonymous incident labels for confirmed/false-positive acceptance tracking. Permits bypass domain policy only; all other observation rules remain active. It exposes no Streamer.bot action, outbound-chat permission, or provider-moderation capability and must not attempt to replace every provider's native AutoMod system.

Required behavior:

- match viewers by stable platform user ID while treating usernames and display names as mutable presentation fields;
- support exact domain allowlists/denylists and normalized URL parsing instead of relying on one broad `http`/`www` regular expression;
- provide broadcaster, moderator, VIP, configured-role, and explicitly permitted-viewer exemptions;
- issue short-lived one-use or timed link permits without placing viewers in broad persistent Streamer.bot groups;
- expose independent Observe only, Warn, Delete, and Timeout policies, with destructive enforcement disabled until the creator explicitly approves it;
- use provider-specific capability gates and hide actions that a platform cannot perform;
- serialize enforcement for one message, deduplicate replayed events, and retain a bounded private audit record without storing full chat indefinitely;
- offer dry-run fixtures, message preview, rule test, false-positive reporting, and an emergency disable action.

Wizard sections should be compact: Quick setup, Link policy, Exemptions, Temporary permits, Enforcement, Audit and retention, and Test and diagnostics. Chat Guard must reuse the normalized chat stream and existing Streamer.bot capability broker rather than attaching another trigger chain or WebSocket client.

An advanced **Incident response** section may later incorporate the useful part of the reviewed Mass Ban workflow without importing its DLL:

- inspect only a bounded recent-message window already observed by StreamBridge;
- let the moderator enter one or more phrases/domains and preview every matching message and stable user ID before taking action;
- exclude the broadcaster, bot accounts, moderators, VIPs, configured trusted users, and users manually removed from the candidate list;
- require an explicit second confirmation that states the exact number of accounts and the selected Warn, Timeout, or Ban operation;
- cap the number of accounts per run, serialize provider mutations, stop on abnormal failure rates, and return per-user success/failure results;
- support Twitch first through documented Streamer.bot blocked-term, warn, timeout, and ban methods; expose other platforms only after equivalent capabilities are verified;
- optionally add reviewed phrases to the provider's blocked-term list as a separate action, never as an automatic side effect of a mass moderation run;
- retain a bounded private incident record with the initiating operator, reason, candidate count, result count, and timestamps, but not an indefinite copy of the surrounding chat;
- provide simulation and Observe only modes that cannot perform provider mutations.

The incident-response implementation must use reviewed source and one approved Streamer.bot controller. It must not ship an opaque native DLL, open a separate desktop window, toggle follower-only mode automatically, contact a third-party licensing/telemetry service, or allow an ordinary public chat command to execute mass moderation.

Do not copy the reviewed starter package's null-unsafe group checks, scheme-only URL expression, hard-coded timeouts, direct Twitch-only deletion assumptions, or creator-editable control flow.

### 16. Creator Controls — Packaged 2.6.0

Build `thsv.creator-controls` as a disabled-by-default moderator and broadcaster control surface for safe stream administration. It should combine title changes, category changes, and supported chat-mode controls without turning ordinary public commands into unrestricted channel-management operations.

Planned controls:

- set stream title with provider-aware length validation and a rendered confirmation;
- set provider category/game through approved mappings, sharing mapping infrastructure with Category Pilot where practical;
- enable or disable supported follower-only, subscriber-only, emote-only, and slow modes;
- expose manual wizard controls and optional command bindings with an explicit broadcaster/moderator ID allowlist;
- read back the provider result when available and report success, partial failure, or unsupported rather than trusting a local toggle;
- rate-limit mutations, serialize competing requests, preserve an audit trail, and provide an emergency disable action;
- keep Twitch, YouTube, Kick, and TikTok capabilities independent rather than presenting Twitch operations as universal.

Wizard sections should be Quick setup, Approved operators, Titles, Categories, Chat modes, Command bindings, Audit, and Diagnostics. High-impact actions should support preview/confirmation, and every generated Streamer.bot controller must remain triggerless except for creator-approved command or quick-action entry points.

Do not copy hard-coded command IDs, persisted mode booleans that can drift from provider state, or broad moderator permissions from the reference export.

### 17. Chat Play Pack — Packaged and automated-accepted 2.5.0

`thsv.chat-play-pack` is an optional lightweight entertainment package. Its first packaged slice includes Number Guess, creator-authored Trivia, and Prediction; Coin Flip and Random Joke remain stateless main-wizard command templates.

Required behavior:

- reuse normalized public commands, unified viewer identity, shared cooldowns, and the source-platform response router;
- keep game state bounded per channel/session and recover safely after restart;
- avoid blocking sleeps or long-running work inside Streamer.bot's shared action queues;
- provide neutral editable messages and localization-ready templates;
- use cosmetic or creator-defined rewards only; never grant moderator/VIP privileges or spend financial/reward state by default;
- separate simulated games from production statistics and provide reset/export controls;
- cap participation, concurrency, rounds, retained history, and outbound messages during chat bursts.

Wizard sections should be Game selector, Shared rules, Per-game settings, Messages, Rewards, State and reset, and Preview. Coin Flip may ship first as a main command template; the add-on is justified only when shared multi-round state, statistics, or several games are enabled.

Do not copy the reviewed package's temporary VIP reward, rude default responses, blocking delays, variable-name mistakes, or unlicensed joke/message corpus.

### 18. Viewer Spotlight — Packaged 2.6.0, expanded presentation and request flows

The packaged `2.5.0` expansion now covers the disabled-by-default, disclosure-gated self-only `!card` path; creator-only manual cards; single, fade-carousel, and credits-scroll presentation; aggregate identity-free Stream Score; derived achievements; exact-ID Twitch reward requests with fulfill/refund settlement; optional Discord channel/forum snapshots; bounded queues/cooldowns/session limits; and immediate Viewer Foundation deletion cleanup. Only pseudonymous cooldown IDs and timestamps are persisted. Provider-support fields remain off, and reward/Discord mutations remain provider-pending until witnessed live.

Build `thsv.viewer-spotlight` as a standalone presentation add-on that turns explicitly approved Viewer Foundation and Community Analytics projections into customizable viewer cards and a separate stream-score overlay. It must never become the authority for identity, points, ranks, achievements, attendance, or financial/support history.

#### Product surfaces

Viewer Spotlight owns two independent browser-source routes:

1. **Viewer Card** — a requested or creator-selected profile card containing only fields enabled by the creator and permitted by the viewer/privacy policy.
2. **Stream Score** — an aggregate, non-profile overlay containing current-session totals, records, and high scores that are safe to display publicly.

The two surfaces must have separate URLs, queues, visibility controls, themes, and preview buttons so a creator can place the persistent score independently from temporary cards in OBS, Meld, or Streamlabs-compatible Browser Sources.

#### Required dependencies and integrations

| Relationship | Requirement |
| --- | --- |
| StreamBridge core | Reuse normalized events, the authenticated wizard, add-on permissions, one overlay transport, diagnostics, and browser-source hosting. |
| Viewer Foundation | Required for unified viewer ID, explicit linked accounts, points, level, achievements, privacy deletion/export, and season/all-time rank. |
| Community Analytics | Optional for messages, commands, observed sessions, attendance, first/last seen, lurks, and provider-specific engagement/support counters. If absent, those fields disappear rather than showing invented zeroes. |
| Rewards | Twitch Channel Points and any verified future reward provider may request a card; reward intake does not own card data. |
| Commands | `!card` or a creator-selected alias requests the invoking viewer's card through the existing normalized command path and source gate. |
| Fan Crown / First Five | Optional read-only badges or achievements; neither add-on may write Spotlight's state or replace Viewer Foundation rank. |
| Bloom / games | Optional consumers of points and achievements; their private state must not be included on a card without an explicit public projection. |
| Discord | Optional explicit snapshot delivery through the shared approved Discord controller. No webhook secret or direct Discord client belongs in Viewer Spotlight. |

#### Viewer projection contract

Viewer Foundation should issue a bounded, versioned read projection for one stable viewer ID. Viewer Spotlight may cache it only long enough to render or retry the active request. The projection should distinguish missing, unavailable, private, and zero values.

Recommended field groups:

| Group | Examples | Default |
| --- | --- | --- |
| Identity | Display name, validated avatar, selected platform badges | Name and source-platform badge on; linked-account details off |
| Progression | Points, level, current threshold, achievements | On only when Viewer Foundation is enabled and disclosed |
| Ranking | Current stream, monthly/season, or all-time eligible rank | Off until the creator selects one ranking policy |
| Presence | Sessions observed, first seen, last seen, check-ins, lurks | Off by default |
| Engagement | Messages and commands for today/season/lifetime | Today on; lifetime off |
| Provider support | Twitch Bits/sub months/gift subs, YouTube memberships/Super Chats, Kick subscriptions/gifts, TikTok gifts/like milestones | Entire group off by default |
| Add-on badges | Fan Crown holder, First Five placements, approved game/companion achievements | Off until each source add-on is installed and approved |

Never merge provider currencies, infer monetary value from gifts, or describe approximate presence as true watch time. If continuous provider presence is unavailable, label the metric **Observed active time** and document what events count toward it. A Twitch watch streak is a provider-specific shared event, not a universal watch-time measurement.

#### Request and rendering flow

```text
command / reward / moderator selection / wizard preview
    -> normalized viewer-card request
    -> resolve stable viewer identity
    -> enforce consent, ignore, cooldown, and visibility policy
    -> request bounded Viewer Foundation projection
    -> optionally attach Community Analytics projection
    -> clamp and render creator-selected public fields
    -> publish one overlay lifecycle ID
    -> started / heartbeat / ended / failed result
    -> remove request from bounded queue
```

Required request sources:

- viewer self-request through `!card`;
- supported reward redemption for the redeeming viewer;
- broadcaster/moderator manual selection by stable platform user lookup;
- creator-only wizard preview using fake or explicitly selected local projection data;
- optional achievement, level-up, Fan Crown, or First Five event after the creator enables that exact automatic source.

Requests must have per-viewer and global cooldowns, a bounded queue, an expiry time, duplicate suppression, and a maximum number of automatic cards per stream. One viewer cannot request another viewer's private card. Simulations must use fake/test projections and cannot change production points, analytics, rank, achievements, or consent.

#### Display modes

Viewer Card supports:

- **Spotlight** — show one card for a configured duration, then fade and report completion;
- **Fade carousel** — fade through eligible approved cards using shuffle-without-repeats and refresh only after a full cycle;
- **Credits scroll** — move equal-height cards through a fixed viewport for Ending/BRB credits without resizing individual cards.

Stream Score supports:

- **Solid** — a persistent aggregate panel with creator-selected session totals and record values;
- optional compact and full layouts, but no viewer-identifying carousel inside the score source.

Every mode must use fixed aspect-ratio-safe containers, avatar fallbacks, line clamps, bounded text, minimum/maximum font sizes, and responsive previews at 1920x1080 plus representative cropped sources. Animation must use transform/opacity rather than layout-resizing that produces warping or blur.

#### Score, rank, and reward rules

Keep three concepts separate:

1. **Progression points** — Viewer Foundation's creator-configured earn/spend balance.
2. **Engagement score** — a bounded, non-monetary ranking score for participation.
3. **Provider support statistics** — factual provider-specific quantities or exact currency values that do not automatically become either score.

Community Analytics may calculate an engagement score only from an explicit creator policy. Every contributing event needs a per-stream/per-day cap so repeated messages, commands, likes, or small support events cannot dominate a rank. Money must never be converted into points by an implicit exchange rate. Display rank only among disclosed eligible participants; allow a minimum cohort size before showing an exact rank.

#### Privacy and retention

- Viewer Spotlight starts disabled and shows a plain-language disclosure checklist before activation.
- The creator selects every public field; provider support and lifetime history remain off by default.
- Raw chat text, private/operator messages, account-link records, platform access tokens, webhook secrets, and untrusted avatar bytes are never stored in Spotlight state.
- Bot, service-account, ignored-viewer, and opt-out policies run before projection or queue insertion.
- `!card` or a card reward can authorize one public display, but cannot silently authorize permanent Discord publication or unrestricted lifetime profiling.
- Viewer Foundation owns export, correction, unlink, and deletion. A deleted/opted-out viewer must disappear from future cards, carousel pools, rank results, and cached snapshots.
- Discord delivery requires an additional creator action or an explicitly configured, clearly disclosed policy. The add-on never auto-posts every card.
- Diagnostics use pseudonymous request/lifecycle IDs and reason codes, not card contents or viewer history.

#### Wizard organization

Use short collapsible sections with progressive disclosure:

1. **Quick setup** — dependency status, enable switch, card/score URLs, copy buttons, and previews.
2. **Requests** — command, reward, moderator/manual, achievement, cooldown, queue, and expiry controls.
3. **Card fields** — separate Identity, Progression, Rank, Presence, Engagement, Support, and Add-on badge groups.
4. **Ranking policy** — stream/month/season/all-time selection, eligible cohort, score caps, and preview.
5. **Display mode** — Spotlight, Fade carousel, or Credits scroll with conditional controls.
6. **Appearance** — theme, background/image, opacity, platform colors, font, sizing, avatar, borders, and responsive preview.
7. **Stream Score** — aggregate field selection, solid layout, records, and reset boundaries.
8. **Privacy** — disclosure, ignored viewers/bots, opt-outs, minimum cohort, retention, and Viewer Foundation export/delete links.
9. **Discord** — disabled-by-default destination, approved action, rendered snapshot preview, and explicit test/send.
10. **Maintenance** — dependency health, projection test, queue status, reset cache, diagnostics, and failure history.

Unsupported fields must disappear instead of being greyed out. The wizard should state whether each visible value is Verified provider data, Creator-defined score, Approximate activity, or Unavailable.

#### Implementation phases

1. **Foundation contracts**
   - finalize Viewer Foundation identity/progression/privacy service;
   - make Community Analytics write through the same viewer authority;
   - define versioned read-only viewer and aggregate projection contracts;
   - prove opt-out, deletion, correction, replay, and restart behavior before rendering.
2. **Single-card minimum**
   - scaffold add-on manifest, settings, permissions, health, migrations, and private ephemeral state;
   - implement `!card`, wizard preview, stable identity resolution, cooldowns, queue bounds, and Spotlight mode;
   - render identity plus points/level only, with missing-avatar and unlinked-viewer behavior.
3. **Analytics and rank**
   - add selected engagement/presence fields;
   - implement session/season eligibility and capped engagement scoring in Community Analytics;
   - add rank cohort protection, missing/private value handling, and achievement badges.
4. **Provider-specific support**
   - map only verified stable-ID events for Twitch, YouTube, Kick, and TikTok/TikFinity;
   - retain provider labels/currencies independently;
   - add per-field disclosure, visibility, and simulation tests.
5. **Additional display modes**
   - add fade carousel with shuffle-without-repeats;
   - add credits scroll with fixed geometry and lifecycle completion;
   - add automatic achievement/rank-up sources with strict per-stream caps.
6. **Stream Score**
   - add the separate solid aggregate route;
   - define stream/session rollover and record persistence in Community Analytics;
   - test missing providers, partial failures, and restart continuity.
7. **Discord snapshot**
   - render a bounded PNG/card snapshot without exposing browser control URLs;
   - use the shared approved Discord normal-channel/forum controller;
   - require explicit send/test and return the correlated result.
8. **Release acceptance**
   - package matching `.thsv-addon` and Streamer.bot import;
   - run migration, malformed-state, privacy deletion, dependency absence, restart, overload, visual, and accessibility tests;
   - live-test command/reward/manual requests and provider-specific fields in OBS, Meld, and a Streamlabs-compatible Browser Source.

#### Acceptance gates

The single-card foundation is package-testable but the full Viewer Spotlight product is not ready to mark complete until:

- Viewer Foundation is installed, version-compatible, and live accepted for identity/progression/privacy operations;
- no second viewer identity or authoritative points database exists;
- card requests cannot bypass opt-out, ignore, role, cooldown, queue, or simulated-event policy;
- deleting a viewer removes them from projections, ranks, carousel pools, caches, and future Discord snapshots;
- every provider-specific statistic has a verified source, stable identity policy, and honest label;
- cards remain crisp, aligned, unclipped, and readable with long names, missing avatars, maximum fields, transparency, and cropped browser sources;
- overlay reconnect, lifecycle failure, and a missing dependency cannot block core chat, alerts, or unrelated add-ons;
- live tests confirm that one command/reward produces one card and one explicit Discord send produces at most one post.

### 19. Viewer Lobby — Packaged 2.6.0

Build `thsv.viewer-lobby` as a clean-room, multi-platform play-with-viewers queue. Viewers can join or leave from their source-platform chat, while the broadcaster and approved moderators manage the queue through a local authenticated dock or the StreamBridge wizard. A separate public browser-source overlay shows only creator-approved queue fields.

The useful reference behavior is a self-service waiting list, moderator add/remove/reorder controls, next/random selection, queue position replies, and a transparent overlay. Do not copy its external DLL, opaque “No Touchy Code” actions, remotely hosted widget, or implementation. Viewer Lobby must use reviewed source, local StreamBridge state, the existing normalized command/event path, and the core-hosted overlay transport.

#### Product surfaces

Viewer Lobby owns three coordinated but permission-separated surfaces:

1. **Viewer commands** — low-risk self-service join, leave, position, and public queue-summary requests.
2. **Operator dock** — private local controls for open/close, add/remove, reorder, accept, skip, next, random selection, clear, and session maintenance.
3. **Public overlay** — read-only queue/status/now-playing presentation for OBS, Meld, and Streamlabs-compatible Browser Sources.

The public overlay URL must never grant mutation authority. The dock must not accept commands merely because a caller can load the public overlay.

#### Queue lifecycle and states

One initial release supports one active lobby at a time. A lobby has `closed`, `open`, `paused`, and `completed` lifecycle states. Closing stops new joins but preserves existing entries; pausing also prevents automatic advancement. Completing archives only a bounded summary and clears active entries after explicit confirmation.

Each entry has a stable random `entryId`, platform-scoped user key, optional Viewer Foundation ID, source platform, bounded display-name snapshot, optional validated avatar URL, optional gamertag, join timestamp, current position, and one state:

- `waiting`;
- `selected`;
- `invited`;
- `playing`;
- `completed`;
- `skipped`;
- `no-show`;
- `removed`.

Only waiting/selected/invited/playing entries appear in the active public projection. Removed/completed history is bounded and private. Raw chat text, command payloads, access tokens, and account-link records are never queue fields.

Default transitions:

```text
closed -> operator opens -> open
viewer joins -> waiting
operator next/random -> selected
operator confirms invite -> invited
operator starts player -> playing
operator completes/skips/no-show -> terminal entry state
next eligible waiting entry -> selected
operator closes -> closed with entries preserved
verified stream offline -> auto-close and persist, or clear only if creator selected that policy
```

Every mutation must be serialized and revision-checked so simultaneous joins, dock actions, reconnects, or duplicate command deliveries cannot assign the same position or select the same viewer twice.

#### Identity and duplicate policy

- Use stable platform user IDs, never display-name-only identity.
- Without Viewer Foundation, Twitch, YouTube, Kick, and TikTok identities remain separate and are labeled platform-scoped.
- With Viewer Foundation, explicitly linked accounts may collapse to one queue eligibility identity. The creator chooses whether the displayed card uses the join source or a preferred linked identity.
- One eligible person receives one active entry. Repeated joins return the existing position without moving the entry.
- Renames update presentation only after a verified event; they do not create a new entry.
- Bots, system actors, ignored viewers, banned users, and unsupported private/operator chat cannot join.
- A viewer may edit their own gamertag through a bounded explicit command when enabled, but cannot change another viewer's entry.

#### Commands and source routing

Recommended editable defaults:

| Command | Audience | Behavior |
| --- | --- | --- |
| `!join [gamertag]` | Viewer | Join the open queue or return the existing position. |
| `!leave` | Viewer | Remove the invoking viewer's active waiting/selected entry according to creator policy. |
| `!position` / `!pos` | Viewer | Reply privately where supported or in source-platform chat with the invoking viewer's position. |
| `!queue` | Viewer | Return a bounded summary such as open/closed state, count, and next few public names. |
| `!gamertag <value>` | Viewer, optional | Set or replace only the invoking viewer's bounded gamertag. |
| `!queue-open`, `!queue-close`, `!queue-next` | Broadcaster/moderator, optional | Optional chat controls; dock/wizard controls are recommended by default. |

All replies route only to the invoking platform. Command aliases, prefix, roles, cooldowns, source platforms, maximum queue size, and message templates are wizard-configured. TikTok commands remain available only through the accepted TikFinity chat relay; the wizard must show any identity or reply limitations.

#### Operator dock

The dock should be a compact local page served by StreamBridge, suitable for OBS/Meld/Streamlabs custom browser docks and a normal browser. Authentication should use the existing loopback control boundary with a deliberate pairing/login flow; do not place a reusable bearer secret in the public overlay URL.

Required controls:

- queue status, open, close, pause, resume, and count;
- drag or up/down reorder with stale-revision conflict reporting;
- add by validated platform plus stable user lookup;
- remove with optional reason;
- select Next or Random with a bounded party-size selector;
- mark Invited, Playing, Completed, Skipped, or No-show;
- move an entry back to waiting;
- copy a gamertag without exposing it in the public overlay;
- clear with queue name/count confirmation and backup;
- undo the most recent safe operator mutation when no later revision conflicts;
- show operator identity, mutation result, and a bounded audit history.

Random selection must use a cryptographically adequate unbiased shuffle over eligible waiting entries. FIFO remains the default. The dock must display which policy selected the viewer.

#### Public overlay

Provide separate copyable URLs for:

- **Full queue** — ordered entries up to a creator limit;
- **Compact queue** — status plus the next configurable number of viewers;
- **Now and next** — current playing/selected viewer and a short upcoming list.

Creator controls:

- queue title and open/closed/paused labels;
- show/hide position, avatar, platform badge, display name, and gamertag independently;
- platform colors, unified custom color, transparency, background/image, font, size, spacing, borders, shadows, alignment, and animation;
- maximum visible entries with an honest “and N more” indicator;
- hide when closed, hide when empty, or retain a status bar;
- bottom-up or top-down direction;
- crisp fixed-height rows that do not stretch or warp with long names, missing avatars, or cropped browser sources.

The overlay subscribes through the core-hosted namespaced add-on topic and receives revisioned read-only projections. It must reconnect to the latest snapshot without replaying old join animations or opening another Streamer.bot/platform connection.

#### Fairness, abuse, and privacy

- FIFO is the recommended default; Random is explicit and reports that it was random.
- Do not sell queue priority, infer priority from money, or silently favor subscribers/moderators. Any creator-defined eligibility rule must be visible before a viewer joins.
- Optional subscriber/member/follower requirements must be provider-specific and fail closed when verification is unavailable.
- Enforce per-user command cooldowns, a global join rate, capacity, entry/gamertag length, operator mutation rate, and maximum party size.
- Strip control characters and markup from gamertags; public display is off by default because a gamertag may identify an account outside the streaming platform.
- Provide trusted/blocked lists, opt-out, manual removal, and a creator-visible reason without publicly announcing disciplinary details.
- Persist active state atomically across bridge restarts, but use bounded retention for completed/removed/no-show history.
- Expose export and delete controls. Viewer Foundation deletion must remove or anonymize matching active/history entries without corrupting positions.
- Simulated events can exercise the overlay and dock with fake identities but cannot join or mutate a production lobby.

#### Optional integrations

- **Viewer Foundation:** deduplicate linked cross-platform accounts and expose optional achievement/level eligibility; never require points to join by default.
- **Scene Actions:** creator-approved scene changes may open, pause, close, or switch overlay layout. Viewer Lobby consumes normalized scene state and must not add duplicate scene triggers.
- **Viewer Spotlight:** an operator may explicitly spotlight the selected player, but the lobby cannot read or publish private card fields directly.
- **Games:** a future game may consume the selected party through a bounded public contract; it cannot write the queue store.
- **Discord:** not part of the initial release. A later explicit session summary may use the shared Discord contract, but individual gamertags and removals remain private by default.

#### Wizard organization

Use short collapsible sections:

1. **Quick setup** — dependency status, enable, commands, maximum size, operator-dock URL, overlay URLs, preview.
2. **Joining rules** — platforms, roles, capacity, duplicate/link policy, gamertag requirements, cooldowns.
3. **Queue behavior** — FIFO/random, party size, no-show/skip/rejoin policy, stream offline/restart behavior.
4. **Viewer messages** — joined, already joined, closed, full, position, selected, removed, and error templates with per-platform limits.
5. **Operator permissions** — broadcaster/moderator stable-ID allowlist, dock pairing, optional chat controls, audit retention.
6. **Public fields** — avatar, platform, name, gamertag, position, status, privacy warning.
7. **Overlay appearance** — full/compact/now-next layouts, colors, typography, geometry, transparency, animations.
8. **Scene automation** — optional approved scene gates and actions; hidden when Scene Actions/capability is absent.
9. **Maintenance** — current revision, active/history counts, export, clear/reset, dependency health, diagnostics.

Unavailable platform capabilities and integrations disappear instead of appearing as inert grey controls. Destructive controls state exactly what will be removed and require confirmation.

#### Implementation phases

1. **Clean-room contract**
   - document queue lifecycle, entry states, stable identity keys, permissions, revisioning, and public/private projections;
   - define command and operator mutation schemas plus error/reason codes;
   - create threat/privacy model for dock authentication, gamertags, linked identities, and destructive actions.
2. **State engine**
   - implement atomic private state, queue capacity, serialized mutations, deterministic positions, duplicate suppression, restart recovery, retention, and migration;
   - test simultaneous joins/leaves, stale dock revisions, clear/undo, crash recovery, and corrupted state.
3. **Viewer commands**
   - add source-routed join, leave, position, queue, and optional gamertag commands through normalized Multi-Commands;
   - implement bot/role/platform/ignore/cooldown/capacity gates and bounded response templates;
   - verify linked and unlinked identities without requiring Viewer Foundation.
4. **Operator API and wizard panel**
   - implement authenticated open/close/pause/reorder/add/remove/next/random/status transitions;
   - add action audit, conflict errors, confirmation, and safe undo;
   - expose the same controls in the wizard before building the external dock.
5. **Operator dock**
   - create the paired local dock using revisioned snapshots and authenticated mutations;
   - test multiple open docks, disconnects, stale state, accidental double-clicks, and expired authentication.
6. **Public overlays**
   - add Full queue, Compact queue, and Now and next projections and themes;
   - implement responsive fixed geometry, platform/unified colors, privacy field switches, reconnect snapshot, and bounded animations;
   - visually test 1920x1080, cropped sources, long Unicode names/gamertags, missing avatars, maximum entries, transparency, and host scaling.
7. **Optional integrations**
   - add Viewer Foundation linked-account deduplication;
   - add explicit Scene Actions automation and Viewer Spotlight selected-player request;
   - keep every integration capability-checked and independently disableable.
8. **Packaging and live acceptance**
   - generate matching `.thsv-addon` and Streamer.bot package with no external DLL/widget dependency;
   - run install/update/rollback/remove, migration, permission, overload, privacy deletion, and failure-isolation tests;
   - live-test Twitch, YouTube, Kick, and TikTok/TikFinity join/leave/position flows, moderator dock operations, queue overlay updates, restart recovery, and scene automation in each supported host.

#### Acceptance gates

Viewer Lobby is not ready to package until:

- no public overlay URL or viewer command can call operator mutations;
- one stable viewer receives at most one active entry under the configured linked/platform-scoped policy;
- simultaneous joins and operator actions never duplicate positions or selections;
- queue state survives an ordinary restart and corrupted state degrades only Viewer Lobby;
- clear/reset/reorder/random/next operations are audited, bounded, confirmed where destructive, and safe under stale revisions;
- public projections exclude private reasons, linked account IDs, hidden gamertags, and opted-out viewers;
- source-platform replies and platform character limits are correct;
- overlays remain crisp and ordered at maximum capacity and after reconnect;
- missing Viewer Foundation, Scene Actions, avatars, or a platform reply capability causes a clear degraded mode rather than blocking the queue;
- no external DLL, remote widget, separate provider socket, or unreviewed code is required.

## Reviewed starter-package exclusions

The S•Kit review produced reusable product ideas, not approved source code. The following patterns are explicitly excluded from StreamBridge and official add-ons:

- embedded Discord webhook URLs or tokens, including in `.sb` exports, arguments, logs, diagnostics, examples, or safe exports;
- duplicated raw Discord clients where the shared reviewed Discord delivery contract is available;
- hard-coded action, command, group, reward, or trigger identifiers;
- keyword-based automatic greetings that can repeatedly fire on ordinary words such as `hi` or `hey`;
- static `!commands` responses that advertise unavailable or disabled commands;
- temporary channel privileges as game rewards;
- hostile, insulting, or creator-unreviewed public response text;
- long delays inside shared Streamer.bot execution queues;
- copied third-party joke or response libraries without a compatible license and attribution;
- unsigned opaque DLL dependencies, external license checks, usage registration, or exception-report uploads that are not required for the creator-facing feature;
- Twitch-only mutations presented as though they work identically on every platform.

## Shared Discord destination contract

Every current and future Discord-output add-on should offer a clearly named **Normal channel** or **Forum channel** destination when the feature makes sense. The same reusable delivery contract and reviewed C# template should validate HTTPS Discord webhook URLs, keep the secret in Streamer.bot, neutralize mentions, bound content, use confirmed responses, return correlated message/thread IDs, and handle retryable rate limits without exposing response bodies or secrets.

Destination behavior must remain feature-specific:

- **Clip Courier:** one forum post per clip, or one message per clip in a normal channel;
- **Live Beacon:** one forum post per stream session, or one normal go-live message; coalesced platform updates may be replies in the same session thread;
- **Discord Chat Archive:** one bounded forum thread per stream session or configured date window, then append chat batches to that thread; never create one forum post per viewer message;
- **Viewer Spotlight:** one explicitly approved card snapshot per delivery; automatic overlay displays never imply Discord consent;
- future reports, quotes and analytics should declare whether they create a new thread, append to a known thread, or send a normal message before the creator enables them.

Forum delivery requires either a known `thread_id` to append or a `thread_name` to create a post. Optional `applied_tags` must be creator-selected IDs from that forum, and required-tag failures must be visible in the wizard. Streamer.bot's plain-text Discord helper remains suitable for normal channels; forum creation needs the reviewed raw Discord execute-webhook path because the helper does not expose thread creation or forum tags.

## Later utility candidates

- Free Game Check is packaged with scheduled/manual checks, offer caching, duplicate suppression, selected-platform chat output, and provider attribution; Discord delivery remains a possible later expansion;
- Quote Vault and Creator Utility Pack are packaged separately; the latter owns counters and polls with independent settings and source-platform routing, while Village Draw exclusively owns giveaways;
- moderation dashboard and bounded chat-history tools beyond Chat Guard's narrow enforcement scope;
- Clip Library Cache now shares bounded Twitch clip metadata between consumers; caching video bytes or expiring signed playback URLs remains intentionally out of scope until storage, expiry, and provider-policy requirements are settled;
- Accessibility Captions now provides ephemeral high-contrast browser captions; Voice Relay remains the separate TTS boundary;
- add-on publisher signing, revocation, and trusted-update metadata.

## Rules for every add-on

Every public add-on must:

1. declare a unique module ID, compatible core versions, permissions, settings schema, owned state, migrations, and health checks;
2. reuse StreamBridge's event bus, Streamer.bot connection, scheduler, state, and overlay host instead of starting another bridge or socket;
3. degrade independently and leave core chat, alerts, commands, and timed actions healthy;
4. require creator approval for live messages, action execution, media, or provider credentials;
5. store secrets only in protected local secret storage, never safe exports, logs, URLs, or package settings;
6. bound queues, files, message lengths, retries, concurrency, and retention;
7. provide offline fixtures, upgrade/rollback tests, malformed-input tests, and a live acceptance checklist;
8. show a clear dependency error with the official main download page when StreamBridge is missing or too old.

## Dependency-ordered execution plan

Completed packaging work remains listed in the portfolio table. This sequence describes what happens next and what each later project depends on.

### Track A — Stabilize the released baseline

1. Complete clean-install, update, rollback, uninstall, backup/restore, custom-port, wizard, and Streamer.bot connection acceptance for published core `2.5.0`.
2. Run and record the remaining offline and provider acceptance for all thirty-three packaged add-ons, prioritizing financial and reward mutations before cosmetic outputs.
3. Fix resulting defects in the smallest affected package, rerun the full automated gate, regenerate matching packages/index/checksums, and establish the next stable patch baseline before adding executable add-ons.
4. Maintain the creator-facing [acceptance ledger](add-on-acceptance-ledger.md) so **Published**, **Offline accepted**, and **Provider accepted** remain visibly different.

### Track B — Finish bounded main and shared contracts

5. Main-wizard Commands/Help, Coin Flip, Twitch Follow Age, timed-message packs, and event-style templates are implemented. Follow Age uses the reviewed Helix path rather than unstable native-sub-action serialization; keep Random Joke optional and use only original or compatible licensed content.
6. Live-accept the completed shared Discord destination controller for normal-channel and forum delivery, including secret isolation, explicit mention rules, correlated results, bounded rate-limit retries, and Chat Archive's one-thread-per-session behavior.
7. Live-accept Ko-fi stable-ID/replay behavior and confirm Streamer.bot preserves a raw stable ID in one live Streamlabs donation event; keep both providers fail-closed until their acceptance evidence is recorded.
8. Extract shared clip lookup/cache, provider category-control, moderation-capability, and scene-state contracts only when two accepted consumers require them; avoid speculative framework layers.

### Track C — Build the viewer stack in order

9. Live-accept the packaged Viewer Foundation identity, progression, privacy export/deletion/correction, consumer projections, and failure isolation across supported platforms.
10. Live-accept packaged Community Analytics session rollover, bounded counters, ignored viewers/bots, approximate-presence labels, reports, and deletion propagation.
11. Live-accept packaged Viewer Spotlight self-requested and creator-manual single cards, disclosure, cooldowns, protected rank, overlay hosts, reconnects, and deletion cleanup.
12. Derived Viewer Foundation achievements are implemented without a second identity store. Add the archived migration only after the packaged new-install/privacy path is accepted and the wizard can preview every imported record before confirmation.
13. Add Viewer Spotlight provider-specific support fields only after each event mapping has stable identity and honest labels.
14. Fade-carousel, credits-scroll, and a creator-only identity-free Stream Score are implemented for offline/browser acceptance. Add paid reward requests only with explicit fulfill/refund handling, and add Discord snapshots only after the shared destination's privacy and provider acknowledgement are accepted.

### Track D — Moderation and creator controls

15. Validate Chat Guard Observe only mode; literal rule matching, stable-ID trust controls, bounded pseudonymous retention, and zero enforcement authority are implemented. Accept false-positive behavior and provider capability reporting before designing Warn/Delete/Timeout/Ban.
16. Add Chat Guard Incident Response only after preview, two-step confirmation, per-run caps, serialization, abort thresholds, and per-user result reporting are proven.
17. Category Pilot is packaged in Suggest only mode; live-accept Windows detection, privacy, debounce, mapping review, manual locks, and the opt-in automatic mode.
18. Creator Controls is packaged on the provider mapping/controller contract; live-accept manual title/category/chat-mode mutations separately from Category Pilot's automatic detection.

### Track E — Independent participation, communication, and discovery add-ons

19. Viewer Lobby's clean-room state engine, normalized commands, wizard operator panel, authenticated dock, and public Full/Compact/Now-and-next overlays are packaged; live-accept stable identity, revision conflicts, queue fairness, restart recovery, privacy, and integrations.
20. Live Beacon is packaged with normalized stream identity, metadata, deduplication, and coalescing; live-accept each enabled provider and private Discord destination.
21. Live-accept Clip Courier's shared Discord forum controller and Clip Library Cache consumption contract.
22. Live-accept Discord Chat Archive's channel/forum contract without changing its one-thread-per-session privacy boundary.
23. Follower Pulse is packaged with bounded follower snapshots and private two-scan reconciliation; complete live Twitch authorization and refollow acceptance.
24. Free Game Check and Creator Utility Pack are packaged and automated-accepted; complete their offline and genuine-provider rows in the acceptance ledger.

### Track F — Optional entertainment and accessibility

25. Rebuild Speaker.bot Orchestration with filtering, emergency stop, queue/interruption policy, and live speech acceptance.
26. Back burner: reconsider Bloom Companion against Viewer Foundation projections and the accepted media lifecycle only after the higher-priority non-companion tracks are complete.
27. Chat Play Pack is packaged with Viewer Foundation award idempotency; retain Coin Flip and Random Joke as main templates when persistent game state is unnecessary.
28. Evaluate larger games as independent add-ons or Twitch Extensions. Accessibility Captions and shared clip metadata caching are packaged; binary clip prefetch remains deferred pending privacy, storage, expiry, and provider-policy decisions.
