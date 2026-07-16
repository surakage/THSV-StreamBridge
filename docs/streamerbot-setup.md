# Streamer.bot setup

The foundation sends a `DoAction` WebSocket request and waits for the correlated `status: ok` response.

## Manual setup

1. In Streamer.bot, open **Servers/Clients > WebSocket Server**.
2. Keep the address at `127.0.0.1`, port `8080`, and endpoint `/`, or update the bridge URL to match.
3. Enable **Auto Start** and start the WebSocket server.
4. Import `packages\streamerbot\core-receiver\THSV-StreamBridge-Core-Receiver-1.0.1.sb`. It installs `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group.
5. Keep `streamerbot.actionAlias` set to `THSV StreamBridge - Receive Event`. The receiver validates the full `streamBridgeEvent` JSON and exposes the versioned, platform-neutral arguments documented in the adjacent package manifest.
6. Import `packages\streamerbot\multi-chat\THSV-StreamBridge-Multi-Chat-1.0.0.sb`.
7. In the receiver action, add **Core > Actions > Run Action** after the enabled receiver C# sub-action. Select `THSV StreamBridge - Multi-Chat` and leave **Run Action Immediately** enabled so it receives the validated argument stack.
8. For a network-free check, explicitly set `streamerbot.testMode` true and run the simulator. Diagnostics will report `liveDelivery: false`; neither action will execute.
9. For a live check, set test mode false, start Streamer.bot, start the bridge, and run each chat fixture listed in [Testing](testing.md).
10. If authentication is enabled, set the environment variable named by `passwordEnv` before starting. Never store the password in JSON.

`actionId` is optional. The human-readable alias is the portable default; an installation-specific GUID can be added later.

The import file is Base64-encoded and contains an `SBAE` header followed by gzip-compressed export JSON. Its readable source, manifest, and automated reproducibility test are stored beside it under `packages\streamerbot\core-receiver`.

The Multi-Chat action must not have a direct trigger. Its trust boundary depends on running after a successful receiver invocation. See the package [README](../packages/streamerbot/multi-chat/README.md) for its exact argument contract and QA matrix.

Official references:

- <https://docs.streamer.bot/api/websocket/guide/configuration>
- <https://docs.streamer.bot/api/websocket/guide/authentication>
- <https://docs.streamer.bot/api/websocket/requests>
- <https://docs.streamer.bot/api/sub-actions/core/actions/run-action/>
