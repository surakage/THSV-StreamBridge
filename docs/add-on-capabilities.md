# Add-on capability broker

Executable add-ons receive a frozen `ModuleRuntimeContextV2` from the module host. The host builds that context from the verified package descriptor and the creator's installed-package grants; an add-on's exported object cannot expand its own grant.

The broker is the only supported add-on route to shared framework services:

- `events.subscribe` permits the verified manifest's normalized-event subscriptions. An executable subscriber that omits this permission is rejected before activation.
- `streamerbot.run-approved-action` exposes `context.streamerbot.runApprovedAction(actionId, args)`. The action must be selected by the creator in the wizard after a live Streamer.bot inspection. Matching uses the exact UUID, never the action name. The Core Receiver is always prohibited to prevent recursive ingestion.
- `schedule.bounded` exposes one-shot `context.schedule.after()` tasks from 1 second through 24 hours. Each module may hold at most 16 tasks. Outstanding tasks are cancelled when the module stops or fails.
- `state.private` exposes one atomic JSON object under the module's private state directory. The object is limited to 100 keys and 64 KiB; one module cannot address another module's broker state.
- `overlay.publish` exposes `context.overlay.publish(topic, payload, { lane })` and a core-hosted browser source at `/overlay/addons/<module-id>`. First-party add-ons explicitly select `foreground`, `media`, `timer`, `persistent`, `preview`, or `independent`. `foreground` is the only lane serialized through the shared transient-card queue; queue acceptance resolves immediately so a card waiting behind another presentation cannot exhaust the add-on's event-handler capability scope. Older packages that omit the option retain bounded topic-based compatibility routing. The route exists only while the installed add-on is enabled and declares this permission. Package HTML and JavaScript are never served.
- `media.exclusive` exposes one bounded bridge-internal video slot through `context.mediaSlot`. A permitted add-on may claim it for at most ten minutes, observe ownership changes, or release only its own UUID lease. Higher-priority claims may preempt lower-priority owners; equal-priority add-ons cannot steal an active slot. Module shutdown and lease expiry release ownership automatically. No additional WebSocket is opened.
- `media.cache` optionally prefetches a selected Twitch clip through `context.mediaCache`. The broker accepts only HTTPS Twitch CDN hosts, revalidates every redirect, caps one file at 50 MiB and the shared cache at 250 MiB, expires every file within 24 hours, and exposes it only through a loopback `/overlay/cache/<sha256>.mp4` URL with byte-range support. Add-ons without this permission cannot read or populate the cache.
- `chat.send` exposes `context.chat.send(request)`. A request either replies only to its normalized source platform or targets an explicit unique platform list. Core applies Unicode-safe limits (Twitch 500, YouTube 200, Kick 500, TikTok 150), rejects or safely splits overflow, isolates platform failures, and limits each add-on to ten routing requests per minute. Delivery reuses the reviewed Timed Message Output action over the existing Streamer.bot connection.
- `provider.events.publish` exposes only the provider event methods assigned to a first-party provider module. It is not a generic event emitter: core fixes the provider platform and event type, requires a stable source ID, validates decimal-string money and currency, rate-limits intake, and sends the resulting event through normal deduplication and durable delivery.
- `viewer.foundation.provide` is reserved to the exact official module ID `thsv.viewer-foundation`; another add-on cannot register or replace the provider even if its descriptor requests the permission.
- `viewer.foundation.read` exposes `context.viewerFoundation.getProjection()`. The consumer must also declare `thsv.viewer-foundation` as a manifest dependency. Results contain only the versioned viewer ID, linked flag, creator-named currency, points, level, and next threshold—never raw account links, salts, names, or state records.
- `viewer.foundation.mutate` exposes bounded `add`, `spend`, and `refund` requests. Each request requires an amount, reason, and caller-scoped idempotency key. The broker attaches the verified caller module ID, validates the result, enforces a two-second timeout, and revokes access when either side stops.
- Viewer Foundation deletion propagation stays inside the capability broker. Only the official provider may call `notifyDeleted(viewerId)`, and only declared `viewer.foundation.read` dependents may subscribe with `onDeleted()`. The notice contains one validated pseudonymous viewer ID; listener failures are isolated and logged without exposing identity data.
- `community.analytics.provide` is reserved to the exact official module ID `thsv.community-analytics`; no other package may register or replace its projection provider.
- `community.analytics.read` exposes `context.communityAnalytics.getViewerProjection()` and `getSessionProjection()`. Consumers must declare `thsv.community-analytics` as a dependency. The broker returns only schema-bounded pseudonymous counters and aggregate session state—never names, account IDs, chat text, raw events, money, or the backing state file.

Streamer.bot action requests share the bridge's existing authenticated WebSocket and use its documented correlated [`DoAction` request](https://docs.streamer.bot/api/websocket/requests). The broker limits each add-on to two pending actions and 30 starts per rolling minute; arguments are JSON-only, limited to 50 keys and 64 KiB. Streamer.bot acknowledgement IDs, timeouts, and cancellation remain correlated by the adapter. Stopping or failing a module aborts its pending broker requests without opening another WebSocket.

