# Architecture

```text
platform/integration -> adapter -> schema validation -> normalization
                     -> TTL deduplication -> internal event bus -> routing
                     -> Streamer.bot -> actions and future outputs
```

## Boundaries

- `schemas`: versioned event and configuration contracts.
- `bridge/adapters`: platform- or integration-specific transports. Shared logic never switches on platform payload shapes.
- `bridge/core`: deduplication, event bus, and orchestration.
- `bridge/services`: configuration, logging, atomic state, and HTTP diagnostics.
- `apps`: executable service entrypoints.
- `tools`: configuration validation and fixture simulation.

One adapter failure is logged and isolated. Disabled adapters are not started and do not create warnings. Readiness requires every enabled adapter to be connected; liveness remains healthy while the process can serve diagnostics.

## Normalized event

Schema version `1.0.0` requires identity, type, platform, source, receive time, channel, payload, and metadata. User data is conditional. The root contract accommodates chat, commands, financial engagement, follows/subscriptions, raids, moderation, lifecycle, custom, and timed events.

Raw payloads are discarded unless `security.preserveRawPayloads` is explicitly enabled. Log redaction always removes fields named like credentials or raw payloads.

## Deduplication

Identity uses `platform + eventType + source.eventId` when available. Without a source ID, it hashes platform, type, channel, user, and normalized payload. Entries expire after `deduplication.ttlMs`, and oldest entries are evicted beyond `maxEntries`.

The fallback can collapse two genuinely separate events with identical normalized content inside the TTL. It can also miss duplicates whose normalized content changes. It is intentionally bounded and is not permanent event storage.
