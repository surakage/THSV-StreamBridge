# Streamer.bot setup

The foundation sends a `DoAction` WebSocket request and waits for the correlated `status: ok` response.

## Manual setup

Before the core imports, you may import `packages\streamerbot\bridge-launcher\THSV-StreamBridge-Bridge-Launcher-1.4.0.sb` and `packages\streamerbot\wizard-launcher\THSV-StreamBridge-Setup-Wizard-Launcher-2.0.0-preview.1.sb`. Each bridge lifecycle action begins with an editable `thsvBridgeInstallPath` **Set Argument**. Leave its default `%LOCALAPPDATA%\THSV StreamBridge` path unchanged, or edit that sub-action for a custom path; do not edit the C#. Only Launch Bridge may receive **Core > Streamer.bot > Streamer.bot Started**; keep Shutdown Bridge and Open Setup Wizard manual. Both lifecycle actions run hidden (no console window) and instead raise one Windows toast notification per run — success or failure — grouped under a single Action Center header; per-event actions such as chat and alert intake intentionally never toast.

1. In Streamer.bot, open **Servers/Clients > WebSocket Server**.
2. Keep the address at `127.0.0.1`, port `8080`, and endpoint `/`, or update the bridge URL to match.
3. Enable **Auto Start** and start the WebSocket server.
4. Import `packages\streamerbot\core-receiver\THSV-StreamBridge-Core-Receiver-2.0.0-preview.1.sb`. It installs or upgrades `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group.
5. Keep `streamerbot.actionAlias` set to `THSV StreamBridge - Receive Event`. The receiver validates the full `streamBridgeEvent` JSON and exposes the versioned, platform-neutral arguments documented in the adjacent package manifest.
6. Import `packages\streamerbot\multi-chat\THSV-StreamBridge-Multi-Chat-1.1.1.sb`.
7. In the receiver action, add **Core > Actions > Run Action** after the enabled receiver C# sub-action. Select `THSV StreamBridge - Multi-Chat` and leave **Run Action Immediately** enabled so it receives the validated argument stack.
8. Import `packages\streamerbot\multi-commands\THSV-StreamBridge-Multi-Commands-2.0.0-preview.1.sb`.
9. Add another immediate **Run Action** child in the receiver and select `THSV StreamBridge - Multi-Commands`. Multi-Chat and Multi-Commands safely ignore event types they do not own.
10. Import `packages\streamerbot\multi-alerts\THSV-StreamBridge-Multi-Alerts-1.0.1.sb` and add it as another immediate receiver child action.
11. Import `packages\streamerbot\multi-timed-actions\THSV-StreamBridge-Multi-Timed-Actions-1.3.0.sb` and add it as another immediate receiver child action.
12. Import `packages\streamerbot\timed-message-output\THSV-StreamBridge-Timed-Message-Output-1.1.0.sb`. Keep `THSV StreamBridge - Send Timed Message` triggerless; select it from the wizard only for shuffled timed-chat definitions. The recommended separate-platform mode applies the saved Twitch, YouTube, Kick, and TikTok limits and rotates each list independently.
13. For TikTok through TikFinity, import `packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-1.1.0.sb`. It installs `THSV TikTok - Chat`, `THSV TikTok - Follow`, `THSV TikTok - Gift`, `THSV TikTok - Like`, and `THSV TikTok - Subscription` in the `THSV StreamBridge - TikTok` group.
14. In TikFinity, set Streamer.bot Address `127.0.0.1`, Port `8080`, Endpoint `/`, then run **Test Connection**. Map Chat, Follow, Gift, Like, and Subscription events to the matching imported actions.
15. Enable the local config's `tiktok` entry with adapter `tikfinity-streamerbot`, restart StreamBridge, then use TikFinity's event simulator. Confirm Action History shows the intake action followed by `THSV StreamBridge - Receive Event` and that diagnostics show the `tiktok` adapter connected.
16. Import `packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.4.0.sb`. It installs one intake action each for Twitch, YouTube, and Kick in separate platform groups.
17. Add only the trigger picker paths declared under `manualTriggerSetup` for each platform in `packages\streamerbot\native-platform-intake\manifest.json`, then enable the corresponding `streamerbot-native` platform entries in the local bridge configuration. Include Twitch/Kick Stream Online and Stream Offline plus YouTube Broadcast Started and Broadcast Ended; timed actions use those lifecycle events.
18. For rewards, add `TwitchRewardRedemption` only to `THSV Twitch - Intake` and `KickRewardRedemption` only to `THSV Kick - Intake`.
19. Import `packages\streamerbot\reward-administration\THSV-StreamBridge-Reward-Administration-1.0.0.sb`. Review the custom C# source and keep `THSV StreamBridge - Reward Administration` triggerless. The wizard requires a separate confirmation and approval flag for every live Twitch operation. Kick mutations remain unavailable.
20. For a network-free check, explicitly set `streamerbot.testMode` true and run the simulator. Diagnostics will report `liveDelivery: false`; no Streamer.bot action will execute.
21. For a live check, set test mode false, start Streamer.bot, start the bridge, and run the fixture matrices listed in [Testing](testing.md).
22. If authentication is enabled, set the environment variable named by `passwordEnv` before starting. Never store the password in JSON.

The intake broadcasts only documented, allowlisted placeholder fields. It reuses StreamBridge's existing Streamer.bot WebSocket rather than opening another connection. Until live provenance is verified, events default to simulated and expose unverified transport/source-ID fields.

`actionId` is optional. The human-readable alias is the portable default; an installation-specific GUID can be added later.

The import file is Base64-encoded and contains an `SBAE` header followed by gzip-compressed export JSON. Its readable source, manifest, and automated reproducibility test are stored beside it under `packages\streamerbot\core-receiver`.

Multi-Chat, Multi-Commands, Multi-Alerts, Multi-Timed Actions, and Send Timed Message must not have direct triggers. Their trust boundary depends on running after a successful receiver invocation. Viewer Progression, Bloom Companion, and Speaker Orchestration are archived and must not be imported into the Stage 2 core chain.

Core Receiver, Command Administration, Reward Administration, and the setup wizard also remain triggerless. The only automatic framework trigger outside platform intake is the optional **Core > Streamer.bot > Streamer.bot Started** trigger on Launch Bridge. Keep Shutdown Bridge manual so one platform ending cannot stop an active multistream.

Before enabling live triggers, compile every imported C# action using [the required Streamer.bot references](streamerbot-csharp-references.md).

Reward Administration must also remain triggerless. See [Channel rewards](rewards.md) for the supported Twitch operations, Kick intake-only boundary, and safe test procedure.

Official references:

- <https://docs.streamer.bot/api/websocket/guide/configuration>
- <https://docs.streamer.bot/api/websocket/guide/authentication>
- <https://docs.streamer.bot/api/websocket/requests>
- <https://docs.streamer.bot/api/sub-actions/core/actions/run-action/>
- <https://docs.streamer.bot/api/triggers>
- <https://docs.streamer.bot/api/triggers/twitch/channel/stream-online>
- <https://docs.streamer.bot/api/triggers/twitch/channel/stream-offline>
- <https://docs.streamer.bot/api/triggers/kick/channel/stream-online>
- <https://docs.streamer.bot/api/triggers/kick/channel/stream-offline>
- <https://docs.streamer.bot/api/triggers/youtube/broadcast/started>
- <https://docs.streamer.bot/api/triggers/youtube/broadcast/ended>
# Action wiring at a glance

- Attach native Twitch, YouTube, and Kick triggers only to the matching actions in `THSV StreamBridge / Platform Intake`.
- Wizard-generated commands and their actions import into `THSV Bridge - Commands`. Their action
  names default to `THSV Command - <Command>` but can be edited in the wizard before export.
- For an enabled TikTok command, assign the generated Streamer.bot action to the corresponding
  command event in TikFinity. Enable **Allow Streamer.bot to push messages to TikFinity** when the
  command should reply in TikTok chat. The generated action consumes TikFinity's `commandParams`,
  `nickname`, and `username` arguments and sends through `sendChatbotMessage`.
- Do **not** attach platform triggers to Multi-Chat, Multi-Commands, or Multi-Alerts.
- Keep Multi-Chat, Multi-Commands, and Multi-Alerts as immediate child actions under `THSV StreamBridge - Receive Event`. The bridge calls the receiver once; those projection actions read its validated `streamBridge*` arguments.
- A successful intake now writes `Native Streamer.bot platform relay event accepted` to the structured bridge log. A rejection writes a readable warning. If neither appears, the intake action or active runtime configuration is not connected.
