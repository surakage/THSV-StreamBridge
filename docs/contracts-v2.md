# Core contracts v2 preview

Stage 2 introduces `2.0.0-preview.1` contracts on the preview branch while stable `1.x` remains on `main`. The service now starts its built-in projections through the module registry, and the Streamer.bot Core Receiver/Multi-Commands preview packages no longer expose progression identity.

The v2 contract directory is a staged preview, not a second live event pipeline. Production adapters and ingestion still use `schemas/event.ts`; only the reward, add-on package, command-sync, module-manifest, and capability contracts currently have production consumers. The remaining chat, alert, command, configuration-extension, health, and timed-execution schemas are forward contract candidates and must not be treated as load-bearing until a producer and consumer are wired together.

## Published preview contracts

`bridge/contracts/v2/` contains schemas and inferred TypeScript types for:

- normalized core event envelopes;
- chat messages, including public/private/operator visibility and reply/deletion metadata;
- command invocations;
- public alerts;
- timed-action executions;
- reward redemptions;
- adapter capability reports;
- module manifests;
- module configuration extensions;
- module health;
- browser-overlay chat and alert events.

The v2 core event vocabulary deliberately excludes `viewer.progression` and `companion.action`, and its strict metadata object has no `viewerId`. Optional add-ons may later publish their own three-part namespaced event types through the module API, but those types are not core features.

Alerts and reward redemptions require stable source event IDs. Capability reports distinguish supported, unverified, and unsupported operations and require an explanation when a feature is unavailable. Twitch and Kick reward operations are represented individually rather than inferred from a shared `channelRewards` flag.

## Compatibility boundary

Stable `1.x` contracts remain unchanged during Stage 2A. `previewV2ConfigMigration()` parses a v1 configuration, returns a separately validated v2 candidate, lists excluded configuration and state paths, and never writes the source. It retains Bloom-named commands for explicit creator review instead of silently deleting them.

Stage 2B archived excluded source, packages, tests, scripts, documentation, and Bloom assets. Legacy configuration keys load safely but are not reactivated; the migration preview enumerates their preserved state paths and retains creator Bloom commands for review. Stage 2C connected the built-in projections to the registry with dependency ordering, health reporting, and failure isolation. See [Stage 2 completion](stage-2-completion.md).
