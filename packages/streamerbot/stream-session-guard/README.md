# THSV StreamBridge - Stream Break & End Guard

Import the `.sb` file, Save and Compile **Scene Controller**, approve it for Stream Break & End Guard in the wizard, and leave it triggerless.

The built-in extension owns all timing and safety checks. The helper receives only a one-use broker token, the selected broadcast app, a bounded connection index, and one exact wizard-selected scene name. It uses Streamer.bot's documented `ObsSetScene`, `SlobsSetScene`, or `MeldStudioShowSceneByName` method and reports the result back to StreamBridge.
