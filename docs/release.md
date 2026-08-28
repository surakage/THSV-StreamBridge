# Portable Windows release

THSV StreamBridge is distributed as a self-contained Windows x64 ZIP from the official GitHub Releases page. It includes the compiled bridge, exact production dependencies, launchers, documentation, reviewed Streamer.bot packages, and a pinned Node.js 22 runtime. Installation does not run npm, require administrator access, or require a globally installed Node.js.

For a first installation, follow [Getting started](getting-started.md). This page documents the package and lifecycle behavior in more detail.

## Verify the download

Download the versioned `THSV-StreamBridge-<version>.zip` and adjacent `.sha256` file from the same official release. Follow the commands in [`RELEASE-VERIFICATION.md`](../RELEASE-VERIFICATION.md) to check both the SHA-256 digest and GitHub Actions artifact attestation. The checksum detects corruption; the GitHub attestation authenticates that the archive came from this repository's release workflow without requiring a paid Windows code-signing certificate.

The release builder downloads the pinned Node runtime from nodejs.org and verifies it against Node.js's published `SHASUMS256.txt` before packaging it. Every file inside the release is then listed with its size and SHA-256 hash in `release-manifest.json`. The installer verifies the entire manifest before creating or changing an installation, copies into creator-private staging, and verifies it again before activation.

## Install

1. If Windows shows **Unblock** in the verified ZIP's Properties, select it before extracting.
2. Extract the verified ZIP to a temporary folder. Do not run the installer from inside the ZIP preview.
3. Review `README.md`, `CHANGELOG.md`, and `release-manifest.json` if desired.
4. Double-click `Install THSV StreamBridge.cmd`.

The command window remains open and shows a final success or failure message. If Windows policy blocks the `.cmd` wrapper, open PowerShell in the extracted folder and run:

```powershell
.\runtime\node.exe .\installer\install.mjs
```

This invokes the same installer through the bundled runtime and preserves its visible console output.

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

The installer generates a random 256-bit control token for a new installation, saves a protected `THSV StreamBridge Recovery Key.txt` in the installed folder, restricts both copies to the current Windows user where supported, starts the bridge, waits for its loopback health endpoint, and opens the authenticated setup wizard through a 60-second single-use unlock ticket. A different installation receives a different token. Upgrading preserves the existing installation's token and refreshes its recovery file so saved local setup continues working. The installer reports the recovery-file path without printing the token itself.

If automatic launch is not wanted, run the extracted installer from a terminal with `--no-start`. `--install-root <path>` selects a safe alternative destination. These switches are primarily for managed or test installations; the normal public flow is the root install command.

After installation, complete the [Streamer.bot setup](streamerbot-setup.md) before enabling live automation.

## Start, stop, and open setup

Use these launchers in the installation root (`%LOCALAPPDATA%\THSV StreamBridge`), or run **THSV StreamBridge - Open Setup Wizard** directly in Streamer.bot:

- `Start THSV StreamBridge.cmd`
- `Start THSV Streamer.bot Safely.cmd`
- `Start THSV Streaming Tools.cmd`
- `Stop THSV StreamBridge.cmd`
- `Open THSV Setup Wizard.cmd`
- `Create THSV Recovery Bundle.cmd`
- `Restore THSV Recovery Bundle.cmd`
- `Uninstall THSV StreamBridge.cmd`

Starting a second managed instance first requests authenticated shutdown of the recorded instance, waits for it to exit, and then starts the active version. The launcher passes explicit data, add-on package, and add-on-state roots so release upgrades cannot overwrite creator files.

**Open THSV Setup Wizard** first opens the healthy Bridge without restarting it. If the Bridge is offline, it falls back to the normal start launcher. Both that launcher and the Streamer.bot action open an already-authenticated wizard without requiring users to locate or paste the permanent token.

Each `.cmd` launcher stays open long enough to show the final result. If a launcher is blocked, run its matching `.mjs` file with the installed runtime from PowerShell. For example:

