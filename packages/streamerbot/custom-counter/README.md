# THSV StreamBridge - Custom Counter

Import the generated `.sb` file. Keep every action inside its dedicated **THSV Addon - Custom Counter** group. Attach actions only to creator-controlled hotkeys, Stream Deck buttons, manual tests, or other trusted triggers.

Each action exposes `counterId`. Add, Subtract, and Set also expose `counterAmount`; Rename exposes `counterName`; Save and Load expose `counterPreset`. No action writes files or changes Streamer.bot globals.
