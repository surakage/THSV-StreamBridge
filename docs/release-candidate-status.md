# Version 3 release and acceptance status

Snapshot: August 1, 2026. Release: `3.0.0`.

Version 3 is package-complete and locally installed. **Packaged**, **offline accepted**, and **genuine-provider accepted** remain deliberately separate states. Per-add-on evidence is recorded in the [acceptance ledger](add-on-acceptance-ledger.md), and the first controlled stream procedure is in the [live-test checklist](live-test-checklist.md).

## Completed release gates

| Area | Confirmed state |
| --- | --- |
| Bridge core | Durable normalized intake, one Streamer.bot connection, authenticated loopback wizard, browser overlays, safe lifecycle/recovery, and centralized add-on coordination. |
| Coordination | Exclusive, queueable, independent, background, priority, cooldown, cancellation, timeout recovery, bounded queueing, diagnostics, and creator-confirmed emergency reset. |
| Custom Counter | Up to twenty persistent counters; role-gated chat and creator controls; optional event deltas; safe atomic persistence; lightweight customizable overlay. |
| Reward catalogue | One creator-facing catalogue documents stable IDs, costs, colors, text requirements, cooldowns, usage limits, settlement, coordination, and honest platform support. |
| Automated validation | Typecheck, lint, build, configuration validation, `146` Vitest files / `825` tests, `17` Playwright tests, and zero known npm vulnerabilities. |
| Windows packages | Main Version 3 ZIP, thirty-four separate add-on ZIPs, add-on index, thirty-eight checksums, and the `2,259`-file extracted manifest verify with zero mismatches. |
| Streamer.bot packages | Thirty-seven Version 3 imports generated from reviewed manifests/sources. Custom Counter imported locally as a new triggerless eleven-action group. Existing trigger-bearing actions are upgraded intentionally so creator trigger bindings are not silently replaced. |
| Local installation | Active `3.0.0`, previous `2.6.1`, all `34` add-ons installed at Version 3, `33` enabled as previously configured, all `38` loaded modules healthy, and Streamer.bot connected. |
| Documentation | README, setup, migration, reward, counter, troubleshooting, rollback, release verification, release notes, and live-test guidance are included. |

## Still requires genuine live evidence

1. Twitch and Kick provider events, including rewards and reconnect behavior.
2. Stable identities for high-impact financial and reward events.
3. Real Discord, outbound-chat, Speaker.bot, scene-change, media-playback, and moderation side effects.
4. A controlled simultaneous-addon coordination test, including timeout recovery and emergency reset.
5. Persistence across a real Streamer.bot restart and computer restart.

These items do not invalidate the automated or local-install gates, but they must remain pending in public claims until witnessed. A fixture or Streamer.bot Test trigger proves routing only.
