# Scene Actions add-on

Scene Actions turns a scene change in OBS Studio, Streamlabs Desktop, or Meld Studio into a guarded StreamBridge event and then runs creator-approved Streamer.bot actions. It reacts to scenes; it does not switch scenes itself.

## Why it uses one intake

The imported `THSV Scene Actions - Intake` action receives the streaming app's documented Scene Changed trigger variables and broadcasts one small `thsv.scene` envelope over Streamer.bot's existing WebSocket. StreamBridge normalizes it as `stream.scene-changed`. This also supplies real scene state to core Timed Action scene gates.

The add-on maps provider, optional connection name, and exact scene name to a stable Streamer.bot action ID. It never calls `CPH.RunAction(sceneName, true)`, so unrelated actions with a matching name cannot be run and creator renames do not break mappings.

## Streamer.bot trigger setup

Attach these triggers to the Intake action for the applications you use:

- OBS Studio → Scene Changed; Connection `Any`; leave Scene unrestricted.
- Streamlabs Desktop → Scene Changed; Instance `Any`; leave Scene unrestricted.
- Meld Studio → Scene Changed; Connection `Any`. If the installed Streamer.bot version requires a Scene value, add one copy of the trigger per scene to the same Intake action.

The package does not manufacture trigger export records because Streamer.bot does not document stable serialization IDs for them. Adding the three triggers through Streamer.bot's UI keeps the package compatible and auditable.

## Wizard setup

1. Open Streamer.bot in the wizard and refresh the action inspection.
2. Under Scene Actions, approve only the actions the add-on may dispatch.
3. Edit or remove the five starter mappings. Choose a provider, exact scene name, optional connection name, target action, and optional delay.
4. Save settings, save action grants, and restart StreamBridge.

Starter mappings initially target the imported Starting Soon, Just Chatting, Gameplay, Be Right Back, and Ending Soon actions. Their C# blocks are intentionally empty; add normal Streamer.bot sub-actions or replace the block. They can be renamed safely.

## Safety

- Trigger Test events do not run target actions by default.
- Repeated copies of the same scene event are suppressed for 1.5 seconds by default.
- A sliding action-rate window prevents scene-action loops from running indefinitely.
- At most ten matching mappings run for one event, while the capability broker separately enforces approved IDs, concurrency, and per-minute action limits.
- Only timestamps, mapping keys, and loop counters are stored. Streaming-app credentials and scene payloads are never retained.

Official variable references: [OBS Studio Scene Changed](https://docs.streamer.bot/api/triggers/obs-studio/scene-changed), [Streamlabs Desktop Scene Changed](https://docs.streamer.bot/api/triggers/streamlabs-desktop/scene-changed), and [Meld Studio Scene Changed](https://docs.streamer.bot/api/triggers/meld-studio/scene-changed).
