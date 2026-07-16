# THSV StreamBridge Speaker Orchestration

This package is the permission boundary between creator automation and Speaker.bot. It has no trigger and never reads `multiAlertMessage`, chat text, actor names, or other raw event fields automatically.

## Install

1. Configure Speaker.bot and create the voice aliases you intend to use.
2. Import `THSV-StreamBridge-Speaker-Orchestration-1.0.0.sb` into Streamer.bot.
3. Keep the action triggerless. Invoke it only from a creator-controlled Streamer.bot action after setting the required arguments.

## Speak contract

Set `speakerOperation=speak`, `speakerApproved=True`, `speakerVoiceAlias`, `speakerMessage`, and `speakerTextSource` (`creator-template` or `creator-approved`). The package always enables Speaker.bot's bad-word filter. `raw-event` is rejected; do not copy raw chat, donation messages, actor names, item names, or tiers into `speakerMessage` without an explicit creator-side allowlist/filter and `creator-approved` provenance.

Simulated events are denied by default. For an offline test, set `speakerSimulated=True`, `speakerAllowSimulated=True`, and `speakerDryRun=True`. Dry run validates and exposes the result without producing audio.

## Queue controls

The `stop`, `pause`, `resume`, and `clear` operations require `speakerApproved=True` and use Speaker.bot's documented localhost UDP interface on port 6669. Invoke them only from local operator actions or trusted hardware controls, never public chat commands.

## Outputs and limitations

`speakerValid` means the request passed the permission and safety contract. `speakerDispatched` means Streamer.bot called the selected local transport without throwing; it is not a playback-completion acknowledgement. The C# API does not expose generated duration/file metadata for this path, so `speakerGeneratedMetadataAvailable=False`, `speakerDurationMs=-1`, and `speakerAudioFile` is empty. Use Streamer.bot's native delayed/silent Speaker.bot Speak sub-action later if generated-audio metadata is required.
