# THSV StreamBridge - Custom Counter

Import the generated `.sb` file only if you need a physical button, hotkey, manual test, or another trusted non-chat trigger. It contains one generic **THSV Addon - Custom Counter - Controller** action.

Wizard-created chat commands do not use this import and should not be duplicated here. This package is optional and intended only for creator hotkeys, Stream Deck buttons, or other trusted non-chat triggers.

When a manual control is genuinely needed, the Controller exposes `counterOperation`, `counterId`, `counterName`, `counterAmount`, and `counterPreset`. Use a distinct ID and label:

- Death hotkey: `counterId=deaths`, `counterName=Deaths`
- Win hotkey: `counterId=wins`, `counterName=Wins`

The IDs own separate persistent values, so the controls cannot update one another. Bridge-managed commands do not need separate Streamer.bot Command objects or duplicated actions. The Controller does not write files or change Streamer.bot globals.
