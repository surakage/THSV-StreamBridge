# THSV StreamBridge - Streamer Punishments

Import the `.sb` file, Save and Compile **Set Filter** and **Switch Scene**, approve both for Streamer Punishments in the wizard, and leave them triggerless.

**Set Filter** turns one OBS source filter on or off with OBS's `SetSourceFilterEnabled` request. **Switch Scene** moves OBS to one exact scene with `ObsSetScene`. Both check the one-use StreamBridge broker token first; StreamBridge owns all timing, queues and limits.
