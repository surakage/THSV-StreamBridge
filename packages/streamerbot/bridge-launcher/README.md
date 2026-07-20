# Bridge Launcher

This package installs **THSV StreamBridge - Launch Bridge** and **THSV StreamBridge - Shutdown Bridge**.

Each action begins with an editable **Set Argument** named `thsvBridgeInstallPath`. Its default value is the actual expandable path `%LOCALAPPDATA%\THSV StreamBridge`; edit that sub-action only when using a custom managed installation or source checkout. The C# reads it with the documented `CPH.TryGetArg()` method and expands Windows environment variables. A legacy persisted global with the same name is read only when the argument is missing, so new installations do not need that global.

## Trigger setup

- Launch Bridge may use **Core > Streamer.bot > Streamer.bot Started**.
- Keep Shutdown Bridge manual.

Do not attach Shutdown Bridge to one platform's Stream Offline event. In a multistream, another platform may still be live. Native platform online/offline triggers stop stream-relative timed sessions only after every observed platform is offline; they do not stop the bridge service.

## Safety behavior

For a public installation, Launch Bridge runs the bundled `runtime\node.exe` with `launcher\start.mjs`. For a source checkout, it runs the official `scripts\start.ps1` through hidden, non-interactive PowerShell. Both lifecycle paths safely replace an existing StreamBridge instance.

For a public installation, Shutdown Bridge runs `launcher\stop.mjs`; for a source checkout, it runs `scripts\stop.ps1`. The selected lifecycle path resolves the active configuration, uses the private local control token, waits for exit, and removes lifecycle state. The token never enters a Streamer.bot argument, global variable, log message, or C# string.

Both actions verify the selected install folder and required launcher files before starting anything. Exceptions are logged by type without exposing creator paths or command output.

Both actions wait for the launcher process to finish and check its exit code before reporting success — Launch Bridge allows up to 30 seconds (matching the launcher's own health-check window) and Shutdown Bridge up to 20 seconds. An action that only confirmed a process handle existed, without waiting for the launcher's own result, could report success even when the bridge failed to become healthy or failed to stop.

Neither action creates, edits, deletes, enables, disables, or otherwise mutates another Streamer.bot object.

## Verification status

Implementation complete; live Streamer.bot Alpha compilation of this exact reviewed source remains part of the release acceptance gate.