```powershell
& "$env:LOCALAPPDATA\THSV StreamBridge\runtime\node.exe" "$env:LOCALAPPDATA\THSV StreamBridge\launcher\start.mjs" --open-wizard
```

The installer keeps launchers and the protected recovery key inside the managed installation and does not add automatic Desktop shortcuts. Stream Deck users can assign **System → Open** directly to `Start THSV Streaming Tools.cmd` in the installed folder. The command self-closes after success and pauses only on failure. Upgrades remove the two older installer-created **THSV StreamBridge Folder** and **THSV Streaming Tools** shortcuts when they still point at the same managed installation.

For an off-machine disaster-recovery copy, use the encrypted export and transactional restore described in [Encrypted recovery bundles](recovery-bundles.md). These bundles include secrets and add-on state only inside authenticated encryption; ordinary configuration exports remain intentionally secret-free.

## Upgrade and rollback

Run the newer release's root installer. It refuses a downgrade by default, stages and re-verifies the new release, activates it, and runs a health check. If startup health fails during installation, the transaction restores the working installation. After a successful health check, every inactive application version is removed and no persistent rollback version is retained.

Creator-owned `data/` and `addons/state/` directories are not part of a version swap. Old application versions beyond the active and previous versions are cleaned after a successful installation. A deliberate downgrade requires `--allow-downgrade` and should be preceded by an external copy of both creator-owned directories because older code may not understand newer state.

The safe launcher stores its creator-selected Streamer.bot executable and optional, opt-in OBS Studio and Speaker.bot executable locations in `data/configuration/streamerbot-launcher.json`. Version 1 launcher settings migrate in place when an optional app is first saved. The installer preserves this file and refreshes the launcher code during upgrades. Newly launched optional apps receive a bounded 1.5-second process-stability check before Streamer.bot starts. These applications are never bundled, downloaded, updated, closed, or modified by StreamBridge; optional startup failures are warnings and do not block core readiness.

Release `2.3.1` and later retry bounded transient Windows `EACCES`, `EBUSY`, `ENOTEMPTY`, and `EPERM` file-lock failures during activation. Close any File Explorer, editor, or antivirus scan holding the old application directory if the bounded retry still fails, then rerun the installer.

## Uninstall and privacy

Run `launcher\Uninstall THSV StreamBridge.cmd`. By default it removes application, runtime, and launcher files while preserving `data/` and `addons/` so an accidental uninstall does not destroy configuration or locally stored state.

Permanent deletion requires both `--delete-user-data` and `--confirm-delete-everything` when invoking `uninstall.mjs` directly. This double confirmation is intentional. StreamBridge does not store Twitch, YouTube, Kick, or TikTok account credentials; those remain owned by Streamer.bot or TikFinity. Configuration exports omit control tokens, passwords, connection URLs, uploaded media, and runtime history.

## Add-ons

Install `.thsv-addon` files from the authenticated wizard's Add-ons page. The wizard displays publisher, version, description, package kind, compatibility, requested permissions, and any declared source/support/update/revocation links before approval. It verifies archive paths, expanded size, the descriptor, every declared file, hashes, and core-version bounds in private staging.

The installation order is:

1. Install and verify core.
2. Download and verify the add-on's separate ZIP from the same official release.
3. Install its `.thsv-addon` from the wizard.
4. Return to **Streamer.bot → One Streamer.bot import**, select the enabled add-on, and generate one combined `.sb` file.
5. Import that file with overwrite enabled for matching THSV actions, follow its generated trigger checklist, configure approved actions and settings, restart when requested, then run its preview or test.

The individual `.sb` inside an add-on ZIP is retained as a recovery option. It is not the normal Version 4 setup path.

Official Version 4 releases publish 11 optional add-ons separately. The 23 components belonging to the seven built-in extension groups are packaged inside the main archive and are not duplicated as optional downloads. Keeping genuine add-ons separate makes each package's executable permissions and Streamer.bot action requirements visible before installation; core never installs them automatically. Release automation derives the built-in set from the Bridge feature registry, so a component cannot silently appear in both inventories.

