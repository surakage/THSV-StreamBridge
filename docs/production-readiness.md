# Version 4 production readiness

Snapshot: August 17, 2026. Release baseline: `4.0.0`.

Version 4 is package-complete and has passed its automated, browser, Windows release-package, and local-upgrade gates. This proves repository and installation cohesion; it does not replace creator-specific acceptance for genuine provider events or high-impact mutations.

## Verified release gates

- ESLint, TypeScript type checking, production build, and configuration validation pass.
- All `170` Vitest files and `1,070` tests pass.
- All `45` Playwright browser tests pass, including responsive wizard navigation, extension isolation, overlay bounds, media playback behavior, add-on installation, and the one-import workflow.
- All `41` Streamer.bot packages were regenerated from reviewed source and indexed at `4.0.0` with size and SHA-256 metadata.
- The Windows packager produced one verified core archive, `23` bundled extension components, and exactly `11` optional add-on ZIPs plus checksums and the bounded update index.
- Inspection of the final ZIP found no retired future prototypes, legacy versioned import folders, or old generated release packages.
- The public installer upgraded the local managed installation from `3.6.0` to `4.0.0`, preserved creator data, retained one rollback version, and passed its startup health check.
- The installed service reports `healthy` and `ready`; Twitch, YouTube, Kick, TikTok, timers, add-on hosting, scenes, Streamlabs intake, and Streamer.bot delivery report connected with zero queued, failed, or dead-lettered deliveries at verification time.

## What still requires creator acceptance

Genuine financial, reward, raid, moderation, Discord, outbound-chat, voice, and scene-changing operations require the controlled checks in the [acceptance ledger](add-on-acceptance-ledger.md) and [first-live checklist](live-test-checklist.md). A simulator event or Streamer.bot Test trigger is offline evidence, not provider acceptance.

High-impact operations remain permission-gated and fail closed when required stable IDs, provider capabilities, live state, action approval, or delivery acknowledgement are missing.

## Release boundary

Most creators install only `THSV-StreamBridge-4.0.0.zip`. Built-in extensions and integrations come with that archive. Only packages listed in the current `THSV-StreamBridge-AddOns-index.json` are optional downloads. Historical release assets are not installation guidance for Version 4.
