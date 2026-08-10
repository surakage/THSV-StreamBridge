# THSV StreamBridge Multi-Timed Actions

This package projects receiver-validated `system.timed` events into one stable Streamer.bot argument contract. Current StreamBridge releases dispatch creator-approved `run-existing-action` targets directly by stable ID, so delivery no longer depends on this action being nested under the Core Receiver. This package remains available for event-only projection workflows and compatibility with existing receiver chains. Version 1.3.0 exposes both the validated `multiTimedDeliveryPlatforms` JSON array and the independently selected `multiTimedSelectedMessages` JSON object.

## Scheduling model

Schedules live in `timedActions.definitions`. Each definition can use a fixed interval or a persisted random range, measured from session start, with optional `firstRunAfterMinutes`. The recommended wizard flow lets creators keep messages in one editing group or several named groups; all groups flatten into one `shuffle-container` list. Each run sends one unused message to every selected platform, completes the full combined list without repeats, and then reshuffles. Legacy `platform-shuffle` definitions remain readable so existing configurations can be merged safely in the wizard.

The bridge supports live-state, target-platform, recent-chat-activity, and scene gates. Scene gates fail closed until a provider emits a normalized `stream.scene-changed` event. Activity state retains timestamps and platform IDs only, never chat text or viewer identity.

The bridge persists interval and shuffle-bag progress. A normalized `stream.online` event or authenticated operator start opens a fresh session; the session ends after every observed live platform is offline or an operator stops it. A process restart deliberately clears persisted live markers and waits for a fresh real online signal, because an offline event may have been missed while Streamer.bot or the broadcast app was closing. Pause/resume freezes the remaining delay. Pending random selection is persisted before delivery, so retry uses the same message. `skip` advances missed occurrences; `fire-once` collapses them.

## Safety and boundaries

`payload` is exposed only as inert compact JSON in `multiTimedCreatorPayload`. The package never starts a process, runs a shell, writes globals, speaks, renders, or directly sends platform output. The only execution provider in 1.1.0 is a creator-approved existing Streamer.bot action selected by stable ID; the Core Receiver and this action are excluded as targets to prevent recursion. Keep the package triggerless and concurrent so one downstream workflow cannot block unrelated timed events.

## Offline test

Use `everyMinutes: 1` and `firstRunAfterMinutes: 0` with harmless messages, start the bridge, run `scripts\\timed-actions.ps1 -Operation start`, and inspect Streamer.bot Action History. Run the same script with `-Operation stop` when finished. For a no-wait package check, simulate `tests/fixtures/system-timed.json`.
