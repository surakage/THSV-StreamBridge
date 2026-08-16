# THSV StreamBridge - Stream Launch Countdown

Import the generated `.sb` file into Streamer.bot and accept its reviewed custom C# warning.

The package creates seven optional manual controls in **THSV Addon - Stream Launch Countdown**. Do not attach OBS, Meld, or Streamlabs scene triggers to **Start** or **Stop**: StreamBridge follows normalized program-scene changes directly, ignores preview-only transitions, and preserves an in-progress timer when duplicate events arrive. Use the actions only as optional hotkeys or Stream Deck controls. **Set & Start** exposes `countdownSeconds` above the C# block for a deliberate one-off duration without source edits.

Required C# references:

- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\mscorlib.dll`
- `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\System.dll`
- `.\Newtonsoft.Json.dll`

The code only broadcasts a validated local `thsv.addon` control envelope. It does not send chat, access files, call external APIs, or execute another action.
