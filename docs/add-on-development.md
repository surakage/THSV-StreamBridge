# V2 add-on development

Stage 9 makes optional modules installable without adding their implementation to core. Core imports only the public contracts and `FrameworkModule` shape. Installed add-ons live under `data/addons/<module-id>/`, are verified before loading, and are always optional: an add-on failure cannot make required core modules unready.

## Security boundary

An add-on is executable JavaScript with the same local permissions as StreamBridge. SHA-256 verification proves that installed files match `module-package.json`; it does **not** prove who authored them or that they are safe. Review the source and publisher, keep a backup, and use the required `--approve` flag only when you trust the package. StreamBridge rejects symbolic links, traversal paths, unlisted files, missing files, hash/size changes, incompatible core versions, runtime/descriptor manifest drift, and duplicate module IDs.

## Package layout

```text
my-addon/
  module-package.json
  dist/index.js
  schemas/config.json
```

`module-package.json` uses `packageFormat: "thsv-addon-v2"` and contains:

- the complete v2 module manifest;
- one safe relative JavaScript `entrypoint`;
- every shipped file with its exact byte size and lowercase SHA-256 hash.

The entrypoint exports either a default `FrameworkModule` object or an async `createModule()` function. Its manifest must exactly match the verified descriptor. Add-ons are loaded after the five required core modules, dependency order is resolved before startup, and lifecycle/event-handler errors are isolated and reported in module diagnostics.

Use only exports under `bridge/contracts/v2/` and the documented `FrameworkModule` lifecycle. Do not import core implementation files, read another module's storage, mutate creator-owned Streamer.bot objects, open network listeners implicitly, or place secrets in the descriptor. Declare all capabilities, subscriptions, owned storage, install/remove steps, migrations, actions, commands, browser sources, and health checks honestly.

`requiredCapabilities` is enforced against the supported capabilities of currently enabled input
platforms. If any required capability is unavailable, the add-on and add-ons depending on it are
rejected while core continues. Add-on-provided browser sources are reserved for a future hosting
contract; `browserSourcesProvided` must remain empty in this preview rather than claiming an
unserved route.

## Data migrations

Upgrade migrations execute only when replacing an already verified installation. A migration
declares one unambiguous forward step (`from`, `to`, and a packaged `.js` or `.mjs` script) and
exports either `migrate(context)` or a default function. The context contains `moduleId`,
`fromVersion`, `toVersion`, `packageRoot`, and the dedicated `storageRoot` at
`data/addons/.state/<module-id>/`. A migrating add-on must declare that exact directory in
`dataStorageOwned`.

StreamBridge snapshots the dedicated storage directory, runs each required step in order with a
30-second bound, and swaps the new code only after every migration succeeds. A failure restores
both the previous code and the storage snapshot. Migration code remains trusted add-on JavaScript
with the same local permissions as StreamBridge; rollback guarantees cover only the supplied
`storageRoot`, so a migration must not write elsewhere.

## Verify, install, and remove

From a source checkout:

```powershell
npm run addon:verify -- examples/addons/no-op
npm run addon:install -- examples/addons/no-op data/addons --approve
npm run addon:remove -- sample.no-op data/addons --approve
```

From an extracted release, use the compiled tool:

```powershell
node dist/tools/manage-addon.js verify examples/addons/no-op
node dist/tools/manage-addon.js install examples/addons/no-op data/addons --approve
node dist/tools/manage-addon.js remove sample.no-op data/addons --approve
```

Restart StreamBridge after installing, upgrading, or removing an add-on. Removal deletes only the installed code directory. Storage declared in `dataStorageOwned` remains preserved until the creator explicitly removes it.

## Reference package

`examples/addons/no-op/` is the canonical minimal package. It subscribes to a harmless event, performs no I/O or state mutation, and demonstrates the exact descriptor/runtime-manifest match. Copy its structure, choose a globally distinct dotted module ID, update every declared path, then recalculate sizes and SHA-256 values after the final build.

## Backup and recovery

`scripts/backup.ps1` includes configuration, local configuration, state, and installed add-on code in a hashed backup manifest. Restore only a reviewed backup:

```powershell
.\scripts\restore.ps1 -BackupPath 'data\backups\20260718-120000' -ApproveRestore
```

Restore verifies every file before mutation, stops the bridge, creates a safety backup, stages replacements, and rolls back the current configuration/state/add-ons if the swap fails.

Backup and restore cover THSV StreamBridge files only. They do not back up or recreate actions,
commands, triggers, or other objects stored inside Streamer.bot's own database; use Streamer.bot's
own export/backup tools for those objects.
