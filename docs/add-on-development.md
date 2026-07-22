# V2 add-on development

Optional features install as `.thsv-addon` archives and use the existing StreamBridge process, event normalization, state roots, and single Streamer.bot WebSocket connection. An add-on must not ship its own copy of StreamBridge or silently start another service.

## Choose the package kind

Use `packageKind: "declarative"` whenever settings and framework-owned behavior are sufficient. Declarative packages have no JavaScript entrypoint or migrations. Their JSON configuration schema is validated server-side and rendered by the authenticated wizard with native controls; package HTML and scripts are never injected into the wizard.

Use `packageKind: "executable"` only when code is genuinely required. Executable add-ons run with the same Windows-account permissions as StreamBridge. The `permissions` list is mandatory disclosure for creator review, not an operating-system sandbox. Hashes prove installed bytes match the descriptor; they do not prove the identity or safety of the publisher.

Supported permission declarations are:

- `events.subscribe`
- `streamerbot.run-approved-action`
- `overlay.publish`
- `chat.send`
- `provider.events.publish` (first-party provider modules only; never a generic event emitter)
- `schedule.bounded`
- `state.private`

The capability broker turns these declarations into frozen, narrowly scoped runtime handles for private state, bounded scheduling, exact creator-approved Streamer.bot action IDs, source/selected-platform outbound messages, and namespaced publication to a core-hosted add-on overlay. Executable event subscribers must declare `events.subscribe`. See [Add-on capability broker](add-on-capabilities.md).

The broker is a supported least-privilege API, not an operating-system sandbox: executable packages remain a full-trust expert path and should undergo source review. Public third-party add-ons should prefer the declarative tier.

## Package layout

```text
my-addon/
  module-package.json
  schemas/config.json
  ui/settings.json       optional declarative UI ordering metadata
  dist/index.js          executable packages only
```

`module-package.json` uses `packageFormat: "thsv-addon-v2"` and contains the package kind, author, description, changelog, permissions, complete v2 module manifest, optional executable entrypoint, optional settings UI schema, optional publisher trust metadata, and the exact byte size and lowercase SHA-256 hash of every shipped file.

Packages are version-bounded with `minimumCoreVersion` and `maximumTestedCoreVersion`. They declare dependencies, required platform capabilities, event subscriptions, provided commands/actions, owned state, installation/removal instructions, and health checks. Add-ons requesting `overlay.publish` receive the fixed core route `/overlay/addons/<module-id>`; they cannot inject custom browser HTML or JavaScript. `browserSourcesProvided` remains reserved for a future declarative route manifest and must stay empty in this preview.

## Publisher, update, and revocation metadata

Add-ons may declare a `trust` object with HTTPS-only links:

```json
{
  "trust": {
    "publisherId": "thsv.streambridge",
    "sourceUrl": "https://github.com/surakage/THSV-StreamBridge",
    "supportUrl": "https://github.com/surakage/THSV-StreamBridge/issues",
    "updateManifestUrl": "https://github.com/surakage/THSV-StreamBridge/releases",
    "revocationListUrl": "https://github.com/surakage/THSV-StreamBridge/security/advisories"
  }
}
```

These fields do not silently install or trust code. They give the wizard a stable place to show source, support, update, and emergency-revocation links before a creator approves an add-on. Public release builds also generate `THSV-StreamBridge-AddOns-index.json` and `.sha256` next to the add-on ZIPs. The wizard can manually compare installed packages with that bounded official index and fail closed on malformed data, publisher mismatches, and untrusted GitHub asset URLs. GitHub artifact attestations are the free publisher-authentication path for public releases; the adjacent SHA-256 files remain integrity checks, not a replacement for reviewing the release publisher.

## Public download bundle

When an add-on requires Streamer.bot actions, keep its package under `packages/streamerbot/<add-on-folder>/` and declare the current `.sb` filename in that package's `manifest.json`. The folder name must match its source folder under `addons/`. The public release process creates one `THSV-StreamBridge-AddOn-<Name>-<version>.zip` per add-on containing:

