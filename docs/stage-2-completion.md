# Stage 2 completion

Stage 2A, 2B, and 2C are complete on `overhaul/v2-preview` for `2.0.0-preview.1`. Stable `main` and its `1.x` release line remain unchanged.

## 2A — Contract and compatibility boundary

- Published strict v2 preview contracts for events, projections, capabilities, module manifests, configuration extensions, health, rewards, and browser overlays.
- Added a core-only v2 configuration schema.
- Added a non-writing migration preview that validates a v1 configuration, produces a separate v2 candidate, enumerates archived configuration and state paths, and retains Bloom-named commands for explicit creator review.

## 2B — Excluded runtime extraction

- Archived Viewer Progression, Bloom Companion, and Speaker.bot source, packages, scripts, tests, documentation, and assets under `archive/future-add-ons/`.
- Removed their startup dependencies, HTTP endpoints, configuration fields, normalized-event branches, browser-overlay surface, and Streamer.bot receiver/command identity arguments from core.
- Kept legacy config loadable by ignoring archived keys without reactivation. Preserved legacy state through complete-data backup, upgrade, and default uninstall behavior.
- Emits an operator-visible structured startup warning listing any archived configuration paths that were ignored, so upgrades do not silently hide a previously enabled feature.
- Rebuilt the Core Receiver and Multi-Commands imports as `2.0.0-preview.1`.

## 2C — Module host

- Added manifest validation, duplicate/missing/cycle rejection, dependency-ordered startup, reverse shutdown, event subscriptions, required-module readiness, optional-module failure isolation, and per-module health.
- Registered Chat, Commands, Alerts, and Timed Actions as required built-in projection modules.
- Added acceptance tests for dependency ordering, optional startup and event failures, required failure readiness, cycles, missing dependencies, duplicate IDs, legacy config compatibility, archived route removal, and core-only browser surfaces.

## Safety evidence

- A pre-overhaul checkpoint tag and a pre-Stage-2B data backup were created before extraction.
- Archived source is not included in core release staging.
- Release archives still exclude runtime state and secrets; installers preserve the existing complete `data` directory before swapping versions.
- Core starts with no optional add-ons installed. Archived add-on failure cannot affect platform intake because archived code is never loaded.
