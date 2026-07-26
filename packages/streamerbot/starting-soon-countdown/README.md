# THSV StreamBridge - Stream Launch Countdown

Import the generated `.sb` file into Streamer.bot and accept its reviewed custom C# warning.

The package creates seven actions in **THSV StreamBridge - Add-ons**. Attach **Start** to the scene-active trigger for your Starting Soon scene. Attach **Stop** to its scene-inactive trigger, or use **Reset** if the paused clock should remain visible. **Set & Start** exposes `countdownSeconds` above the C# block for a one-off duration without source edits.

Required C# references:

- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\mscorlib.dll`
- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.dll`
- `.\Newtonsoft.Json.dll`

The code only broadcasts a validated local `thsv.addon` control envelope. It does not send chat, access files, call external APIs, or execute another action.
