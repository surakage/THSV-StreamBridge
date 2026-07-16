# THSV StreamBridge Multi-Timed Actions

This package projects receiver-validated `system.timed` events into one stable Streamer.bot argument contract. It does not choose or run creator actions. Streamer.bot remains the decision engine: chain this action after the Core Receiver, then route `multiTimedValid=True` outputs from your own action logic.

## Scheduling model

Schedules live in `timedActions.definitions` in the bridge configuration. `once` schedules use one ISO 8601 timestamp. `interval` schedules use an ISO anchor plus an exact millisecond interval, avoiding ambiguous cron and daylight-saving interpretation. Each definition chooses `missedRunPolicy=skip` or `fire-once`.

The bridge persists the last completed scheduled occurrence. On restart, `skip` advances past missed occurrences without firing them; `fire-once` emits only the latest missed occurrence and reports how many earlier occurrences were collapsed in `multiTimedMissedRuns`. Stable source IDs and normal bridge deduplication prevent the same scheduled occurrence from being accepted twice.

## Safety and boundaries

`payload` is exposed only as inert compact JSON in `multiTimedCreatorPayload`. The package never invokes an action, starts a process, runs a shell, writes globals, speaks, renders, or sends platform output. Treat payload fields as data and explicitly allowlist any creator action mapping. Keep the package triggerless and concurrent so one downstream workflow cannot block unrelated timed events.

## Offline test

Use a future `once` timestamp with a harmless creator payload, start the bridge, and inspect Streamer.bot Action History. For a no-wait package check, simulate `tests/fixtures/system-timed.json`. Simulation proves the projection contract; it does not exercise the local scheduler clock or persistence path.
