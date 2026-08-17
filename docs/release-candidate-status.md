# Version 4 release and acceptance status

Snapshot: August 17, 2026. Release candidate: `4.0.0`.

| Area | Status |
| --- | --- |
| Source validation | Passed lint, type checking, production build, and configuration validation. |
| Automated tests | `170` files and `1,070` tests passed. |
| Browser validation | `45` tests passed across overlays, extensions, add-ons, responsive layouts, and universal import generation. |
| Streamer.bot packages | `41` reviewed packages regenerated and indexed at 4.0.0. |
| Windows release | Core ZIP and checksum built; 23 extension components bundled; exactly 11 optional add-on ZIPs and checksums published by the release workflow. |
| Local upgrade | Managed installation upgraded from 3.6.0 to 4.0.0; health and readiness passed; creator data and one rollback version were preserved. |
| Genuine providers | Tracked separately. High-impact paths still require the documented controlled live checks. |

## Version 4 package model

- **Main installation:** core, wizard, overlays, tray and launchers, three integrations, seven extension groups, and universal Streamer.bot import metadata.
- **Built-in extensions:** 23 independently failure-isolated components installed from the main archive, not separate public add-on downloads.
- **Optional add-ons:** 11 creator-selected packages published separately and listed in the signed release index.
- **Streamer.bot setup:** one wizard-generated import containing the framework plus the selected extensions, integrations, and enabled optional add-ons.

See [Production readiness](production-readiness.md), [Version 4 migration](version-4-migration.md), and the [complete setup guide](complete-setup-guide.md).
