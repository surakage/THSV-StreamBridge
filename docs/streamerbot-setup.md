# Streamer.bot setup

Complete the core installation in [Getting started](getting-started.md) before configuring Streamer.bot. StreamBridge sends one `DoAction` request through Streamer.bot's local WebSocket server and waits for its correlated `status: ok` response.

## Recommended fresh-computer flow: one selective import

Open **THSV Setup Wizard → Streamer.bot** and complete the **One Streamer.bot import** card:

1. Select or detect `Streamer.bot.exe`, start Streamer.bot, and confirm its WebSocket connection is ready.
2. Choose the included features and installed optional add-ons you plan to use. Framework packages are included automatically.
3. Select **Create & download one import**, then import that single `.sb` file in Streamer.bot.
4. Open the generated **Recommended trigger checklist** in the wizard. Attach only those triggers; leave internal receivers, controllers, projections, and delivery actions triggerless.
5. Select **Inspect actions** and run harmless test triggers before going live.

The generated package retains the canonical stable action, sub-action, argument, trigger, and command IDs from every selected package. Generating a newer matching package is therefore an upgrade path rather than a request to create parallel action groups.

## Recovery and development reference

Everything below this heading is an advanced repair reference. A normal installation should not import these packages individually or recreate the receiver chain by hand. Return to **One Streamer.bot import** for ordinary installation and upgrades.

## 1. Start the WebSocket server

1. In Streamer.bot, open **Servers/Clients > WebSocket Server**.
2. Set the address to `127.0.0.1`, port to `8080`, and endpoint to `/`.
3. Enable **Auto Start**, then start the server.
4. If you intentionally use another address, port, endpoint, or authentication setting, update StreamBridge to match.

If authentication is enabled, set the environment variable named by `streamerbot.passwordEnv` before starting StreamBridge. Never store the password in JSON.

## 2. Import optional lifecycle launchers

Import these first if you want Streamer.bot to start StreamBridge or open the wizard:

- `packages\streamerbot\bridge-launcher\THSV-StreamBridge-Bridge-Launcher-4.0.8.sb`
- `packages\streamerbot\wizard-launcher\THSV-StreamBridge-Setup-Wizard-Launcher-4.0.8.sb`

Each lifecycle action begins with an editable `thsvBridgeInstallPath` **Set Argument**. Leave `%LOCALAPPDATA%\THSV StreamBridge` for the default installation, or edit that argument for a custom path. Do not edit the C# just to change the path.

Only **Launch Bridge** may receive **Core > Streamer.bot > Streamer.bot Started**. Keep **Shutdown Bridge**, **Check Connections**, and **Open Setup Wizard** manual. Launch Bridge now verifies the live `/ready` result before showing its grouped green toast, so it confirms enabled platform adapters, Streamer.bot delivery, and modules rather than merely confirming a running process.

For automatic connection warnings, create a one-minute Streamer.bot Timed Action and attach it to **THSV StreamBridge - Monitor Connections**. The monitor is state-aware: it reports its first result, stays silent while that result remains unchanged, shows one attention toast when a connection becomes unavailable or delivery degrades, and shows one green toast after recovery. Run **THSV StreamBridge - Check Connections** whenever you want an immediate toast even when the status has not changed. High-frequency intake actions do not create notifications.

## 3. Import the receiver and projection packages

Import:

1. `packages\streamerbot\core-receiver\THSV-StreamBridge-Core-Receiver-4.0.8.sb`
2. `packages\streamerbot\multi-chat\THSV-StreamBridge-Multi-Chat-4.0.8.sb`
3. `packages\streamerbot\multi-commands\THSV-StreamBridge-Multi-Commands-4.0.8.sb`
4. `packages\streamerbot\multi-alerts\THSV-StreamBridge-Multi-Alerts-4.0.8.sb`
5. `packages\streamerbot\multi-timed-actions\THSV-StreamBridge-Multi-Timed-Actions-4.0.8.sb`

