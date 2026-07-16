# Speaker.bot setup

Milestone 6 uses Streamer.bot as the decision engine and Speaker.bot as the local speech engine. The package has no trigger and cannot speak an event merely because the bridge received it.

## Connect the applications

1. In Speaker.bot, configure a speech engine and create at least one voice alias.
2. In Speaker.bot **Settings > WebSocket Server**, bind to `127.0.0.1`, keep the chosen port aligned with Streamer.bot, and enable Auto Start if desired. Current Speaker.bot documentation lists `7680` as the default; the verified installed `0.1.7` instance retained `7580`, so use the value shown in the running application rather than assuming either port.
3. In Streamer.bot **Integrations > Speaker.bot**, use `127.0.0.1`, the matching WebSocket port, Auto Connect, and Auto Reconnect.
4. Import `packages\streamerbot\speaker-orchestration\THSV-StreamBridge-Speaker-Orchestration-1.0.0.sb`.
5. Leave the imported action triggerless.

Queue controls use Speaker.bot's always-on localhost UDP interface on fixed port `6669`; they do not depend on the configurable WebSocket port.

Official references: [Speaker.bot WebSocket API](https://speaker.bot/api), [Speaker.bot WebSocket requests](https://speaker.bot/api/websocket/requests), [Speaker.bot UDP interface](https://speaker.bot/api/udp), [Speaker.bot UDP requests](https://speaker.bot/api/udp/requests), and [Streamer.bot Speaker.bot integration](https://docs.streamer.bot/guide/integrations/speakerbot).

## Safe offline test

Create a temporary local Streamer.bot action that sets these arguments, then immediately runs `THSV StreamBridge - Speaker Orchestration`:

| Argument | Value |
| --- | --- |
| `speakerOperation` | `speak` |
| `speakerApproved` | `True` |
| `speakerVoiceAlias` | your existing test alias |
| `speakerMessage` | a creator-authored test sentence |
| `speakerTextSource` | `creator-template` |
| `speakerSimulated` | `True` |
| `speakerAllowSimulated` | `True` |
| `speakerDryRun` | `True` |

Inspect Action History. The expected result is `speakerValid=True`, `speakerDispatched=False`, `speakerDryRunResult=True`, and no audio. Remove the temporary caller action afterward if it is not part of the creator's maintained setup.

## Safety rules

- Never add a direct trigger to the package.
- Never map raw chat, donation messages, actor names, item names, or tiers directly into `speakerMessage`.
- Keep Speaker.bot's bad-word replacements configured as defense in depth. The package also forces the API bad-word-filter flag on every speech request.
- Simulated events are denied unless the caller explicitly enables them. Use dry run for routine fixture testing.
- Queue controls are local operator functions. Do not expose stop, pause, resume, or clear to public chat commands.
- Generated duration and audio-file metadata are not available from `CPH.TtsSpeak`. Streamer.bot's native delayed/silent Speaker.bot Speak sub-action exposes those fields when a future workflow genuinely needs them.
