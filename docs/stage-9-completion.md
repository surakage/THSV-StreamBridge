# Stage 9 completion — Packaging and add-on API

Status: implementation-complete and ready for independent review. No commit or push has been made for this stage.

## Acceptance evidence

- Release install, upgrade, downgrade protection, creator-data preservation, uninstall, tamper rejection, and rollback coverage remain green.
- Backups now contain configuration, local configuration, state, and installed add-on code plus a complete SHA-256 manifest.
- Restore verifies every declared file before mutation, requires `-ApproveRestore`, stops the bridge, creates a safety backup, stages replacements, and restores the pre-restore content if the swap fails.
- `thsv-addon-v2` descriptors validate safe relative paths, a complete unique file list, exact sizes/hashes, JavaScript entrypoint inclusion, configuration/migration file inclusion, and core-version compatibility.
- Add-on installation and removal require explicit creator approval. Installation uses stage/rollback directories; removal deletes only the installed code directory and preserves separately owned data.
- Runtime discovery rejects corrupted packages, unlisted files, manifest drift, core-ID conflicts, duplicate IDs, missing dependencies, and cycles without preventing required core modules from loading.
- Optional add-on startup, shutdown, and event handlers are time-bounded. Failures appear as isolated module failures and do not make core readiness fail.
- `examples/addons/no-op/` verifies, installs, loads, and removes through the compiled release tool.
- Public authoring, security-boundary, verification, install/remove, restart, and recovery guidance is published in `docs/add-on-development.md`.

## Validation run

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — 53 files / 302 tests passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Compiled command smoke test — `verify → install → remove` passed for `sample.no-op` in an isolated temporary add-on root.

## Deliberate security limits

Package hashes provide integrity, not author identity. Add-ons execute JavaScript with StreamBridge's local permissions and are not sandboxed. The installer therefore requires explicit creator approval and the documentation tells creators to review source and publisher trust before installation. A future signing or publisher-trust service can extend this contract without weakening the current fail-closed file verification.

## Stage gate

Stage 9 meets the ordered overhaul acceptance scope: clean installer/upgrade/backup/restore, verified module packages, a sample no-op add-on, failure isolation, install/remove tests, and public developer documentation. It is ready to mark complete after review.