The Core Receiver installs or upgrades `THSV StreamBridge - Receive Event` in the `THSV StreamBridge` group. Keep `streamerbot.actionAlias` set to that exact name unless you deliberately change both sides.

Open `THSV StreamBridge - Receive Event`. After its enabled receiver C# sub-action, add three **Core > Actions > Run Action** children in this order:

1. `THSV StreamBridge - Multi-Chat`
2. `THSV StreamBridge - Multi-Commands`
3. `THSV StreamBridge - Multi-Alerts`

Leave **Run Action Immediately** enabled for every child so each one receives the validated argument stack. The child packages safely ignore event types they do not own.

The resulting chain is:

```text
THSV StreamBridge - Receive Event
  -> THSV StreamBridge - Multi-Chat
  -> THSV StreamBridge - Multi-Commands
  -> THSV StreamBridge - Multi-Alerts
```

Keep the receiver and all three child actions triggerless. Creator-approved timed targets are now
dispatched directly by StreamBridge, so Multi-Timed Actions is not required in this receiver chain.
If retained for an event-only projection workflow, keep it triggerless.

## 4. Import optional core outputs and administration

### Timed messages

Import:

```text
packages\streamerbot\timed-message-output\THSV-StreamBridge-Timed-Message-Output-4.0.8.sb
```

Keep `THSV StreamBridge - Send Timed Message` triggerless. Select it from the wizard only for shuffled timed-chat definitions. In the wizard, messages may be kept in one editing group or split into named groups for tidiness. Those groups are combined into one shared non-repeating list at runtime; each selected message is sent to every checked platform, applying the strictest selected platform character limit.

### Reward administration

Import:

```text
packages\streamerbot\reward-administration\THSV-StreamBridge-Reward-Administration-4.0.8.sb
```

Review the custom C# and keep `THSV StreamBridge - Reward Administration` triggerless. Each live Twitch mutation requires separate wizard confirmation and approval. Kick mutations remain unavailable.

Core Receiver, Command Administration, Reward Administration, Timed Message Output, and the setup wizard remain triggerless.

## 5. Connect Twitch, YouTube, and Kick

Import:

```text
packages\streamerbot\native-platform-intake\THSV-StreamBridge-Native-Platform-Intake-4.0.8.sb
```

It installs one intake action per platform in separate Twitch, YouTube, and Kick groups. The `4.0.1` package preserves Streamer.bot's known `firstMessage` flag for features that distinguish a first-ever channel message, includes the current Kick Mass Gift Subscription argument contract, and relays documented native emote metadata.

For each platform you use:

1. Open the matching intake action.
2. Add only the trigger picker paths declared in `packages\streamerbot\native-platform-intake\manifest.json` and the [trigger matrix](streamerbot-trigger-matrix.md).
3. Include Twitch/Kick **Stream Online** and **Stream Offline**, and YouTube **Broadcast Started** and **Broadcast Ended**, if timed actions need stream lifecycle.
4. Add `TwitchRewardRedemption` only to `THSV Twitch - Intake`.
5. Add `KickRewardRedemption` only to `THSV Kick - Intake`.
6. Enable the matching `streamerbot-native` platform in the wizard.

Do not copy platform triggers onto the receiver or a `Multi-*` action.

Native Twitch and YouTube emotes render from Streamer.bot's structured ranges. StreamBridge also matches BTTV on Twitch/YouTube, FrankerFaceZ on Twitch, and 7TV on Twitch/YouTube/Kick without sending viewer names or chat text to those providers. Kick native metadata is used only when its trigger supplies an HTTPS image; TikTok keeps Unicode emoji and readable text because TikFinity has no stable documented image-range contract.

## 6. Connect TikTok through TikFinity

Import:

```text
packages\streamerbot\tikfinity-intake\THSV-StreamBridge-TikFinity-Intake-4.0.8.sb
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
