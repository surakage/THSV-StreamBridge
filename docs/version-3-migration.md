# Version 3 migration

Version 3 upgrades the bridge, every first-party add-on, browser overlays, and generated Streamer.bot imports to the same `3.5.0` product version. The normalized event and add-on API contract remains `2.0.0-preview.1`; that interface version is intentionally independent from the product release.

## Before updating

1. Stop THSV StreamBridge.
2. Back up `%LOCALAPPDATA%\THSV StreamBridge\data` and the Streamer.bot application folder.
3. Keep the existing `data\runtime\bridge.local.json`, `data\secrets`, `data\state`, `data\addons`, uploads, logs, and backups. Do not replace them with example files.
4. Export or back up Streamer.bot before replacing any THSV action. Streamer.bot owns trigger bindings; overwriting an intake action can replace its trigger collection.
5. Download the Version 3 ZIP and adjacent checksum from the official GitHub release. Verify both the SHA-256 file and GitHub artifact attestation before installation.

## Upgrade

1. Extract the verified ZIP to a temporary folder.
2. Run `Install THSV StreamBridge.cmd`, or run `runtime\node.exe installer\install.mjs` from PowerShell if Windows policy blocks command files.
3. The installer verifies the release manifest, stages the new application, preserves creator data, starts Version 3, checks health, and rolls back the application version if activation fails.
4. Open the wizard and confirm the displayed version is `3.5.0`, the bridge is healthy, and Streamer.bot is connected.
5. Install or update optional add-ons from their matching Version 3 ZIPs. Do not copy add-on JavaScript directly into the installed application.
6. Re-import only packages whose code you are intentionally replacing. Preserve or reattach intake triggers using the [trigger matrix](streamerbot-trigger-matrix.md).

## Data preserved

The portable installer preserves creator-owned configuration, secrets, add-on settings and private state, counters, goals, uploads, custom icons, logs, backups, and approved action grants. The active application and one previous application version are kept separately from creator data.

Version 1 or Version 2 configuration is loaded through the existing schema migration path. Unknown fields are not silently turned into live behavior. If a package or configuration cannot be migrated, the bridge reports the validation error and leaves the source file available for recovery.

## Intentional Version 3 changes

- Add-ons can declare centralized coordination resources as exclusive, queueable, independent, background, high-priority, or skippable.
- The wizard exposes an authenticated, creator-confirmed emergency coordination reset.
- Reward setup uses one central blueprint catalogue with honest Twitch, Kick, YouTube, and TikTok capability limits.
- Custom Counter is a separate optional add-on with private atomic persistence and a core-hosted overlay.
- Every generated Streamer.bot package uses Version 3 naming metadata and its declared group. Core intakes remain separate from add-on groups.
- High-impact events still require provider-stable event identifiers. Version 3 does not weaken the financial, reward, raid, moderation, or destructive-action trust boundary.

## Streamer.bot trigger safety

Import packages first, then attach triggers only to the intake or explicitly documented control action. Keep Core Receiver, Multi-Chat, Multi-Commands, Multi-Alerts, Multi-Timed Actions, Reward Administration, and add-on controller actions triggerless unless their package guide says otherwise. Never attach the same provider trigger to both an intake and a downstream processor.

Twitch reward redemption intake is supported. Twitch reward mutation requires creator approval and a Streamer.bot-owned custom reward. Kick redemption intake is supported, but the current documented Streamer.bot surface does not provide equivalent Kick create, update, fulfill, or refund operations; Version 3 does not claim otherwise.

## Rollback

1. Stop the bridge.
2. Use the installed rollback launcher or rerun the previous verified installer if the previous application version remains available.
3. Restore the backed-up `data` folder only if creator data itself was damaged. Normally, application rollback does not require restoring creator data.
4. Restore the Streamer.bot backup if imports or trigger bindings were changed.
5. Start the bridge and verify `/health`, `/ready`, the wizard version, and one harmless simulated event.

Do not downgrade configuration by copying a sample file over the active file. Keep the failed Version 3 logs and backup when reporting a migration issue.
