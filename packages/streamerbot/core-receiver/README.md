# THSV StreamBridge Core Receiver

This is the portable Streamer.bot package foundation for THSV StreamBridge. It contains one platform-neutral action named `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group.

The action validates the normalized event envelope supplied in `streamBridgeEvent`, rejects malformed or unsupported events without logging raw payloads, and exposes the stable `streamBridge*` argument contract documented in `manifest.json`. The JSON envelope is the only wire-level source of truth; every derived output is cleared before validation and populated only after validation succeeds. Later StreamBridge packages consume these arguments instead of depending on Twitch, YouTube, Kick, TikTok, or Facebook payload shapes.

## Install

1. Open Streamer.bot and select **Import**.
2. Drag `THSV-StreamBridge-Core-Receiver-1.0.4.sb` into the import field, or paste the file contents.
3. Confirm the package metadata and import the `THSV StreamBridge - Receive Event` action.
4. Keep the bridge configuration `streamerbot.actionAlias` set to that exact action name.
5. Enable the Streamer.bot WebSocket server, start the bridge, and run `npm run simulate`.

The `.sb` file is Base64-encoded and contains an `SBAE` header followed by gzip-compressed export JSON. The readable C# source and manifest are committed beside it so package changes can be reviewed and reproduced.

## Validation boundary

The bridge performs the authoritative full Zod-schema validation. The receiver independently checks the schema version, required objects and fields, field types used by downstream actions, identifier syntax, limits for exposed identity fields, and the timestamp. Platforms remain intentionally open lowercase identifiers, and event types remain intentionally open lowercase namespaced identifiers.

Future feature sub-actions must run only after `streamBridgeValid` is true. They must consume the receiver's derived arguments and must not copy the envelope parser or trust caller-supplied flattened arguments.

## Execution and dependencies

The exported action uses Streamer.bot's non-blocking **Default** queue with **Concurrent** enabled. Each invocation remains stateless, and its immediate child chain still runs in declared order; separate events no longer share one global serial execution slot. The bridge controls bounded ingress and delivery concurrency. The C# source depends on the bundled CPH API and Streamer.bot's default Newtonsoft.Json/JObject reference. Package `1.0.4` adds the bridge-validated optional `streamBridgeViewerId` output.

Contract `1.2.0` retains receive time, bridge sequence, and actor type while adding the optional unified viewer identity. The bridge overwrites caller-supplied sequence and viewer identity values after validation; sequence numbers are process-local and may contain gaps after rejected delivery attempts.

For each adopted Streamer.bot Alpha release, recompile the receiver, rerun the manual QA matrix below, and update `minimumStreamerBotVersion` if compatibility changes.

## Manual QA matrix

- Valid simulated event: action completes with `streamBridgeValid=True` and matching derived values.
- Malformed JSON or missing required field: `streamBridgeValid=False`, a readable validation error is set, and all derived values remain empty/default.
- Invalid `eventType` or `platform` syntax: receiver rejects the event.
- Mismatched caller-supplied flattened arguments: receiver ignores them and derives values only from `streamBridgeEvent` after validation.
- Two queued events: each action history entry contains only its own derived values.
- Fresh profile: import succeeds and C# compiles without adding references manually.
- Coexistence: deleting the `THSV StreamBridge` group leaves unrelated actions and global variables unchanged.

## Uninstall

Delete the `THSV StreamBridge` action group. The receiver creates no global variables, files, scheduled tasks, or actions in other groups.

## Boundaries

This receiver remains projection-only. Feature packages implement chat, commands, alerts, speech, timed actions, overlays, identity, and progression; games remain a later milestone.
