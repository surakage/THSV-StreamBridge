# Architecture

```text
platform/integration -> adapter -> schema validation -> normalization
                     -> TTL deduplication -> internal event bus -> routing
                     -> Streamer.bot -> actions and future outputs
```

## Boundaries

- `schemas`: versioned event and configuration contracts.
- `bridge/adapters`: registered input/output transports, shared normalization helpers, and adapter factories. Shared logic never switches on platform payload shapes.
- `bridge/core`: deduplication, event bus, and orchestration.
- `bridge/services`: configuration, logging, atomic state, and HTTP diagnostics.
- `apps`: executable service entrypoints.
- `tools`: configuration validation and fixture simulation.

Core receives adapters from `AdapterRegistry`; it does not construct platform implementations. Platform configuration and output configuration are validated records, so a registered provider can be added without editing core. Streamer.bot implements the same output contract future sinks will use.

One adapter failure is logged and isolated. Disabled adapters are not started and do not create warnings. Readiness requires every enabled input/output adapter to be connected and degrades after the configured consecutive delivery-failure threshold. Liveness remains healthy while the process can serve diagnostics.

## Normalized event

Schema version `1.0.0` requires identity, type, platform, source, receive time, channel, payload, and metadata. User data is conditional. Standard event names remain documented, while lowercase namespaced event types and new platform identifiers provide an extension point. Adapter authors can use `buildNormalizedEvent` for consistent boilerplate.

Raw payloads are discarded unless `security.preserveRawPayloads` is explicitly enabled. Log redaction always removes fields named like credentials or raw payloads.

## Deduplication

Identity uses `platform + eventType + source.eventId` when available. Without a source ID, it hashes canonical key-sorted JSON containing platform, type, normalized channel/user names, and payload. Entries expire after `deduplication.ttlMs`, oldest entries are evicted beyond `maxEntries`, and the bounded cache is persisted across restarts by default.

The fallback can collapse two genuinely separate events with identical normalized content inside the TTL. It can also miss duplicates whose normalized content changes. It is intentionally bounded and is not permanent event storage.
