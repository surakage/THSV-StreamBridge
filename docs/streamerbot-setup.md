# Streamer.bot setup

Complete the core installation in [Getting started](getting-started.md) before configuring Streamer.bot. StreamBridge sends one `DoAction` request through Streamer.bot's local WebSocket server and waits for its correlated `status: ok` response.

## 1. Start the WebSocket server

1. In Streamer.bot, open **Servers/Clients > WebSocket Server**.
2. Set the address to `127.0.0.1`, port to `8080`, and endpoint to `/`.
3. Enable **Auto Start**, then start the server.
4. If you intentionally use another address, port, endpoint, or authentication setting, update StreamBridge to match.

If authentication is enabled, set the environment variable named by `streamerbot.passwordEnv` before starting StreamBridge. Never store the password in JSON.

## 2. Import optional lifecycle launchers

Import these first if you want Streamer.bot to start StreamBridge or open the wizard:

- `packages\streamerbot\bridge-launcher\THSV-StreamBridge-Bridge-Launcher-1.4.0.sb`
- `packages\streamerbot\wizard-launcher\THSV-StreamBridge-Setup-Wizard-Launcher-2.1.0.sb`

Each lifecycle action begins with an editable `thsvBridgeInstallPath` **Set Argument**. Leave `%LOCALAPPDATA%\THSV StreamBridge` for the default installation, or edit that argument for a custom path. Do not edit the C# just to change the path.

Only **Launch Bridge** may receive **Core > Streamer.bot > Streamer.bot Started**. Keep **Shutdown Bridge** and **Open Setup Wizard** manual. These actions run hidden and report one grouped Windows notification; high-frequency intake actions do not create notifications.

## 3. Import the receiver and projection packages

Import:

1. `packages\streamerbot\core-receiver\THSV-StreamBridge-Core-Receiver-2.0.0-preview.1.sb`
2. `packages\streamerbot\multi-chat\THSV-StreamBridge-Multi-Chat-1.1.1.sb`
3. `packages\streamerbot\multi-commands\THSV-StreamBridge-Multi-Commands-2.0.0-preview.1.sb`
4. `packages\streamerbot\multi-alerts\THSV-StreamBridge-Multi-Alerts-1.0.1.sb`
5. `packages\streamerbot\multi-timed-actions\THSV-StreamBridge-Multi-Timed-Actions-1.3.0.sb`

The Core Receiver installs or upgrades `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group. Keep `streamerbot.actionAlias` set to that exact name unless you deliberately change both sides.

Open `THSV StreamBridge - Receive Event`. After its enabled receiver C# sub-action, add four **Core > Actions > Run Action** children in this order:

1. `THSV StreamBridge - Multi-Chat`
2. `THSV StreamBridge - Multi-Commands`
3. `THSV StreamBridge - Multi-Alerts`
4. `THSV StreamBridge - Multi-Timed Actions`

Leave **Run Action Immediately** enabled for every child so each one receives the validated argument stack. The child packages safely ignore event types they do not own.

The resulting chain is:

```text
THSV StreamBridge - Receive Event
  -> THSV StreamBridge - Multi-Chat
  -> THSV StreamBridge - Multi-Commands
  -> THSV StreamBridge - Multi-Alerts
  -> THSV StreamBridge - Multi-Timed Actions
