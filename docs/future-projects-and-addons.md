# Future projects and add-on roadmap

This document separates responsibilities that belong in THSV StreamBridge core from optional creator features. The goal is a small, dependable main installation and add-ons that reuse its authenticated services instead of opening competing processes or WebSocket connections.

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

## Installation and update model

The recommended public build remains a portable, self-contained Windows x64 ZIP hosted on the official GitHub Releases page. The wizard may check that official repository for a newer stable release and show its notes and download link. Activation remains an explicit creator action so an unavailable network, malformed release, or unexpected version can never replace a healthy live bridge.

Add-on archives use the `.thsv-addon` extension. Creators can upload one in the authenticated wizard or copy it to `data/addons/inbox/`. Inbox discovery is intentionally not auto-install: the wizard validates the archive, displays its identity, requested permissions, compatibility, and integrity status, then requires approval. Installed add-ons appear in one selector; selecting an add-on opens only that add-on's settings.

Package hashes prove that installed bytes match the package descriptor. They do not prove who published it. Release packaging emits a checksummed add-on index, and the wizard now performs a manual read-only version, compatibility, publisher, and revocation check against that official index. GitHub artifact attestations are the free publisher-authentication path for official releases; live attestation verification and guided package replacement remain future work. Executable add-ons remain a trusted-publisher feature and declarative packages remain the preferred public third-party tier.

## Priority add-ons

### 1. Random Clip Player

Best first add-on because it exercises the full public API without changing core scope.

Responsibilities:

- request a creator-approved Streamer.bot action that retrieves Twitch clip metadata through the creator's connected Twitch account;
- keep only bounded clip IDs, URLs, titles, creator names, duration, and rotation history in private add-on state;
- choose clips randomly without repeats until the eligible library is exhausted;
- publish one `media.play` request with a unique `playbackId` to the core-hosted add-on overlay;
- wait for `started`, `heartbeat`, and `ended`; retry or skip on `failed` or `timeout`;
- fade the final frame for four seconds, then honor the creator's configured between-clips pause;
- expose minimum/maximum duration, pool size, volume, mute, and interval settings in its wizard page;
- provide Streamer.bot Enable and Disable actions that creators can attach to scene-active and scene-inactive triggers;
- support Starting Soon, BRB, and Ending use without directly controlling OBS, Meld, or Streamlabs;
- reuse the bridge's existing Streamer.bot and overlay transports and refuse to run when the required main version/capabilities are absent.

Acceptance requires live Twitch retrieval plus playback checks in OBS, Meld, and Streamlabs-compatible Browser Sources. A simulated clip list can test rotation without going live.

### 2. Automated Shoutouts

Implemented as `thsv.automated-shoutouts` 1.0.0. It category-verifies Twitch targets with Streamer.bot's documented extended-user lookup before automatic promotion; uses platform-specific welcomes for allowlisted YouTube/Kick/TikTok first chats; accepts moderator/broadcaster manual commands; enforces a bounded queue, expiry, per-user/global/per-stream gates and strict destination limits; and sends through the shared source/selected-platform router. It optionally calls Streamer.bot's documented native Twitch shoutout method through a separate approved action. Pronouns and team membership remain deferred. See [Automated Shoutouts](automated-shoutouts.md).

### 3. User Translate

Implemented as `thsv.user-translate` 1.0.0. It supports explicit language commands (`!es text`), a generic command (`!translate es text`), and Twitch reply translation using Streamer.bot's documented reply arguments. Results preserve the original reply author, route only to the source platform, split using the shared platform-aware router, and are protected by bounded pending work, timeouts, and per-user/global cooldowns. The default documented no-key MyMemory provider requires an explicit source language; the wizard states that requested text leaves the local machine and the add-on never retains source or translated messages. See [User Translate](user-translate.md).

### 4. Auto Translate

Implemented as `thsv.auto-translate` 1.0.0 and kept separate from User Translate because automatic translation has greater privacy, moderation, rate-limit, and chat-spam impact. It starts disabled and allowlist-only, uses explicit source and target languages, skips commands/bots/system actors/simulations, supports allow and ignore lists, bounds concurrency and provider requests, suppresses duplicates, caps translations per minute, and enforces a maximum translated-message percentage. Results route only to the original platform and source/translated text is never persisted. See [Auto Translate](auto-translate.md).

### 5. Donation providers

Streamlabs and Ko-fi should be separate provider add-ons. Each must preserve its provider event ID, verify webhook signatures or trusted Streamer.bot provenance, carry money as decimal strings, and maintain distinct alert identity and colors. Do not merge them with Twitch Bits, YouTube Super Chats, Kick KICKs, or TikTok gifts. Financial intake must use durable delivery and dead letters before public release.

