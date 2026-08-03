# Production-readiness gate

`3.5.0` passed the repository, browser, package-integrity, dependency-audit, and local-upgrade gates on August 2, 2026. The release contains thirty-four first-party add-ons and thirty-eight generated Streamer.bot imports on the same visible version. The normalized event and add-on API contract remains independently versioned at `2.0.0-preview.1` by design.

Version 3 is safe for installation and controlled live-stream testing. It is not evidence that every genuine provider event or provider mutation has been accepted. High-impact financial, reward, raid, moderation, Discord, outbound-chat, voice, and scene-changing paths remain limited by the dated provider evidence in the [acceptance ledger](add-on-acceptance-ledger.md).

## Automated gate

- Typecheck, lint, production build, and configuration validation pass.
- The complete Vitest suite passes: `148` files and `859` tests.
- The complete Playwright suite passes: `18` browser tests.
- Both production-only and full dependency audits report zero known vulnerabilities.
- All thirty-eight Streamer.bot exports are deterministically generated from the reviewed manifests and C# sources.
- The Windows release archive, thirty-four add-on bundles, add-on index, checksums, and extracted release manifest verify with zero mismatches.
- The release archive contains `2,275` manifest-tracked files and no creator token, configuration, log, upload, backup, or private runtime state.

## Local Windows upgrade gate

- The previous `3.0.0` creator installation was preserved as the rollback version before replacement.
- The Version 3 installer preserved creator data, settings, private add-on state, enabled flags, action grants, secrets, and the previous application version for rollback.
- The installed manifest reports active version `3.5.0`, previous version `3.0.0`, and bundled Node.js `22.23.1`.
- All `34` first-party add-ons are installed, enabled, integrity-verified, and version-aligned at `3.5.0`.
- After restart, `/health` reports `healthy`, `/ready` reports `ready`, Streamer.bot is connected, all `39` loaded modules report healthy, and the current startup log contains no warning or error.
- All `20` enabled add-on browser-source routes return HTTP 200, alongside the combined, chat, and alerts overlay routes.
- The wizard's live Streamer.bot inspection found every one of the `23` recommended helper actions; exact stable-ID grants were saved for the `18` add-ons that require them.
- The new triggerless **THSV Addon - Custom Counter** Streamer.bot package imported successfully and created its eleven reviewed creator controls. Existing packages were not blindly overwritten, because re-importing intake actions can replace creator trigger bindings; Version 3 import files are installed locally for intentional, package-by-package upgrades.

## Remaining live verification

- Run genuine Twitch and Kick chat, follow, subscription, gift, raid, Bits/Kicks, reward, and stream-lifecycle events and record their actual Action History arguments.
- Confirm Twitch reward fulfillment/refund paths and Kick's documented non-parity. Kick reward creation, editing, enablement, fulfillment, and refund are not claimed.
- Confirm financial-provider stable IDs before enabling any money-driven mutation.
- Confirm real Discord channel/forum delivery, outbound chat, Speaker.bot playback, scene changes, and media playback in the creator's chosen host.
- Confirm reconnect, restart persistence, coordination queueing, independent Custom Counter/Subathon behavior, and emergency coordination reset during a controlled live test.
- TikFinity does not provide the same trustworthy stable-event and simulation guarantees as the native Streamer.bot providers; TikTok financial or progression mutations remain conservative.

Use [Version 3 live testing](live-test-checklist.md) for the first controlled stream. Do not describe a Streamer.bot Test trigger or a fixture as genuine provider acceptance.