High-frequency, triggerless, read-only background workers are generated with Streamer.bot's **Exclude from Action Queue Pending/History** flags. This applies to clip lookups, shared clip refresh, Translate processing, Category Pilot process probes, Follower Pulse pagination, and Free Game Check refresh. Creator controls and actions with moderation, reward, scene, chat, Discord, or audio side effects remain visible for audit and troubleshooting.

Every approved action invocation also receives a short-lived, one-use `thsvAddonRelayToken` argument. An action returning a `thsv.addon` envelope must copy that token into `relayToken`; the bridge consumes it only for the module that requested the action. This prevents another Streamer.bot action from claiming an add-on's namespace. Creator-bound Random Clip Player enable/disable actions are the narrow exception: they may publish only the exact boolean control event, allowing scene triggers to pause playback without an outstanding bridge request.

Capability diagnostics report grant, denial, and failure counts by module and never record state, overlay payloads, or action arguments. A denial is isolated to the requesting optional module.

## Hosted overlay topics

Every publication should identify its presentation lane:

- `foreground` for temporary cards, alerts, results, and redemption notices that must not overlap;
- `media` for clip and music playback governed separately by the media slot;
- `timer` for ad, countdown, and subathon state that must update immediately;
- `persistent` for labels, counters, polls, and queue state;
- `preview` for exact wizard previews that never enter the live queue;
- `independent` for captions or other ephemeral surfaces intentionally allowed beside foreground cards.

The lane is behavior, not styling. Stop and hide topics always cancel their matching active/queued presentation before being dispatched. Queue diagnostics expose the active owner, topic, lane, duration, queued timestamp, waiting entries, and configured inter-card gap.

The shared host understands six namespaced presentation topics:

- `<module-id>.card.show` with bounded `title`, `text`, optional HTTPS or same-origin `imageUrl`, and optional `durationMs`;
- `<module-id>.card.hide`;
- `<module-id>.media.play` with a required creator-generated `playbackId`, an HTTPS or same-origin `url`, optional `title`, `posterUrl`, `muted`, `volume`, and `durationMs`;
- `<module-id>.media.stop`, optionally with `fade: true` for the shared 750 ms visual fade;
- `<module-id>.timer.update` with bounded timer text, seconds, live-platform labels, state flags, and allowlisted style values;
- `<module-id>.timer.hide`.

The renderer uses text nodes, clamps displayed lengths and numeric values, rejects unsafe URL protocols and style values, and applies a restrictive Content Security Policy. Package HTML and JavaScript are never served. Chat, alerts, and add-on overlays share the existing `SharedWorker` transport when the streaming host supports it; isolated browser-source processes fall back to one direct connection for that source.

Media add-ons can subscribe through `context.overlay.onLifecycle(listener)`. The hosted overlay reports `loading`, `started`, bounded `heartbeat`, `ended`, `stopped`, `failed`, and `timeout` phases for the matching `playbackId`. Reports return over the already-open overlay transport and are routed only to the owning module; they do not open another WebSocket. Add-ons must correlate the exact `playbackId`, retain a bounded retry until `started`, persist rotation progress only after `ended`, and treat `stopped`, `failed`, and `timeout` as retry-or-skip decisions.

## Entrypoint example

```js
export default {
  manifest,
  required: false,
  async start(context) {
    const saved = await context.state.read();
    // Use only handles whose permission was declared and approved.
  },
  async onEvent(event, context) {
    if (event.eventType !== 'stream.online') return;
    await context.streamerbot.runApprovedAction(
      '11111111-1111-4111-8111-111111111111',
      { sourceEventId: event.eventId },
    );
  },
};
```

## Security boundary

This broker is a least-privilege framework API, not an operating-system sandbox. Executable JavaScript still runs in the StreamBridge process under the creator's Windows account and could bypass supported APIs by using Node directly. Install executable add-ons only from trusted, reviewed publishers. Declarative add-ons remain the recommended public third-party tier because they do not execute package code.

Random Clip Player implements the hosted `media.play` lifecycle with correlated playback IDs and bounded retries. It starts disabled after every StreamBridge launch and can begin only after its namespaced Enable relay; Disable cancels scheduled work and fades out the hosted media. It also observes the exclusive media slot: a confirmed Raid Scout preview preserves the creator's Enable state and no-repeat bag, cancels stale requests, fades out the current clip, and resumes cleanly only when the slot is released. The overlay uses a short 750 ms final-frame fade inside the creator's configured pause, so no hidden delay is added. A cold shared-cache fallback begins after one second rather than making enablement appear stalled. Immediate dispatch failures during the bridge-to-Streamer.bot connection race retry after one second, while successfully dispatched requests keep the longer response safety net. The add-on exhausts its no-repeat pool before refetching without creating another connection or background service. Its optional video-prefetch setting downloads only the selected temporary Twitch CDN asset into the bounded media cache before playback; a cache failure falls back to the original temporary URL.
