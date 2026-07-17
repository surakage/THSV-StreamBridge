# Viewer Progression package

Import `THSV-StreamBridge-Viewer-Progression-1.0.0.sb` only after Core Receiver `1.0.4` or newer. Add **Run Action Immediately** for `THSV StreamBridge - Viewer Progression` after the receiver. The action ignores unrelated events and exposes validated `viewerProgression*` arguments for creator-owned rewards, overlays, commands, and games.

The package does not award points, link accounts, run actions, write globals, or store viewer data. StreamBridge performs explicit identity resolution and local atomic progression updates first; this action is a projection-only trust boundary.

Do not use platform user IDs as cross-platform identities. Configure account links locally under `viewerIdentity.links`. Unlinked accounts receive stable platform-scoped pseudonyms. Simulated events do not award production points unless the creator explicitly opts in.
