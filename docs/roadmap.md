# Roadmap

Completion status is tracked in the [milestone checklist](milestones.md).

## Milestone 1: Bridge Core

Implemented in version `0.1.0` and live-validated against Streamer.bot Alpha. Version `0.2.0` adds the Milestone 1.1 security, reliability, truthfulness, extensibility, and test hardening pass before feature work.

## Milestone 2: Streamer.bot Package Foundation

Implemented in version `0.3.0` and review-hardened in `0.3.1`. The repository now includes a versioned receiver package, reviewed C# source, a portable Streamer.bot import, a single-source platform-neutral argument contract, automated export-integrity checks, and live validation against Streamer.bot `1.0.5-alpha.31`.

## Milestone 3: Multi-Chat

Implemented in version `0.4.0` and review-hardened in `0.4.1`. Multi-Chat projects normalized chat events into one versioned platform-neutral contract, ships as a portable receiver-dependent Streamer.bot action, normalizes unsafe control/whitespace characters without damaging Unicode, derives common role flags, exposes identity/timestamp/order/provenance fields, and keeps private, system, and operator messages outside the public path. Production platform transports remain later adapter work.

## Carried requirements

- Milestone 8 must contextually HTML-escape every chat field at its rendering sink and correlate moderation/deletion events by `multiChatEventId`.
- Badge icons, name colors, subscription tiers, and other visual presentation metadata are intentionally deferred to the Milestone 8 schema/design pass; adapters must not hide them in unreviewed platform-specific shared fields.
- Production adapter milestones must test reconnect replay against persisted deduplication and must classify human, bot, system, public, private, and operator events explicitly.
- Creator-configurable bot suppression remains deferred until real adapters can supply verified bot provenance; contract `1.1.0` exposes `multiChatIsBot` so consumers can make an explicit policy decision now.

## Planned milestones

1. Bridge Core — complete
2. Streamer.bot Package Foundation — complete
3. Multi-Chat — complete
4. Multi-Commands
5. Multi-Alerts
6. Speaker.bot Orchestration
7. Multi-Timed Actions
8. Meld Overlay Hub
9. Viewer Identity and Progression
10. Games and Companion Systems
11. Installer and Public Release