```

Keep the receiver and all four child actions triggerless. Their trust boundary depends on running only after receiver validation.

## 4. Import optional core outputs and administration

### Timed messages

Import:

```text
packages\streamerbot\timed-message-output\THSV-StreamBridge-Timed-Message-Output-1.1.0.sb
```

Keep `THSV StreamBridge - Send Timed Message` triggerless. Select it from the wizard only for shuffled timed-chat definitions. Separate-platform mode applies each platform's saved character limits and rotates its list independently.

### Reward administration

Import:

```text
packages\streamerbot\reward-administration\THSV-StreamBridge-Reward-Administration-1.0.0.sb
```

Review the custom C# and keep `THSV StreamBridge - Reward Administration` triggerless. Each live Twitch mutation requires separate wizard confirmation and approval. Kick mutations remain unavailable.

Core Receiver, Command Administration, Reward Administration, Timed Message Output, and the setup wizard remain triggerless.

## 5. Connect Twitch, YouTube, and Kick

Import:

```text
packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-1.5.2.sb
```

It installs one intake action per platform in separate Twitch, YouTube, and Kick groups. Version 1.5.2 preserves Streamer.bot's known `firstMessage` flag for add-ons that distinguish a first-ever channel message and includes the current Kick Mass Gift Subscription argument contract.

For each platform you use:

1. Open the matching intake action.
2. Add only the trigger picker paths declared in `packages\streamerbot\native-platform-intake\manifest.json` and the [trigger matrix](streamerbot-trigger-matrix.md).
3. Include Twitch/Kick **Stream Online** and **Stream Offline**, and YouTube **Broadcast Started** and **Broadcast Ended**, if timed actions need stream lifecycle.
4. Add `TwitchRewardRedemption` only to `THSV Twitch - Intake`.
5. Add `KickRewardRedemption` only to `THSV Kick - Intake`.
6. Enable the matching `streamerbot-native` platform in the wizard.

Do not copy platform triggers onto the receiver or a `Multi-*` action.

## 6. Connect TikTok through TikFinity

Import:

```text
packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-1.1.0.sb
```

It installs:

- `THSV TikTok - Chat`
- `THSV TikTok - Follow`
- `THSV TikTok - Gift`
- `THSV TikTok - Like`
- `THSV TikTok - Subscription`

In TikFinity:

1. Set Streamer.bot Address to `127.0.0.1`, Port to `8080`, and Endpoint to `/`.
2. Run **Test Connection**.
3. Map Chat, Follow, Gift, Like, and Subscription to their matching imported actions.
4. Enable the wizard's TikTok entry with adapter `tikfinity-streamerbot`.
5. Restart StreamBridge.
6. Run a TikFinity simulated event.
7. Confirm Action History shows the matching intake followed by Core Receiver and that diagnostics reports the TikTok adapter connected.

For a wizard-generated TikTok command, assign its generated Streamer.bot action to the corresponding TikFinity command event. Enable **Allow Streamer.bot to push messages to TikFinity** when it should reply in TikTok chat. The generated action consumes TikFinity's `commandParams`, `nickname`, and `username` and sends through `sendChatbotMessage`.

## 7. Compile before enabling live triggers

Open every imported THSV action containing **Execute C# Code**, select **Save and Compile**, and resolve any error before enabling live triggers. Current packages carry their required references; use [Streamer.bot C# compiler references](streamerbot-csharp-references.md) if Streamer.bot reports a missing type.

Accept Streamer.bot's custom C# warning only when the `.sb` came from a verified official core or add-on archive.

## 8. Verify the complete path

### Network-free test

Set `streamerbot.testMode` to `true`, restart StreamBridge, and run the simulator. Diagnostics must report `liveDelivery: false`, and no Streamer.bot action should execute.

### Local live-delivery test

1. Set `streamerbot.testMode` to `false`.
2. Start Streamer.bot and its WebSocket server.
3. Start StreamBridge.
4. Run the fixture matrices in [Testing](testing.md).
5. Confirm one intake action, one Core Receiver run, and the expected child action in Action History.
6. Confirm the browser overlay receives the event once.

A successful intake writes `Native Streamer.bot platform relay event accepted` to the structured bridge log. A rejection writes a readable warning. If neither appears, the intake action or active runtime platform configuration is not connected.

The intake transmits only documented, allowlisted fields and reuses StreamBridge's existing Streamer.bot WebSocket. It does not create a second connection. Until a transport's live provenance is verified, its events remain simulated or expose unverified identity fields.

## Action wiring at a glance

| Action kind | Direct triggers? | Where it belongs |
| --- | --- | --- |
| Twitch/YouTube/Kick intake | Yes | Only documented matching platform triggers |
| TikFinity intake | TikFinity mapping | Matching TikFinity event |
| Core Receiver | No | Called by StreamBridge |
| Multi-Chat | No | Immediate child of Core Receiver |
| Multi-Commands | No | Immediate child of Core Receiver |
| Multi-Alerts | No | Immediate child of Core Receiver |
| Multi-Timed Actions | No | Immediate child of Core Receiver |
| Timed Message Output | No | Selected by a wizard timed action |
| Reward Administration | No | Called only through approved framework flow |
| Launch Bridge | Optional | Streamer.bot Started |
| Shutdown/Open Wizard | No | Manual |

Wizard-generated commands import into `THSV Bridge - Commands`. Their action names default to `THSV Command - <Command>` and can be edited before export.

Optional add-ons are not part of the core action chain. Download the add-on's separate ZIP, install its `.thsv-addon`, import only its bundled `.sb`, and follow its `INSTALL.md`.

`actionId` is optional for portable core delivery. The human-readable action alias is the default; an installation-specific GUID can be added later.

The `.sb` import is Base64-encoded and contains an `SBAE` header followed by gzip-compressed export JSON. Readable source, manifests, and reproducibility tests live beside each package.

Viewer Progression, Bloom Companion, and Speaker Orchestration are archived and must not be imported into the current core chain.

## Official references

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
