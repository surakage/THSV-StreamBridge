# Roadmap

Completion status is tracked in the [milestone checklist](milestones.md).

## Milestone 1: Bridge Core

Implemented in version `0.1.0` and live-validated against Streamer.bot Alpha. Version `0.2.0` adds the Milestone 1.1 security, reliability, truthfulness, extensibility, and test hardening pass before feature work.

## Milestone 2: Streamer.bot Package Foundation

Implemented in version `0.3.0` and review-hardened in `0.3.1`. The repository now includes a versioned receiver package, reviewed C# source, a portable Streamer.bot import, a single-source platform-neutral argument contract, automated export-integrity checks, and live validation against Streamer.bot `1.0.5-alpha.31`.

## Milestone 3: Multi-Chat

Implemented in version `0.4.0` and review-hardened in `0.4.1`. Multi-Chat projects normalized chat events into one versioned platform-neutral contract, ships as a portable receiver-dependent Streamer.bot action, normalizes unsafe control/whitespace characters without damaging Unicode, derives common role flags, exposes identity/timestamp/order/provenance fields, and keeps private, system, and operator messages outside the public path. Production platform transports remain later adapter work.

## Milestone 4: Multi-Commands

Implemented in version `0.5.0` and review-hardened in `0.5.1`. Multi-Commands provides deterministic command and alias parsing, bounded plain-string arguments, portable role and bot authorization, explicit public/private/operator boundaries, five-platform fixtures, and a compiled receiver-dependent Streamer.bot action. The bridge now centrally applies one creator-configured prefix and collision-validated command registry to raw public chat, preventing adapter-specific tokenization drift. Streamer.bot remains responsible for deciding what an authorized command does.

## Milestone 5: Multi-Alerts

Implemented in version `0.6.0` and review-hardened in `0.6.1`. Multi-Alerts projects normalized engagement events into one public, ordered, platform-neutral contract with exact monetary strings, safe quantities, actor identity, inert Unicode text, and explicit transport-verification status. Alert events now require stable upstream identities before deduplication, package invocations no longer share a global serial execution slot, and raw user-controlled alert text is denied for speech by default. Rendering and sound remain intentionally deferred.

## Milestone 6: Speaker.bot Orchestration

Implemented and live-verified in version `0.7.0`, then review-hardened in `0.7.1`. Streamer.bot must explicitly approve every request. Raw event text and unapproved simulated events are denied, bad-word filtering is mandatory, and the package supports speak plus stop/pause/resume/clear without direct triggers. A positive dispatch result confirms only the local transport send; Speaker.bot voice acceptance and playback remain unacknowledged.

## Milestone 7: Multi-Timed Actions

Implemented and live-verified in `0.8.0`, then review-hardened in `0.8.1`. Timers are offline-by-default, follow normalized multi-platform live state, and expose authenticated runtime start/stop/pause/resume controls. Session-relative intervals, independent fixed/random-container timers, no-repeat shuffle cycles, and normalized timing diagnostics remain platform-neutral.

## Carried requirements

- Milestone 8 must contextually HTML-escape every chat field at its rendering sink and correlate moderation/deletion events by `multiChatEventId`.
- Badge icons, name colors, subscription tiers, and other visual presentation metadata are intentionally deferred to the Milestone 8 schema/design pass; adapters must not hide them in unreviewed platform-specific shared fields.
- Production adapter milestones must test reconnect replay against persisted deduplication and must classify human, bot, system, public, private, and operator events explicitly.
- Creator-configurable bot suppression remains deferred until real adapters can supply verified bot provenance; contract `1.1.0` exposes `multiChatIsBot` so consumers can make an explicit policy decision now.
- Command cooldowns and spam throttles must not ship before Milestone 9 establishes cross-platform viewer identity; platform-scoped user IDs would make such limits trivially bypassable.
- Operator/debug commands remain a separate `operator.command-received` pathway and require an explicit future package; the public Multi-Commands package must continue to bypass them.
- Speaker orchestration must continue to default-deny raw actor names, item names, tiers, and messages for TTS. Only creator-authored templates or explicitly allowlisted/filtered fields may be spoken, and simulated alerts must never update production statistics.
- TTS cooldown and repeated-request suppression require creator policy now and must use unified cross-platform identity when Milestone 9 adds a shared implementation; platform-scoped limits must not be presented as bypass-resistant.
- Milestone 8 must decide whether captions are in scope before relying on Speaker Orchestration: the current CPH transport exposes no playback timing, duration, generated file, or engine acknowledgement with which to synchronize them.
- Milestone 8 owns TTS-aware alert priority/preemption and must define how it coordinates with stop/clear, audio ducking recovery, and concurrent speak dispatches.
- URL and markup speech policy remains creator-side: raw event text is denied, and explicitly approved text must be stripped or transformed before TTS when reading links or markup is undesirable.
- Before the first live financial adapter ships, output delivery requires a crash-recoverable durable outbox and replay test; an accepted-but-not-yet-delivered donation must survive process failure.
- Before the first high-volume gift adapter ships, define platform-specific bundle/coalescing behavior and a retry/backpressure policy for capacity rejection.
- Milestone 8 owns alert priority/preemption, subscription lifecycle fields (new/renewal/upgrade, months, streak, gift provenance), avatars, and contextual HTML escaping.

## Planned milestones

1. Bridge Core — complete
2. Streamer.bot Package Foundation — complete
3. Multi-Chat — complete
4. Multi-Commands — complete
5. Multi-Alerts — complete
6. Speaker.bot Orchestration — complete and review-hardened
7. Multi-Timed Actions — complete and review-hardened
8. Meld Overlay Hub
9. Viewer Identity and Progression
10. Games and Companion Systems
11. Installer and Public Release
