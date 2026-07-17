# Streamer.bot setup

The foundation sends a `DoAction` WebSocket request and waits for the correlated `status: ok` response.

## Manual setup

1. In Streamer.bot, open **Servers/Clients > WebSocket Server**.
2. Keep the address at `127.0.0.1`, port `8080`, and endpoint `/`, or update the bridge URL to match.
3. Enable **Auto Start** and start the WebSocket server.
4. Import `packages\streamerbot\core-receiver\THSV-StreamBridge-Core-Receiver-1.0.4.sb`. It installs or upgrades `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group.
5. Keep `streamerbot.actionAlias` set to `THSV StreamBridge - Receive Event`. The receiver validates the full `streamBridgeEvent` JSON and exposes the versioned, platform-neutral arguments documented in the adjacent package manifest.
6. Import `packages\streamerbot\multi-chat\THSV-StreamBridge-Multi-Chat-1.1.1.sb`.
7. In the receiver action, add **Core > Actions > Run Action** after the enabled receiver C# sub-action. Select `THSV StreamBridge - Multi-Chat` and leave **Run Action Immediately** enabled so it receives the validated argument stack.
8. Import `packages\streamerbot\multi-commands\THSV-StreamBridge-Multi-Commands-1.1.0.sb`.
9. Add another immediate **Run Action** child in the receiver and select `THSV StreamBridge - Multi-Commands`. Multi-Chat and Multi-Commands safely ignore event types they do not own.
10. Import `packages\streamerbot\multi-alerts\THSV-StreamBridge-Multi-Alerts-1.0.1.sb` and add it as another immediate receiver child action.
11. Import `packages\streamerbot\viewer-progression\THSV-StreamBridge-Viewer-Progression-1.0.0.sb` and add it as another immediate receiver child action. It handles only derived `viewer.progression` events.
12. For TikTok through TikFinity, import `packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-1.0.0.sb`. It installs `THSV TikTok - Chat`, `THSV TikTok - Follow`, `THSV TikTok - Gift`, and `THSV TikTok - Like` in the `THSV StreamBridge - TikTok` group.
13. In TikFinity, set Streamer.bot Address `127.0.0.1`, Port `8080`, Endpoint `/`, then run **Test Connection**. Map Chat, Follow, Gift, and Like events to the matching imported actions.
14. Enable the local config's `tiktok` entry with adapter `tikfinity-streamerbot`, restart StreamBridge, then use TikFinity's event simulator. Confirm Action History shows the intake action followed by `THSV StreamBridge - Receive Event` and that diagnostics show the `tiktok` adapter connected.
15. Import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.0.0.sb`. It installs one intake action each for Twitch, YouTube, and Kick in separate platform groups.
16. Add only the trigger types declared for each platform in `packages\streamerbot\native-platform-intake\manifest.json`, then enable the corresponding `streamerbot-native` platform entries in the local bridge configuration.

The intake broadcasts only documented, allowlisted placeholder fields. It reuses StreamBridge's existing Streamer.bot WebSocket rather than opening another connection. Until live provenance is verified, events default to simulated and expose unverified transport/source-ID fields.
11. Import `packages\streamerbot\multi-timed-actions\THSV-StreamBridge-Multi-Timed-Actions-1.0.0.sb` and add it as another immediate receiver child action.
12. For a network-free check, explicitly set `streamerbot.testMode` true and run the simulator. Diagnostics will report `liveDelivery: false`; no Streamer.bot action will execute.
13. For a live check, set test mode false, start Streamer.bot, start the bridge, and run the fixture matrices listed in [Testing](testing.md).
14. If authentication is enabled, set the environment variable named by `passwordEnv` before starting. Never store the password in JSON.

`actionId` is optional. The human-readable alias is the portable default; an installation-specific GUID can be added later.

The import file is Base64-encoded and contains an `SBAE` header followed by gzip-compressed export JSON. Its readable source, manifest, and automated reproducibility test are stored beside it under `packages\streamerbot\core-receiver`.

Multi-Chat, Multi-Commands, Multi-Alerts, and Multi-Timed Actions must not have direct triggers. Their trust boundary depends on running after a successful receiver invocation. See their adjacent package guides for contracts and QA instructions.

Official references:

- <https://docs.streamer.bot/api/websocket/guide/configuration>
- <https://docs.streamer.bot/api/websocket/guide/authentication>
- <https://docs.streamer.bot/api/websocket/requests>
- <https://docs.streamer.bot/api/sub-actions/core/actions/run-action/>
