# THSV StreamBridge Multi-Timed Actions

This package projects receiver-validated `system.timed` events into one stable Streamer.bot argument contract. It does not choose or run creator actions. Streamer.bot remains the decision engine: chain this action after the Core Receiver, then route `multiTimedValid=True` outputs from your own action logic.

## Scheduling model

Schedules live in `timedActions.definitions`. Each definition has its own `everyMinutes` interval measured from session start and optional `firstRunAfterMinutes`. Choose fixed selection for ordinary payloads or `shuffle-container` for a random creator-authored message with no repetition until all messages are used.

The bridge persists interval and shuffle-bag progress. Graceful stop ends the session so the next start resets interval clocks without resetting unused messages. Crash restart resumes the session. Pending random selection is persisted before delivery, so retry uses the same message. `skip` advances missed occurrences; `fire-once` collapses them.

## Safety and boundaries

`payload` is exposed only as inert compact JSON in `multiTimedCreatorPayload`. The package never invokes an action, starts a process, runs a shell, writes globals, speaks, renders, or sends platform output. Treat payload fields as data and explicitly allowlist any creator action mapping. Keep the package triggerless and concurrent so one downstream workflow cannot block unrelated timed events.

## Offline test

Use `everyMinutes: 1` and `firstRunAfterMinutes: 0` with harmless messages, start the bridge, and inspect Streamer.bot Action History. For a no-wait package check, simulate `tests/fixtures/system-timed.json`.
