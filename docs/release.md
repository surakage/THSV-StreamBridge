# Portable Windows release

THSV StreamBridge is distributed as a self-contained Windows x64 ZIP from the official GitHub Releases page. It includes the compiled bridge, exact production dependencies, launchers, documentation, reviewed Streamer.bot packages, and a pinned Node.js 22 runtime. Installation does not run npm, require administrator access, or require a globally installed Node.js.

## Verify the download

Download the versioned `THSV-StreamBridge-<version>.zip` and adjacent `.sha256` file from the same official release. Follow the commands in [`RELEASE-VERIFICATION.md`](../RELEASE-VERIFICATION.md) to check both the SHA-256 digest and GitHub Actions artifact attestation. The checksum detects corruption; the GitHub attestation authenticates that the archive came from this repository's release workflow without requiring a paid Windows code-signing certificate.

The release builder downloads the pinned Node runtime from nodejs.org and verifies it against Node.js's published `SHASUMS256.txt` before packaging it. Every file inside the release is then listed with its size and SHA-256 hash in `release-manifest.json`. The installer verifies the entire manifest before creating or changing an installation, copies into creator-private staging, and verifies it again before activation.

## Install

1. Extract the verified ZIP to a temporary folder.
2. Review `README.md`, `CHANGELOG.md`, and `release-manifest.json` if desired.
3. Double-click `Install THSV StreamBridge.cmd`.

The default destination is `%LOCALAPPDATA%\THSV StreamBridge`. The installer creates this layout:

```text
THSV StreamBridge/
  app/<version>/        versioned release-owned application files
  runtime/              bundled Node.js runtime
  launcher/             stable start, stop, wizard, and uninstall launchers
  data/                 creator configuration, secrets, state, logs, backups
  addons/packages/      verified installed add-on packages
  addons/state/         private add-on settings and state
```

The installer generates a random 256-bit control token for a new installation, restricts the installation to the current Windows user where supported, starts the bridge, waits for its loopback health endpoint, and opens the authenticated setup wizard. A different installation receives a different token. Upgrading preserves the existing installation's token so saved local setup continues working.

If automatic launch is not wanted, run the extracted installer from a terminal with `--no-start`. `--install-root <path>` selects a safe alternative destination. These switches are primarily for managed or test installations; the normal public flow is the root install command.

## Start, stop, and open setup

Use the shortcuts in the installed `launcher` directory:

- `Start THSV StreamBridge.cmd`
- `Stop THSV StreamBridge.cmd`
- `Open THSV Setup Wizard.cmd`
- `Uninstall THSV StreamBridge.cmd`

Starting a second managed instance first requests authenticated shutdown of the recorded instance, waits for it to exit, and then starts the active version. The launcher passes explicit data, add-on package, and add-on-state roots so release upgrades cannot overwrite creator files.

## Upgrade and rollback

Run the newer release's root installer. It refuses a downgrade by default, stages and re-verifies the new release, keeps the current version as `previousVersion`, activates the new version, and runs a health check. If startup health fails, the activation record is restored to the previous version.

Creator-owned `data/` and `addons/state/` directories are not part of a version swap. Old application versions beyond the active and previous versions are cleaned after a successful installation. A deliberate downgrade requires `--allow-downgrade` and should be preceded by an external copy of both creator-owned directories because older code may not understand newer state.

## Uninstall and privacy

Run `launcher\Uninstall THSV StreamBridge.cmd`. By default it removes application, runtime, and launcher files while preserving `data/` and `addons/` so an accidental uninstall does not destroy configuration or locally stored state.

Permanent deletion requires both `--delete-user-data` and `--confirm-delete-everything` when invoking `uninstall.mjs` directly. This double confirmation is intentional. StreamBridge does not store Twitch, YouTube, Kick, or TikTok account credentials; those remain owned by Streamer.bot or TikFinity. Configuration exports omit control tokens, passwords, connection URLs, uploaded media, and runtime history.

## Add-ons

Install `.thsv-addon` files from the authenticated wizard's Add-ons page. The wizard displays publisher, version, description, package kind, compatibility, requested permissions, and any declared source/support/update/revocation links before approval. It verifies archive paths, expanded size, the descriptor, every declared file, hashes, and core-version bounds in private staging.

Official releases publish every optional add-on as its own versioned `.thsv-addon` with an adjacent SHA-256 file and GitHub build-provenance attestation. Keeping add-ons separate makes each package's executable permissions and Streamer.bot action requirements visible before installation; core never installs them automatically. Release automation discovers valid package folders under `addons/`, so a future add-on can join the same release without being compiled into core.

Declarative add-ons contain schemas and settings only and do not execute add-on code. Executable add-ons receive scoped framework handles for supported operations, including exact creator-approved Streamer.bot action IDs, but still run under the same Windows account as StreamBridge; the broker is not an operating-system sandbox. Install executable packages only from a trusted publisher after source review. Official release packaging emits `THSV-StreamBridge-AddOns-index.json` plus a checksum next to the add-on ZIPs, and GitHub artifact attestations are the free provenance path for public official releases. The wizard's manual **Check updates** action reads that bounded official index and reports versions, compatibility, publisher mismatches, unlisted packages, and revocations. It does not download, install, enable, disable, or remove anything. Corrupt add-ons are rejected independently and cannot make core unavailable. Disable, upgrade, repair, and uninstall operations are scoped to the selected module ID; uninstall preserves its private state.

An add-on requesting `overlay.publish` receives a copyable `/overlay/addons/<module-id>` browser-source URL and preview button in the wizard. The renderer is owned by core, accepts only namespaced bounded card, media, and timer payloads, and does not execute package browser code.

## Release pipeline

Tagged releases build on a Windows GitHub Actions runner, install from the lockfile, run build/lint/typecheck/tests/config validation, create an npm CycloneDX SBOM, build the portable archive, attest its build provenance and SBOM, and publish the archive, checksum, and SBOM to a GitHub Release. Repository administrators should enable GitHub immutable releases before public v2 publication.

The archive is not a claim that every platform transport is production-complete. Review [integration assumptions](integration-assumptions.md) before using unverified high-impact events for financial, reward, or destructive automation.
