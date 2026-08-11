# Bridge Launcher

This package installs **THSV StreamBridge - Launch Bridge**, **Shutdown Bridge**, **Check Connections**, and **Monitor Connections**.

Each lifecycle action begins with an editable **Set Argument** named `thsvBridgeInstallPath`. Its default value is the expandable path `%LOCALAPPDATA%\THSV StreamBridge`; edit that sub-action only when using a custom managed installation or source checkout. Check Connections and Monitor Connections instead use `thsvBridgeHealthForceToast`: manual checks set it to `true`, while the recurring monitor sets it to `false` to suppress unchanged results.

## Trigger setup

- Launch Bridge may use **Core > Streamer.bot > Streamer.bot Started**.
- Keep Shutdown Bridge manual.
- Keep Check Connections manual so it can always show the current result on demand.
- Attach Monitor Connections to a one-minute **Core > Timed Actions** trigger. It stores only the last in-memory health state and shows a toast when that state changes, so healthy checks do not create notification spam.

Do not attach Shutdown Bridge to one platform's Stream Offline event. In a multistream, another platform may still be live. Native platform online/offline triggers stop stream-relative timed sessions only after every observed platform is offline; they do not stop the bridge service.

## Safety behavior

For a public installation, Launch Bridge runs the bundled `runtime\node.exe` with `launcher\start.mjs`. For a source checkout, it runs the official `scripts\start.ps1` through hidden, non-interactive PowerShell. Both lifecycle paths safely replace an existing StreamBridge instance.

For a public installation, Shutdown Bridge runs `launcher\stop.mjs`; for a source checkout, it runs `scripts\stop.ps1`. The selected lifecycle path resolves the active configuration, uses the private local control token, waits for exit, and removes lifecycle state. The token never enters a Streamer.bot argument, global variable, log message, or C# string.

The lifecycle actions verify the selected install folder and required launcher files before starting anything. Exceptions are logged by type without exposing creator paths or command output.

Launch Bridge checks `/ready` before showing green. Check Connections always shows the current result. Monitor Connections checks the same endpoint but only shows a grouped Windows toast on a transition: first status, disconnected or degraded, recovered, or an optional-app status change. Disabled adapters are treated as intentionally unavailable, not broken.

The status message also reports whether Streamer.bot is connected to its primary OBS connection and whether a local Speaker.bot process is running. These are advisory checks: an offline OBS instance or optional Speaker.bot installation is shown clearly but never changes healthy StreamBridge delivery to a failure. Speaker.bot may run on another computer, so the monitor deliberately says only whether a **local process** was detected rather than claiming that the integration socket is connected.

Both actions wait for the launcher process to finish and check its exit code before reporting success — Launch Bridge allows up to 30 seconds (matching the launcher's own health-check window) and Shutdown Bridge up to 20 seconds. An action that only confirmed a process handle existed, without waiting for the launcher's own result, could report success even when the bridge failed to become healthy or failed to stop.

No action creates, edits, deletes, enables, disables, or otherwise mutates another Streamer.bot object.

## Stream Deck one-button startup

The public installer keeps `Start THSV Streaming Tools.cmd` in `%LOCALAPPDATA%\THSV StreamBridge` without adding an automatic Desktop shortcut. Add a Stream Deck **System → Open** action and select that target. One press verifies or starts Streamer.bot first, then verifies or starts StreamBridge. If both are already ready, it exits without restarting them. The wizard's **Streamer.bot connection** page displays and copies the exact target for custom installation paths.

## Verification status

Imported into Streamer.bot 1.0.7 and live-executed successfully on 2026-08-09. Launch and monitor trigger readback also passed.
