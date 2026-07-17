# Module system preview

The Stage 2A module manifest is defined by `bridge/contracts/v2/module-manifest.ts`. Every built-in or optional module declares identity, version compatibility, dependencies, required platform capabilities, configuration schema, event subscriptions, provided commands/actions/browser sources, owned storage, installation/uninstallation steps, migrations, and health checks.

## Dependency rule

The core host may import only core contracts and module interfaces. Built-in and optional modules may import versioned public core contracts. The core host must never import an optional module implementation.

Module IDs are stable namespaced identifiers. A module cannot depend on itself. Storage ownership must be explicit so backup, removal, and diagnostics can avoid unrelated creator data.

## Lifecycle target

Stage 2C will add discovery from trusted installed manifests, dependency ordering, isolated start/stop, health aggregation, event subscription, configuration extension registration, and failure isolation. Dynamic execution of arbitrary paths from untrusted configuration is not allowed.

Archived Viewer Progression, Bloom Companion, and Speaker.bot code is not a module merely because it is moved under `archive/`. Each requires a valid manifest, contract migration, isolated storage, tests, and explicit creator installation before it can return as an add-on.