Declarative add-ons contain schemas and settings only and do not execute add-on code. Executable add-ons receive scoped framework handles for supported operations, including exact creator-approved Streamer.bot action IDs, but still run under the same Windows account as StreamBridge; the broker is not an operating-system sandbox. Install executable packages only from a trusted publisher after source review. Official release packaging emits `THSV-StreamBridge-AddOns-index.json` plus a checksum next to the add-on ZIPs, and GitHub artifact attestations are the free provenance path for public official releases. The wizard's **Check updates** action reads that bounded official index, reports versions, compatibility, publisher mismatches, unlisted packages, and revocations, and provides the exact trusted GitHub asset URL plus published SHA-256. Download remains creator-started; installation, enabling, disabling, and removal always require an explicit local action. Corrupt add-ons are rejected independently and cannot make core unavailable. Disable, upgrade, repair, and uninstall operations are scoped to the selected module ID; uninstall preserves its private state.

An add-on requesting `overlay.publish` receives a copyable `/overlay/addons/<module-id>` browser-source URL and preview button in the wizard. The renderer is owned by core, accepts only namespaced bounded card, media, and timer payloads, and does not execute package browser code.

## Release pipeline

Release tags are prepared through the manual **Prepare release tag** workflow. It requires the exact 40-character SHA currently at the tip of `main`, confirms the version against `package.json`, proves that commit belongs to a pull request merged into `main`, rejects existing tags, and waits at the protected `streambridge-tag` environment before creating one annotated tag. The tag then triggers the separate release workflow.

Tagged releases first run startup-chaos acceptance, then wait at the `streambridge-release` GitHub environment before any release assets are built or published. Both environments require creator review and prevent administrator bypass. The repository variable `WINDOWS_SIGNING_MODE` explicitly selects `unsigned` (the default) or `certificate`. Unsigned mode never consumes certificate secrets and relies on checksums plus GitHub attestations; certificate mode fails closed unless the protected PFX and creator-approved thumbprint allowlist are configured. After approval, a Windows GitHub Actions runner installs from the lockfile, runs build/lint/typecheck/tests/config validation, verifies the bundled Node runtime's Authenticode identity, optionally signs first-party PowerShell launchers in certificate mode, creates an npm CycloneDX SBOM, builds the portable archive, and attests its build provenance and SBOM. It also creates an attested release-evidence manifest and checksum that bind the tag and commit to lifecycle evidence, startup-chaos evidence, signing metadata, and the exact size and SHA-256 of every release asset. The archive, checksum, add-ons, index, SBOM, evidence manifest, and evidence checksum are then published to a GitHub Release.

Release Readiness provides a single non-publishing handoff with the tag, candidate SHA, current `main` SHA, exact-match state, workflow links, PR checks, protected-branch status, active ruleset count, and immutable-release status. It never changes those settings. The repository administrator must review and enable the intended rulesets and immutable releases separately.

The weekly dependency canary updates only compatible lockfile resolutions on an isolated Windows runner. It opens a draft dependency pull request only after the updated graph passes startup chaos and the same complete package/install/upgrade preflight as a release. Failure opens or updates one automation issue; recovery closes it.

Publication triggers a separate post-release workflow that downloads the public assets, re-verifies every checksum and attestation, validates the evidence manifest against every downloaded asset, matches add-ons to the signed index, performs clean install plus latest-two-release upgrade/reinstall/rollback-protection drills, then uninstalls while preserving creator data and proves that reinstall retains state and recovery access. Machine-readable evidence is retained. A single issue is opened per failed tag and is closed automatically when a successful rerun proves recovery; the shared notification policy has a network-free dry-run mode and unit tests.

The archive is not a claim that every platform transport is production-complete. Review [integration assumptions](integration-assumptions.md) before using unverified high-impact events for financial, reward, or destructive automation.
