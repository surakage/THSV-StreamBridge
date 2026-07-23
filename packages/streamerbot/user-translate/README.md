# THSV StreamBridge - User Translate

Import `THSV-StreamBridge-User-Translate-2.4.0.sb`, compile the single action with the references in `manifest.json`, and approve that exact action for User Translate in the StreamBridge wizard. Do not attach a trigger; the add-on capability broker dispatches it.

The action sends only explicitly requested chat text to MyMemory's HTTPS API. It never logs or persists that text. MyMemory requires a known source language, accepts at most 500 UTF-8 bytes per segment, and does not support `autodetect`; the action therefore splits bounded input into at most four safe segments. Provider failures return a generic code rather than leaking the message into logs.

Choose desired command codes in the add-on settings after installing it. Examples: `!translate es hello`, `!es hello`, and on Twitch a reply containing `!es`. Commands are read from normalized public chat and do not require separate Streamer.bot command objects. Reply metadata is supported only for Twitch in 1.0.0 because that is the only current intake path with documented reply variables.
