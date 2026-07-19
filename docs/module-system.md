# Module system

The Stage 2 module manifest is defined by `bridge/contracts/v2/module-manifest.ts`. Every built-in or optional module declares identity, version compatibility, dependencies, required platform capabilities, configuration schema, event subscriptions, provided commands/actions/browser sources, owned storage, installation/uninstallation steps, migrations, and health checks.

## Dependency rule

The core host may import only core contracts and module interfaces. Built-in and optional modules may import versioned public core contracts. The core host must never import an optional module implementation.

Module IDs are stable namespaced identifiers. A module cannot depend on itself. Storage ownership must be explicit so backup, removal, and diagnostics can avoid unrelated creator data.

## Runtime lifecycle

`ModuleRegistry` validates manifests before startup, rejects duplicate IDs, missing dependencies, self-dependencies, and dependency cycles, and starts modules in dependency order. It stops them in reverse order and publishes only subscribed event types. A module startup or event-handler failure is isolated and appears in module health; an optional failure does not block core readiness, while a required built-in failure does.

The verified add-on loader—not add-on code—assigns each executable module's capability grant. The registry passes one frozen context through startup, subscribed events, and shutdown, then cancels broker-owned timers and pending action requests if that module stops or fails. See [Add-on capabilities](add-on-capabilities.md).

The built-in Chat, Commands, Alerts, and Timed Actions projections are registered through this host. Dynamic execution of arbitrary paths from untrusted configuration is not allowed. Files under `archive/` are inert and never discovered or loaded.

Archived Viewer Progression, Bloom Companion, and Speaker.bot code is not a module merely because it is moved under `archive/`. Each requires a valid manifest, contract migration, isolated storage, tests, and explicit creator installation before it can return as an add-on.
