# Troubleshooting

## Confirm support before debugging

Facebook is not supported. Twitch, YouTube, and Kick require the included Streamer.bot relay setup, and TikTok/TikFinity retains documented provenance limitations. Check the [compatibility and platform matrix](compatibility.md) before treating an unsupported or unverified transport as an installation failure.

## Startup reports a port conflict

The normal launcher and `npm run dev` safely replace another tracked THSV StreamBridge instance before binding. If the conflict remains, an unrelated or untracked process owns the configured diagnostics port. Run `Get-NetTCPConnection -LocalPort 8787`, stop that application yourself, or change `service.port`; StreamBridge deliberately will not kill an unidentified process.

## Readiness is not ready

Open `http://127.0.0.1:8787/diagnostics`. Disabled adapters do not block readiness. Any enabled adapter that is not connected, a deferred placeholder, or an output crossing its delivery-failure threshold blocks readiness.

`health.ps1` reports not-ready responses without dumping a PowerShell web exception.

## Streamer.bot is unavailable

Confirm its WebSocket server is started and its address, port, endpoint, and authentication match configuration. Test mode performs no network connection.

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
