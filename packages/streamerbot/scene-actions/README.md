# THSV Scene Actions — Streamer.bot package

Import `THSV-StreamBridge-Scene-Actions-2.4.0.sb`. The package creates one intake action and five empty starter targets.

## Add triggers to the Intake action

- OBS Studio → Scene Changed; Connection `Any`; Scene left unrestricted.
- Streamlabs Desktop → Scene Changed; Instance `Any`; Scene left unrestricted.
- Meld Studio → Scene Changed; Connection `Any`. If your installed Streamer.bot version requires a Scene value, attach one copy of this trigger per scene to the same Intake action.

Streamer.bot does not publish stable import serialization identifiers for these trigger records, so the package intentionally leaves them for the creator to add through the documented UI. Do not attach scene triggers directly to the starter actions.

The intake uses the trigger-provided scene variables and one existing Streamer.bot WebSocket broadcast. It does not call `ObsGetCurrentScene()`, does not create another socket, and does not run an action by its mutable name. StreamBridge maps scene names to creator-approved stable action IDs and supplies scene arguments to the target.

## References

The intake C# requires `mscorlib.dll`, `System.dll`, `netstandard.dll`, and Streamer.bot's local `Newtonsoft.Json.dll`. Starter targets require only `mscorlib.dll` and `System.dll`.
