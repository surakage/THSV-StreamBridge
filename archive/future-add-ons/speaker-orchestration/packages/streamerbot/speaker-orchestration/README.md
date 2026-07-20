# THSV StreamBridge Speaker Orchestration

This package is the permission boundary between creator automation and Speaker.bot. It has no trigger and never reads `multiAlertMessage`, chat text, actor names, or other raw event fields automatically.

## Install

1. Configure Speaker.bot and create the voice aliases you intend to use.
2. Import `THSV-StreamBridge-Speaker-Orchestration-1.0.1.sb` into Streamer.bot.
3. Keep the action triggerless. Invoke it only from a creator-controlled Streamer.bot action after setting the required arguments.

## Speak contract

Set `speakerOperation=speak`, `speakerApproved=True`, `speakerVoiceAlias`, `speakerMessage`, and `speakerTextSource` (`creator-template` or `creator-approved`). The package always enables Speaker.bot's bad-word filter. `raw-event` is rejected; do not copy raw chat, donation messages, actor names, item names, or tiers into `speakerMessage` without an explicit creator-side allowlist/filter and `creator-approved` provenance.

Simulated events are denied by default. For an offline test, set `speakerSimulated=True`, `speakerAllowSimulated=True`, and `speakerDryRun=True`. Dry run validates and exposes the result without producing audio.

## Queue controls

The `stop`, `pause`, `resume`, and `clear` operations require `speakerApproved=True` and use Speaker.bot's documented localhost UDP interface on port 6669. Invoke them only from local operator actions or trusted hardware controls, never public chat commands.

## Outputs and limitations

`speakerValid` means the request passed the permission and safety contract. `speakerDispatched` means the selected local transport returned a positive send result; it does not mean Speaker.bot accepted the voice alias, generated audio, or completed playback. Live testing with Streamer.bot `1.0.5-alpha.31` returned a positive byte count even for a nonexistent alias, so creators must test configured aliases in Speaker.bot itself. The C# API does not expose generated duration/file metadata for this path, so `speakerGeneratedMetadataAvailable=False`, `speakerDurationMs=-1`, and `speakerAudioFile` is empty. Use Streamer.bot's native delayed/silent Speaker.bot Speak sub-action later if generated-audio metadata is required.

## Creator policy still required

This package deliberately keeps no cooldown, deduplication, or queue-priority state. Creator logic must rate-limit speech and deduplicate stable `speakerRequestId` values before invoking this action. Do not read URLs, markup, or user-controlled text aloud unless creator logic explicitly strips or transforms it and then marks it `creator-approved`. Priority interruption, audio ducking, and caption synchronization remain future orchestration/overlay work; concurrent execution keeps emergency controls responsive but also means creator logic must avoid dispatching overlapping speech.
