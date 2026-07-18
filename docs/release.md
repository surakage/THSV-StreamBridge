# Installer and public release

Milestone 11 packages THSV StreamBridge as a checksummed Windows release archive. The installer supports paths containing spaces, verifies every packaged file before changing an installation, installs production Node dependencies in a staging directory, and swaps the staged installation into place only after validation succeeds.

## Prerequisites

- Windows 10 or later
- 64-bit Node.js 22 or later, including `npm.cmd`
- Windows PowerShell 5.1 or later
- Streamer.bot `1.0.5-alpha.31` for the currently verified automation packages

## Install

1. Download the versioned `.zip` and adjacent `.sha256` file from the official GitHub release.
2. Verify the archive in PowerShell: `Get-FileHash .\THSV-StreamBridge-<version>.zip -Algorithm SHA256`.
3. Extract the archive to a temporary directory.
4. Review the included `LICENSE`, `CHANGELOG.md`, and `release-manifest.json`.
5. Run:

```powershell
.\scripts\install-release.ps1
```

The default installation directory is `%LOCALAPPDATA%\THSV StreamBridge`. Use `-InstallRoot 'D:\Apps\THSV StreamBridge'` to choose another safe directory. The installer creates `data\runtime\bridge.local.json` without changing the checked-in example. It does not start the service unless `-StartBridge` is supplied.

After configuring Streamer.bot or explicitly enabling its reported test mode in the local configuration, verify the installation without development dependencies:

```powershell
& "$env:LOCALAPPDATA\THSV StreamBridge\scripts\start.ps1" -Config 'data/runtime/bridge.local.json'
& "$env:LOCALAPPDATA\THSV StreamBridge\scripts\health.ps1"
& "$env:LOCALAPPDATA\THSV StreamBridge\scripts\simulate.ps1"
& "$env:LOCALAPPDATA\THSV StreamBridge\scripts\stop.ps1"
```

## Upgrade and rollback safety

Run the newer extracted release's `install-release.ps1` against the existing installation directory. Before the swap, the installer stops the managed bridge, runs the existing backup script, and carries the complete `data` directory into the new installation. That preserves creator configuration, the private control token, archived viewer-progression and companion state, timer state, logs, and backups. Preserved add-on state is not loaded by core and remains until the creator explicitly removes user data. Release-file hashes and production dependencies are validated in a staging directory before the existing installation is moved.

If the final directory swap fails, the installer restores the previous installation. A release never imports `.env`, runtime data, credentials, or state from its archive.

To repair corrupted or missing release files, rerun the same version's extracted
`scripts\install-release.ps1` against the managed installation. The installer re-verifies and
replaces release-owned files while preserving creator `data/`, which is the supported repair path;
no separate repair script is required.

### Downgrades

The installer refuses to replace a newer installed SemVer with an older release because older code may not understand newer state schemas. If a downgrade is deliberately required, first make and retain an external copy of the entire `data` directory, review the target release's state compatibility, and then pass `-AllowDowngrade`. This explicit switch removes the version guard; it does not migrate newer state backward.

## Uninstall

Run the installed script:

```powershell
& "$env:LOCALAPPDATA\THSV StreamBridge\scripts\uninstall-release.ps1"
```

Uninstall preserves the complete `data` directory by default. Use `-RemoveUserData` only when creator configuration, private tokens, logs, archived add-on state, timers, and backups should also be permanently removed.

## Public-release boundary

The archive is not a claim that every platform transport is production-complete. Twitch, YouTube, and Kick intake currently depends on the verified Streamer.bot relay package; TikTok/TikFinity provenance limitations remain documented. Facebook is not supported. Review [integration assumptions](integration-assumptions.md) before enabling progression, financial alerts, or speech.

THSV StreamBridge is distributed under the permissive MIT License. Every public archive includes the license text. The final release candidate must still pass installation, upgrade, uninstall, checksum, secret-scan, and live-service acceptance before publication.

Archived Bloom asset provenance and direct production dependency licenses remain documented in [Asset and third-party notices](../THIRD-PARTY-NOTICES.md).
