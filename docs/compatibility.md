# Compatibility and platform matrix

This matrix records tested versions separately from recommended updates. A newer pre-release build does not become the complete live-verified baseline until its relevant package and live acceptance checks pass.

## Runtime and host applications

| Component | Verified or required version | Status |
|---|---|---|
| Windows | Windows 10 or later | Required for the supported installer and PowerShell lifecycle |
| Node.js | 22.22.2 or later | Required for source development; public packages bundle the tested runtime |
| Windows PowerShell | 5.1 or later | Required for release install, upgrade, verification, and uninstall |
| Streamer.bot | Minimum `1.0.5-alpha.31`; locally connected `1.0.5-beta.6` | Beta.6 is the current creator installation used for the Version 3 bridge connection and Custom Counter import. Earlier beta.2 evidence still contains the broadest directly recorded grouped-action, routing, and audible Voice Relay acceptance; a host upgrade does not convert pending provider rows into accepted evidence. |
| Speaker.bot | `0.1.7` | Live transport/dry-run verified; playback completion acknowledgement is unavailable |
| Meld Studio | `0.10.3.1` | Live Browser Source verification for Chat, Alerts, and Companion-compatible routes |
| OBS Studio | Exact accepted build was not recorded | Live standards-based Browser Source verification completed July 16, 2026 |
| Streamlabs Desktop | Exact build not separately tested | Compatibility accepted through the same Browser Source contract after OBS verification |

Do not infer a version range from one verified build. Existing packages keep their declared backward-compatible minimum; packages that require newer APIs declare a higher minimum individually. After upgrading, compile every installed THSV C# action, repeat relay tests, verify Action History fields, and then update the live-verification record. Re-importing unchanged `.sb` files is not required solely because Streamer.bot was upgraded.

See [Streamer.bot 1.0.5-beta.5 adoption](streamerbot-1.0.5-beta.5.md) for the cumulative change impact and focused acceptance checklist. The earlier [beta.2 record](streamerbot-1.0.5-beta.2.md) remains historical live evidence. The Version 3 local deployment records beta.6 connectivity and import success only; run the same focused provider checks before expanding that claim.

Streamer.bot 1.0.5 removes the deprecated legacy Twitch WebSocket `Message` object as chat completes its move to EventSub. THSV's native intake consumes the documented action arguments (`message`, IDs, user fields, badges, and flags) rather than that legacy object, so no compatibility shim is required.

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
