# Add-on capability broker

Executable add-ons receive a frozen `ModuleRuntimeContextV2` from the module host. The host builds that context from the verified package descriptor and the creator's installed-package grants; an add-on's exported object cannot expand its own grant.

The broker is the only supported add-on route to shared framework services:

- `events.subscribe` permits the verified manifest's normalized-event subscriptions. An executable subscriber that omits this permission is rejected before activation.
- `streamerbot.run-approved-action` exposes `context.streamerbot.runApprovedAction(actionId, args)`. The action must be selected by the creator in the wizard after a live Streamer.bot inspection. Matching uses the exact UUID, never the action name. The Core Receiver is always prohibited to prevent recursive ingestion.
- `schedule.bounded` exposes one-shot `context.schedule.after()` tasks from 1 second through 24 hours. Each module may hold at most 16 tasks. Outstanding tasks are cancelled when the module stops or fails.
- `state.private` exposes one atomic JSON object under the module's private state directory. The object is limited to 100 keys and 64 KiB; one module cannot address another module's broker state.
- `overlay.publish` exposes `context.overlay.publish(topic, payload)` and a core-hosted browser source at `/overlay/addons/<module-id>`. The route exists only while the installed add-on is enabled and declares this permission. Package HTML and JavaScript are never served.
- `chat.send` exposes `context.chat.send(request)`. A request either replies only to its normalized source platform or targets an explicit unique platform list. Core applies Unicode-safe limits (Twitch 500, YouTube 200, Kick 500, TikTok 150), rejects or safely splits overflow, isolates platform failures, and limits each add-on to ten routing requests per minute. Delivery reuses the reviewed Timed Message Output action over the existing Streamer.bot connection.

Streamer.bot action requests share the bridge's existing authenticated WebSocket and use its documented correlated [`DoAction` request](https://docs.streamer.bot/api/websocket/requests). The broker limits each add-on to two pending actions and 30 starts per rolling minute; arguments are JSON-only, limited to 50 keys and 64 KiB. Streamer.bot acknowledgement IDs, timeouts, and cancellation remain correlated by the adapter. Stopping or failing a module aborts its pending broker requests without opening another WebSocket.

Every approved action invocation also receives a short-lived, one-use `thsvAddonRelayToken` argument. An action returning a `thsv.addon` envelope must copy that token into `relayToken`; the bridge consumes it only for the module that requested the action. This prevents another Streamer.bot action from claiming an add-on's namespace. Creator-bound Random Clip Player enable/disable actions are the narrow exception: they may publish only the exact boolean control event, allowing scene triggers to pause playback without an outstanding bridge request.

Capability diagnostics report grant, denial, and failure counts by module and never record state, overlay payloads, or action arguments. A denial is isolated to the requesting optional module.

## Hosted overlay topics

The shared host understands four namespaced presentation topics:

- `<module-id>.card.show` with bounded `title`, `text`, optional HTTPS or same-origin `imageUrl`, and optional `durationMs`;
- `<module-id>.card.hide`;
- `<module-id>.media.play` with a required creator-generated `playbackId`, an HTTPS or same-origin `url`, optional `title`, `posterUrl`, `muted`, `volume`, and `durationMs`;
- `<module-id>.media.stop`.

The renderer uses text nodes, clamps displayed lengths and numeric values, rejects unsafe URL protocols, and applies a restrictive Content Security Policy. Chat, alerts, and add-on overlays share the existing `SharedWorker` transport when the streaming host supports it; isolated browser-source processes fall back to one direct connection for that source.

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

Random Clip Player `1.4.0` implements the hosted `media.play` lifecycle with correlated playback IDs and bounded retries. The overlay fades the final frame for four seconds, and scheduling adds that fixed transition buffer after the creator's configured pause. The add-on exhausts its no-repeat pool before refetching, and namespaced Enable/Disable relays let creator-selected Streamer.bot scene triggers pause or resume it without creating another connection or background service.
