# Troubleshooting

Start with these checks:

1. Open `http://127.0.0.1:8787/health`.
2. Open `http://127.0.0.1:8787/diagnostics`.
3. Inspect `%LOCALAPPDATA%\THSV StreamBridge\data\logs\service.stderr.log`.
4. Confirm Streamer.bot's WebSocket server is running on `127.0.0.1:8080`.

## Installer opens and closes or shows no result

Current release wrappers remain open and display a final success or failure result. If an older or policy-blocked wrapper closes immediately, open PowerShell in the extracted release folder and run:

```powershell
.\runtime\node.exe .\installer\install.mjs
```

Do not run from inside the ZIP preview. If the command reports that `installer\install.mjs` is missing, you are running from an incomplete installed folder or an incorrectly extracted archive. Download the core ZIP again, verify it, extract the complete archive, and run the installer from that extracted folder.

## An installed launcher closes immediately

Use the launchers under `%LOCALAPPDATA%\THSV StreamBridge\launcher`, not copies left in an older extracted release folder. Current `.cmd` launchers pause after reporting the result.

To see the direct error in PowerShell:

```powershell
& "$env:LOCALAPPDATA\THSV StreamBridge\runtime\node.exe" "$env:LOCALAPPDATA\THSV StreamBridge\launcher\start.mjs" --open-wizard
```

If that fails, inspect `%LOCALAPPDATA%\THSV StreamBridge\data\logs\service.stderr.log`. Reinstalling the current core ZIP repairs application/runtime/launcher files while preserving creator data.

## The wizard does not open

Run `Open THSV Setup Wizard.cmd` from the installed `launcher` folder. Then check `http://127.0.0.1:8787/health`. If health is good but the browser did not open, manually open `http://127.0.0.1:8787/wizard/`. The launcher is still recommended because it starts the service and uses the local authentication flow.

## Smart App Control blocks the installer

On Windows 11 with Smart App Control enabled, double-clicking `Install THSV StreamBridge.cmd` can be blocked with "Smart App Control has blocked an app with a dangerous file extension." Smart App Control blocks unsigned script files (`.cmd`/`.bat`) that carry the downloaded-from-the-internet mark, and unlike SmartScreen it offers no "Run anyway" button. The `.cmd` is only a thin display wrapper — the real installer is `installer\install.mjs`, run by the bundled, OpenJS-Foundation-signed `runtime\node.exe`, which Smart App Control trusts.

Any one of these resolves it, best first:

1. **Unblock the ZIP before extracting, then re-extract.** Right-click the downloaded `THSV-StreamBridge-<version>.zip` → Properties → check **Unblock** → OK (or in PowerShell: `Unblock-File .\THSV-StreamBridge-<version>.zip`). Files extracted afterward no longer carry the internet mark. Verify the archive per [RELEASE-VERIFICATION.md](../RELEASE-VERIFICATION.md) first — unblocking is a statement that you trust the file.
2. **Run the installer without the wrapper.** Open a terminal in the extracted folder and run `.\runtime\node.exe .\installer\install.mjs` — this is exactly what the `.cmd` runs, minus the blocked script file.
3. **Turn Smart App Control off** in Settings → Privacy & security → Windows Security → App & browser control → Smart App Control settings. Only do this if you want it off in general: once disabled, Windows does not allow re-enabling it without reinstalling Windows.

The same restriction can affect the installed `launcher\*.cmd` shortcuts on strict machines; their PowerShell equivalents (`start.ps1`, `stop.ps1`) and the direct `runtime\node.exe` invocation remain available. This is a Windows policy interaction with unsigned portable software, not a StreamBridge defect — the project publishes SHA-256 checksums and GitHub artifact attestations instead of using a paid Windows code-signing certificate.

## Confirm support before debugging

Facebook is not supported. Twitch, YouTube, and Kick require the included Streamer.bot relay setup, and TikTok/TikFinity retains documented provenance limitations. Check the [compatibility and platform matrix](compatibility.md) before treating an unsupported or unverified transport as an installation failure.

## Startup reports a port conflict

The normal launcher and `npm run dev` safely replace another tracked THSV StreamBridge instance before binding. If the conflict remains, an unrelated or untracked process owns the configured diagnostics port. Run `Get-NetTCPConnection -LocalPort 8787`, stop that application yourself, or change `service.port`; StreamBridge deliberately will not kill an unidentified process.

## Readiness is not ready

Open `http://127.0.0.1:8787/diagnostics`. Disabled adapters do not block readiness. Any enabled adapter that is not connected, a deferred placeholder, or an output crossing its delivery-failure threshold blocks readiness.

`health.ps1` reports not-ready responses without dumping a PowerShell web exception.

## Streamer.bot is unavailable

Confirm its WebSocket server is started and its address, port, endpoint, and authentication match configuration. Test mode performs no network connection.

## A live event does not reach Chat or Alerts

Check Streamer.bot Action History in this order:

1. The matching Twitch, YouTube, Kick, or TikFinity **intake** action should run once.
2. `THSV StreamBridge - Receive Event` should run once.
3. The relevant `THSV StreamBridge - Multi-Chat` or `THSV StreamBridge - Multi-Alerts` child should run once.

Attach platform triggers only to intake actions. Keep Core Receiver and all `Multi-*` actions triggerless; add the `Multi-*` actions as immediate **Run Action** children under Core Receiver. If the intake runs but no receiver follows, confirm the platform is enabled in the wizard and the Streamer.bot WebSocket URL matches `127.0.0.1:8080/`. See [Streamer.bot setup](streamerbot-setup.md).

## An add-on is rejected after an update

Update core first, then install the latest matching add-on ZIP from the same official release. Restart StreamBridge after package changes. A stale setting renamed by a newer add-on should be migrated by current core; if rejection remains, record the exact wizard reason before uninstalling anything. Default add-on uninstall preserves its private settings for repair or reinstall.

## Service exits during startup

Inspect `data/logs/service.stderr.log` and `data/logs/streambridge.log`. Run configuration validation and build directly for detailed errors.

## Stale PID file

`stop.ps1` removes a stale PID file. It refuses to stop a live process unless its command line identifies the Bridge service.

## Meld Studio cannot reach the overlay or wizard

Meld Studio is distributed as an MSIX/UWP app. Windows sandboxes MSIX apps with loopback isolation on by default, which silently blocks any request to `127.0.0.1`/`localhost` — including the Chat, Alerts, and combined overlay URLs, and the setup wizard if opened from inside Meld's own browser layer. This is a Windows app-sandboxing restriction, not a StreamBridge bug, and the same restriction can affect other MSIX-packaged broadcasting apps.

Fix it by granting Meld Studio a loopback exemption, once, from an elevated (Administrator) PowerShell or Command Prompt:

1. Find Meld Studio's package family name: `Get-AppxPackage | Where-Object { $_.Name -like '*Meld*' } | Select-Object PackageFamilyName`
2. Grant the exemption: `CheckNetIsolation.exe LoopbackExempt -a -n="<PackageFamilyName>"` (substitute the value from step 1)
3. Restart Meld Studio and reload the overlay/wizard source

No StreamBridge restart is required. This only needs to be done once per machine per app; reinstalling or updating Meld Studio through the Microsoft Store can reset it and require re-running the exemption.
