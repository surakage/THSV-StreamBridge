# Scene Actions

Scene Actions runs creator-approved Streamer.bot actions when OBS Studio, Streamlabs Desktop, or Meld Studio changes scene. It uses the existing StreamBridge WebSocket, never stores streaming-app credentials, and dispatches stable action IDs rather than fragile action names.

## Setup

1. Import `THSV-StreamBridge-Scene-Actions-2.4.0.sb` into Streamer.bot.
2. Add the documented Scene Changed triggers to `THSV Scene Actions - Intake` (the import deliberately does not invent undocumented trigger IDs).
3. In the StreamBridge wizard, refresh Streamer.bot actions.
4. Approve only the target actions Scene Actions may run.
5. Edit the starter mappings so their provider and scene names exactly match your setup, then save and restart StreamBridge.

The five starter actions are safe empty templates. Rename and edit them freely; mappings continue to use their stable IDs. Duplicate-event and loop-rate protection are enabled by default. Streamer.bot Trigger Test events do not run mapped actions unless the creator explicitly enables that setting.
