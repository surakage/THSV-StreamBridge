# Compatibility and platform matrix

This matrix records supported versions separately from locally recorded acceptance evidence. A host upgrade does not become a complete live-verified baseline until its relevant package and provider checks pass.

## Runtime and host applications

| Component | Verified or required version | Status |
|---|---|---|
| Windows | Windows 10 or later | Required for the supported installer and PowerShell lifecycle |
| Node.js | 22.22.2 or later | Required for source development; public packages bundle the tested runtime |
| Windows PowerShell | 5.1 or later | Required for release install, upgrade, verification, and uninstall |
| Streamer.bot | Minimum and recommended `1.0.7` stable; exact `1.1.0-alpha.3`, `1.1.0-alpha.4`, and `1.1.0-alpha.5` schemas also accepted on the creator host | All regenerated THSV package manifests retain stable 1.0.7 as their installation floor. Automated trigger repair is write-enabled only for the exact 1.0.7 or sanitized local 1.1.0-alpha.3/alpha.4/alpha.5 actions schemas; every later alpha or version remains inspection-only until separately captured. Source and automated compatibility checks cover the EventSub chat migration and keep the relay isolated from raw provider WebSocket payloads; repeat the focused live matrix before recording provider acceptance for an alpha host. |
| Speaker.bot | `0.1.7` | Live transport/dry-run verified; playback completion acknowledgement is unavailable |
| Meld Studio | `0.10.3.1` | Live Browser Source verification for Chat, Alerts, and Companion-compatible routes |
| OBS Studio | Exact accepted build was not recorded | Live standards-based Browser Source verification completed July 16, 2026 |
| Streamlabs Desktop | Exact build not separately tested | Compatibility accepted through the same Browser Source contract after OBS verification |

Do not infer a future version range from verified alpha builds. Current packages use stable 1.0.7 as their common installation floor, while the rollback-protected trigger reconciler recognizes only exact tested registries. The 1.1.0-alpha.3 registry came from a sanitized capture of the creator host's three THSV intake actions and all 29 managed trigger records; the installed alpha.4 database was then compared read-only and matched that exact schema. For alpha.5, the creator host's imported database was compared read-only against the pre-import alpha.4 backup: top-level keys, action-object keys, managed action IDs, enabled states, and trigger-record shape matched, and the 29 preserved trigger types matched the registry exactly. Alpha.6 and future builds fail closed. After upgrading Streamer.bot, compile every installed THSV C# action, repeat relay tests, verify Action History fields, validate the saved actions schema, and then update the live-verification record. Re-import the current versioned packages when replacing an older baseline export.

StreamBridge can also consume the bounded `THSV-StreamBridge-StreamerBot-Compatibility.json` data asset from a dedicated `streamerbot-compat-*` GitHub release. The client accepts that feed only after Sigstore verification proves tagged GitHub Actions provenance from this repository's dedicated compatibility workflow. Feed entries can add an exact version alias only to a registry already embedded or previously verified; malformed, unattested, oversized, unknown-base, or unavailable feeds fail closed and leave the embedded registries active. This permits a separately reviewed compatibility-data release without shipping a new Bridge binary.

The Wizard reports the official feed source and last check, plus the verified tag and SHA-256 digest when available. When remote verification is unavailable, it clearly labels the embedded exact registry that remains active.

See [Streamer.bot 1.1.0 alpha.5 compatibility](streamerbot-1.1.0-alpha.5.md) for the exact-version evidence and remaining live acceptance boundary, and [Streamer.bot 1.0.7 stable adoption](streamerbot-1.0.7-stable.md) for the recommended stable baseline. The [1.0.6](streamerbot-1.0.6-stable.md), [1.0.5 stable](streamerbot-1.0.5-stable.md), [beta.5](streamerbot-1.0.5-beta.5.md), and [beta.2](streamerbot-1.0.5-beta.2.md) records remain historical evidence rather than current install guidance.

Streamer.bot 1.0.5 removed the deprecated legacy Twitch WebSocket `Message` object as chat completed its move to EventSub. THSV's native intake consumes bounded flat action arguments (`message`, IDs, user fields, badges, and flags) rather than that legacy object or raw provider WebSocket envelopes. This also limits exposure to the provider-payload changes documented for 1.1.0 alpha, but genuine Twitch events must still be repeated before claiming live provider acceptance.

Meld Studio is distributed as an MSIX/UWP app, which Windows sandboxes with loopback isolation by default; this blocks access to the local overlay and wizard URLs until an exemption is granted once per machine. See [Troubleshooting](troubleshooting.md#meld-studio-cannot-reach-the-overlay-or-wizard) for the fix. The same restriction can affect other MSIX-packaged broadcasting apps.

## Platform transports

| Platform | Intake path | Production claim |
|---|---|---|
| Twitch | Streamer.bot native trigger relay | Supported through the included relay package; no direct API adapter |
| YouTube | Streamer.bot native trigger relay | Supported through the included relay package; no direct API adapter |
| Kick | Streamer.bot native trigger relay | Supported through the included relay package; no direct API adapter |
| TikTok | TikFinity to Streamer.bot relay | Framework routing supported; stable source identity and simulator provenance remain unverified, so rewards/statistics default conservative |
| Facebook | None | Not supported and not included in the schema, fixtures, package groups, or release claims |

## Optional modules

The Node bridge is distributed as one modular service. Streamer.bot integration is also modular: Core Receiver is required for bridge delivery; Multi-Chat, Multi-Commands, Multi-Alerts, Multi-Timed Actions, native platform intake, and TikFinity intake are separate packages creators import only when needed. Speaker Orchestration, Viewer Progression, and Bloom Companion are archived future add-on candidates and are not shipped or loaded by Stage 2 core.
