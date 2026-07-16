# Streamer.bot setup

The foundation sends a `DoAction` WebSocket request and waits for the correlated `status: ok` response.

## Manual setup

1. In Streamer.bot, open **Servers/Clients > WebSocket Server**.
2. Keep the address at `127.0.0.1`, port `8080`, and endpoint `/`, or update the bridge URL to match.
3. Enable **Auto Start** and start the WebSocket server.
4. Create an action named `THSV StreamBridge - Receive Event` (or change `streamerbot.actionAlias`).
5. Add sub-actions that read `streamBridgeEvent` (full normalized JSON), `streamBridgeEventId`, and `streamBridgeEventType`.
6. For a network-free check, explicitly set `streamerbot.testMode` true and run the simulator. Diagnostics will report `liveDelivery: false`; the action will not execute.
7. For a live check, set test mode false, start Streamer.bot, start the bridge, and run the simulator.
8. If authentication is enabled, set the environment variable named by `passwordEnv` before starting. Never store the password in JSON.

`actionId` is optional. The human-readable alias is the portable default; an installation-specific GUID can be added later.

Official references:

- <https://docs.streamer.bot/api/websocket/guide/configuration>
- <https://docs.streamer.bot/api/websocket/guide/authentication>
- <https://docs.streamer.bot/api/websocket/requests>