Current progress: Ko-fi Donations 1.0.0 is implemented for stable-ID donation intake; live Ko-fi test-webhook acceptance remains pending. Streamlabs remains deferred until a provider-stable donation ID is documented or confirmed from a real trigger capture.

### 6. Community analytics

Build the StreamSuite-inspired feature set as an optional analytics add-on, not core. The useful pieces are attendance, first-chat/check-in tracking, stream start/end sessions, returning-viewer detection, per-stream summaries, simple interaction counters, and exportable local reports. The add-on should store its own private state through StreamBridge instead of scattering persistent Streamer.bot globals across unrelated actions.

Responsibilities:

- track attendance from normalized first-message, check-in command, and approved reward events;
- keep bot/service-account ignore lists in the wizard;
- distinguish new, returning, and already-counted viewers within a stream session;
- count follows, raids, subscriptions, memberships, gifts, cheers, Super Chats, TikTok gifts, and TikTok like milestones only when stable event identity is available;
- expose session summaries in the wizard and optional local report export;
- never claim official analytics, revenue, payout, or tax accuracy;
- keep all reset/clear operations explicit and backup-friendly.

Do not include private contact messages, carrier email-to-SMS, personal local paths, or credential-bearing report delivery. Those are intentionally out of scope for public add-ons.

### 7. Multi-platform Subathon

Build Subathon after donation providers and high-impact event identity are stable. It should consume normalized events from Twitch, YouTube, Kick, TikTok, Ko-fi, and Streamlabs, then publish a core-hosted timer overlay that counts down and increases through creator-defined event rules.

Responsibilities:

- define per-platform contribution rules such as subscription adds time, gift count multiplies time, cheer/Super Chat/donation amount adds time, raid size adds time, and TikTok like milestones add time;
- support max total time, max per-event add, happy-hour multipliers, pause/resume, manual add/remove, reset with backup, and live-only gating;
- show timer, goal, last contributor, event rotator, and optional safety state in one hosted overlay;
- require simulated preview before live use;
- record every accepted timer mutation with event ID, platform, amount, rule, and resulting timer value;
- ignore unsupported or unstable events until the provider has verified stable IDs.

The add-on should not use a downloaded UI DLL or direct OBS control. The wizard and hosted overlay already provide the safer configuration and display layer.

### 8. Speaker.bot orchestration

Rebuild the archived feature against normalized events and the public capability API. Add content filtering, per-event allowlists, voice selection, queue limits, interruption rules, and a creator-visible emergency stop before allowing alert text to be spoken aloud.

### 9. Viewer identity and progression

Rebuild only after platform account-linking, privacy export/deletion, moderator correction, replay-safe rewards, and migration rules are designed. This add-on can later provide a shared identity service to games, companions, and cooldown systems without putting viewer profiles in core.

### 10. Bloom Companion

Depends on the progression add-on and hosted media lifecycle. Keep artwork, animation state, interaction rules, and companion storage entirely optional. It should continue a sleep pose until a wake event, use non-looping transition animations, and remain visually stable across browser-source sizes.

### 11. Games and interactive extensions

Choose the Adventure, Chat Arena, Prediction Game, Companion Care, Fishing, and Trivia should remain add-ons or later Twitch Extensions. Browser-heavy, account-linked games are better Twitch Extension candidates; chat-command versions can use the bridge add-on API. Rewards must be cosmetic or creator-defined until viewer identity and anti-abuse controls are complete.

## Later utility candidates

- Free Game Check as a separate posting add-on with scheduled/manual checks, offer caching, duplicate suppression, Discord/webhook output, platform-chat output, and preview-before-post controls;
- Quote Vault is now implemented as its own moderated cross-platform add-on; counter, giveaway, and poll helpers remain candidates for a future Creator Utility Pack with independent enable switches and source-platform routing;
- moderation dashboard and bounded chat-history tools;
- creator-approved scene automation using documented OBS/Meld/Streamlabs APIs;
- local clip cache and prefetch helper for unreliable connections;
- accessibility packs such as high-contrast overlays, caption relays, and TTS controls;
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

## Recommended build order

1. Finish live acceptance for the main v2 preview and publish its portable release.
2. Build Random Clip Player as the reference executable media add-on.
3. Polish installed add-on setup screens so every add-on uses compact sections, clear toggles, and hidden advanced controls.
4. Completed: use the generated add-on index for manual wizard update, compatibility, publisher-mismatch, unlisted-package, and revocation warnings.
5. Complete live acceptance for Automated Shoutouts, User Translate, and Auto Translate.
6. Add Streamlabs and Ko-fi providers after financial durability acceptance.
7. Build Community Analytics from the safe StreamSuite ideas.
8. Build Multi-platform Subathon on top of verified provider events.
9. Add Free Game Check and the Creator Utility Pack.
10. Rebuild Speaker.bot, identity/progression, Bloom, and games only after their privacy and safety dependencies are complete.
