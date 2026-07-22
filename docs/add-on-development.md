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

`module-package.json` uses `packageFormat: "thsv-addon-v2"` and contains the package kind, author, description, changelog, permissions, complete v2 module manifest, optional executable entrypoint, optional settings UI schema, and the exact byte size and lowercase SHA-256 hash of every shipped file.

Packages are version-bounded with `minimumCoreVersion` and `maximumTestedCoreVersion`. They declare dependencies, required platform capabilities, event subscriptions, provided commands/actions, owned state, installation/removal instructions, and health checks. Add-ons requesting `overlay.publish` receive the fixed core route `/overlay/addons/<module-id>`; they cannot inject custom browser HTML or JavaScript. `browserSourcesProvided` remains reserved for a future declarative route manifest and must stay empty in this preview.

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
