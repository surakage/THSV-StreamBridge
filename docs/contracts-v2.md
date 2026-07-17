# Core contracts v2 preview

Stage 2A introduces `2.0.0-preview.1` contracts alongside the stable v1 runtime. Nothing imports these contracts from `apps/bridge-service.ts` yet; that separation is deliberate so contract review does not change a running installation.

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

Stage 2B must archive excluded configuration and state before runtime wiring changes. Stage 2C will connect these contracts to the module registry. No preview contract should be advertised as runtime-active before those gates pass.

