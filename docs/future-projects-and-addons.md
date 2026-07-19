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

Package hashes prove that installed bytes match the package descriptor. They do not prove who published it. Until a free publisher-signing workflow such as Minisign or Sigstore attestations is added to releases, executable add-ons remain a trusted-publisher feature and declarative packages remain the preferred public tier.

## Priority add-ons

### 1. Random Clip Player

Best first add-on because it exercises the full public API without changing core scope.

Responsibilities:

- request a creator-approved Streamer.bot action that retrieves Twitch clip metadata through the creator's connected Twitch account;
- keep only bounded clip IDs, URLs, titles, creator names, duration, and rotation history in private add-on state;
- choose clips randomly without repeats until the eligible library is exhausted;
- publish one `media.play` request with a unique `playbackId` to the core-hosted add-on overlay;
- wait for `started`, `heartbeat`, and `ended`; retry or skip on `failed` or `timeout`;
- expose scene allowlists, clip age/category filters, minimum/maximum duration, mature-content policy, volume, transition, interval, and no-repeat settings in its wizard page;
- support Starting Soon, BRB, and Ending use without directly controlling OBS, Meld, or Streamlabs;
- reuse the bridge's existing Streamer.bot and overlay transports and refuse to run when the required main version/capabilities are absent.

Acceptance requires live Twitch retrieval plus playback checks in OBS, Meld, and Streamlabs-compatible Browser Sources. A simulated clip list can test rotation without going live.

### 2. Automated Shoutouts

Build as an add-on instead of expanding core commands. It should react to creator-selected raids, first chat, manual commands, or approved groups/teams; use stable viewer identity; enforce per-channel cooldowns; and send through the shared source/selected-platform outbound router. Pronouns and team membership should be optional provider data with a readable fallback when unavailable. It must never issue repeated shoutouts after reconnect replay.

### 3. User Translate

Provide explicit commands such as `!en text` and reply-to-message translation. Preserve the original author's display name, split output using the destination platform's limit, enforce request timeouts and rate limits, and return a short tutorial when no text is supplied.

Translation text leaves the local machine for a third-party service even when no API key is required. The wizard must disclose that fact, name the service, link its privacy terms, let the creator disable it per platform, and avoid retaining source or translated messages. An undocumented Google endpoint is not a dependable production contract; the add-on needs a replaceable provider interface and a failure message that does not expose raw URLs or stack traces.

### 4. Auto Translate

Keep separate from user-requested translation because it has much greater privacy, moderation, rate-limit, and chat-spam impact. Require opt-in channels/languages, bot-account availability, allow/ignore lists, bounded concurrency, duplicate suppression, and a maximum translated-message percentage. Ship only after the manual User Translate add-on is stable.

### 5. Donation providers

Streamlabs and Ko-fi should be separate provider add-ons. Each must preserve its provider event ID, verify webhook signatures or trusted Streamer.bot provenance, carry money as decimal strings, and maintain distinct alert identity and colors. Do not merge them with Twitch Bits, YouTube Super Chats, Kick KICKs, or TikTok gifts. Financial intake must use durable delivery and dead letters before public release.

### 6. Speaker.bot orchestration

Rebuild the archived feature against normalized events and the public capability API. Add content filtering, per-event allowlists, voice selection, queue limits, interruption rules, and a creator-visible emergency stop before allowing alert text to be spoken aloud.

### 7. Viewer identity and progression

Rebuild only after platform account-linking, privacy export/deletion, moderator correction, replay-safe rewards, and migration rules are designed. This add-on can later provide a shared identity service to games, companions, and cooldown systems without putting viewer profiles in core.

### 8. Bloom Companion

Depends on the progression add-on and hosted media lifecycle. Keep artwork, animation state, interaction rules, and companion storage entirely optional. It should continue a sleep pose until a wake event, use non-looping transition animations, and remain visually stable across browser-source sizes.

### 9. Games and interactive extensions

Choose the Adventure, Chat Arena, Prediction Game, Companion Care, Fishing, and Trivia should remain add-ons or later Twitch Extensions. Browser-heavy, account-linked games are better Twitch Extension candidates; chat-command versions can use the bridge add-on API. Rewards must be cosmetic or creator-defined until viewer identity and anti-abuse controls are complete.

## Later utility candidates

- moderation dashboard and bounded chat-history tools;
- quote, counter, giveaway, and poll helpers;
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
3. Add free publisher authentication and add-on update metadata.
4. Build Automated Shoutouts and User Translate using the shared outbound router.
5. Add Streamlabs and Ko-fi providers after financial durability acceptance.
6. Rebuild Speaker.bot, identity/progression, Bloom, and games only after their privacy and safety dependencies are complete.
