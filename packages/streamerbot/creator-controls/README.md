# THSV StreamBridge - Creator Controls

Import the `.sb` package, Save and Compile all four actions, and approve only **Provider Controller** for Creator Controls in the wizard. The controller must have no trigger. Attach Apply Profile 1/2/3 only to creator-controlled hotkeys, deck buttons, or approved Scene Actions targets.

The controller uses Streamer.bot's documented `SetChannelTitle`, `SetChannelGameById`, `YouTubeSetTitle`, `YouTubeSetCategory`, `KickSetTitle`, and `KickSetCategory` methods. Empty fields are skipped and each provider failure is isolated and returned to StreamBridge.