- the wizard-installable `.thsv-addon` and its SHA-256 checksum;
- only that add-on's Streamer.bot `.sb` import under `Streamer.bot/`;
- the Streamer.bot package README when supplied; and
- a short `INSTALL.txt` describing the two-part installation.

Add-on Streamer.bot packages are excluded from the main StreamBridge ZIP. This prevents creators from importing actions for optional features they did not install and lets every add-on be downloaded, upgraded, and removed independently.

The release also publishes `THSV-StreamBridge-AddOns-index.json`, listing each add-on module ID, version, archive name, SHA-256 hash, compatibility range, permission list, publisher ID, and revocation flag. The wizard reads this index only after a creator presses **Check updates**. It reports status and the published archive hash but performs no download or installation. A future guided installer may verify the matching `.sha256` and GitHub release attestation, but it must still require explicit creator approval before installing executable add-ons.

## Settings contract

The wizard accepts a deliberately small, predictable JSON Schema subset:

- a root object with at most 100 properties;
- `string`, `number`, `integer`, and `boolean` fields plus bounded, unique lists of strings;
- scalar enums, defaults, required fields, text lengths, and numeric minimum/maximum bounds;
- `format: "multiline"` and `format: "color"` presentation hints plus deterministic field ordering through `ui/settings.json`;
- no unknown saved properties and no executable validation expressions.

Settings are limited to 64 KiB and written atomically under `addons/state/<module-id>/settings.json`. Uninstall removes package code but preserves this private state. The public release installer preserves both `data/` and `addons/state/` across upgrades and default uninstall.

## Build and test

From a source checkout:

```powershell
npm run addon:verify -- examples/addons/declarative-settings
npm run addon:package -- examples/addons/declarative-settings
```

The packager writes `dist/addons/<module-id>-<version>.thsv-addon`. Install it through the wizard's Add-ons page to exercise the same authenticated, archive-bounded, private-staging path creators use.

Creators may also place a `.thsv-addon` archive in `data/addons/inbox/`. StreamBridge inspects bounded regular files there and lists valid or rejected packages in the wizard, but it never installs them automatically. The creator must select the package, review its publisher text and permissions, and explicitly approve installation. An adjacent hash authenticates bytes only when it came from a separately trusted channel; it does not establish publisher identity.

The source-oriented expert CLI remains available for reviewed executable packages:

```powershell
npm run addon:install -- examples/addons/no-op data/addons --approve
npm run addon:remove -- sample.no-op data/addons --approve
```

Restart StreamBridge after install, update, enable/disable, or removal. A corrupt or incompatible package is shown as rejected and is not loaded; other add-ons and required core modules continue.

## Executable entrypoints and migrations

An executable entrypoint exports either a default `FrameworkModule` object or `createModule()`. Its runtime manifest must exactly match the verified descriptor. Module IDs cannot conflict with built-ins or other add-ons, dependencies must be available and acyclic, and required capabilities must exist on enabled input platforms. `start(context)`, `onEvent(event, context)`, and `stop(context)` receive the loader-owned capability context. Do not open another Streamer.bot WebSocket.

When `context.streamerbot.runApprovedAction()` invokes an action, StreamBridge adds a one-use `thsvAddonRelayToken` argument. Any C# action returning a `thsv.addon` envelope must copy it to the envelope's `relayToken` field. Do not persist, log, reuse, or expose that token; it is bound to the requesting module and expires quickly.

Executable upgrade migrations declare one unambiguous forward step and run in a bounded worker against the dedicated state root. StreamBridge snapshots that root, runs ordered migrations, re-verifies the private staged package after code execution, and restores code and state if migration fails. A migration still has full process-user permissions; rollback covers only the supplied state root.

## Reference packages

- `examples/addons/declarative-settings/` is the preferred harmless public reference. It demonstrates wizard-rendered settings without executable add-on code.
- `examples/addons/no-op/` is the minimal executable lifecycle reference for expert review and testing.

- `addons/random-clip-player/` is the first production-oriented executable media add-on. It requests only approved Streamer.bot action dispatch, bounded scheduling, private state, event subscription, and overlay publication, and reuses the bridge's one WebSocket connection. Release builds publish it as a separately reviewable `.thsv-addon` asset rather than silently installing it with core.
