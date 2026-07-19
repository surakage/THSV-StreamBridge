# THSV StreamBridge Multi-Timed Actions

This package projects receiver-validated `system.timed` events into one stable Streamer.bot argument contract. For the reviewed `run-existing-action` provider it can dispatch one creator-selected Streamer.bot action by stable ID using the documented `CPH.RunActionById(id, false)` method. The target must have been explicitly selected and approved in the wizard; event-only timers remain projection-only. Version 1.3.0 exposes both the validated `multiTimedDeliveryPlatforms` JSON array and the independently selected `multiTimedSelectedMessages` JSON object for the triggerless Timed Message Output action.

## Scheduling model

Schedules live in `timedActions.definitions`. Each definition can use a fixed interval or a persisted random range, measured from session start, with optional `firstRunAfterMinutes`. Choose fixed selection for ordinary payloads, legacy `shuffle-container` for one shared list, or recommended `platform-shuffle` for separate Twitch, YouTube, Kick, and TikTok lists. Every platform bag completes before it repeats and persists independently across restarts.

The bridge supports live-state, target-platform, recent-chat-activity, and scene gates. Scene gates fail closed until a provider emits a normalized `stream.scene-changed` event. Activity state retains timestamps and platform IDs only, never chat text or viewer identity.

The bridge persists interval and shuffle-bag progress. A normalized `stream.online` event or authenticated operator start opens a fresh session; the session ends after every observed live platform is offline or an operator stops it. Restarting the bridge process resumes an active session. Pause/resume freezes the remaining delay. Pending random selection is persisted before delivery, so retry uses the same message. `skip` advances missed occurrences; `fire-once` collapses them.

## Safety and boundaries

`payload` is exposed only as inert compact JSON in `multiTimedCreatorPayload`. The package never starts a process, runs a shell, writes globals, speaks, renders, or directly sends platform output. The only execution provider in 1.1.0 is a creator-approved existing Streamer.bot action selected by stable ID; the Core Receiver and this action are excluded as targets to prevent recursion. Keep the package triggerless and concurrent so one downstream workflow cannot block unrelated timed events.

## Offline test

Use `everyMinutes: 1` and `firstRunAfterMinutes: 0` with harmless messages, start the bridge, run `scripts\\timed-actions.ps1 -Operation start`, and inspect Streamer.bot Action History. Run the same script with `-Operation stop` when finished. For a no-wait package check, simulate `tests/fixtures/system-timed.json`.
