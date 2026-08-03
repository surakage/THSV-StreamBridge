# Version 3 release and acceptance status

Snapshot: August 2, 2026. Published release: `3.5.0`.

Version 3 is package-complete and locally installed. **Packaged**, **offline accepted**, and **genuine-provider accepted** remain deliberately separate states. Per-add-on evidence is recorded in the [acceptance ledger](add-on-acceptance-ledger.md), and the first controlled stream procedure is in the [live-test checklist](live-test-checklist.md).

## Completed release gates

| Area | Confirmed state |
| --- | --- |
| Bridge core | Durable normalized intake, one Streamer.bot connection, authenticated loopback wizard, browser overlays, safe lifecycle/recovery, and centralized add-on coordination. |
| Coordination | Exclusive, queueable, independent, background, priority, cooldown, cancellation, timeout recovery, bounded queueing, diagnostics, and creator-confirmed emergency reset. |
| Custom Counter | Up to twenty persistent counters; role-gated chat and creator controls; optional event deltas; safe atomic persistence; lightweight customizable overlay. |
| Reward catalogue | One creator-facing catalogue documents stable IDs, costs, colors, text requirements, cooldowns, usage limits, settlement, coordination, and honest platform support. |
| Automated validation | Published Version 3 gates passed. The release tree passes typecheck, lint, build, `148` Vitest files / `859` tests, `18` Playwright tests, and zero known npm vulnerabilities. |
| Windows packages | Main Version 3 ZIP, thirty-four separate add-on ZIPs, add-on index, thirty-six matching checksums, and the `2,275`-file extracted manifest verify with zero mismatches. |
| Streamer.bot packages | Thirty-eight Version 3 imports generated from reviewed manifests/sources. Custom Counter imported locally as a new triggerless eleven-action group. Existing trigger-bearing actions are upgraded intentionally so creator trigger bindings are not silently replaced. |
| Local installation | Active `3.5.0`, previous `3.0.0`, all `34` add-ons installed and enabled at Version 3, all `39` loaded modules healthy, all `20` add-on overlay routes available, all `23` recommended helper actions found and granted by exact stable ID, and Streamer.bot connected. |
| Documentation | README, setup, migration, reward, counter, troubleshooting, rollback, release verification, release notes, and live-test guidance are included. |

## Included in the 3.5.0 release

- Chat Play Pack now bundles its own eleven-command Streamer.bot import, twenty editable Trivia fallbacks, twenty editable Unscramble fallbacks, and optional bounded dictionary-backed word batches.
- The viewer command directory now has a local preview, JSON catalogue, standalone export, and opt-in authenticated SlothBloom publishing. The hosted page receives only public command metadata and does not connect back to a creator's bridge.
- These changes pass the automated gates above and are included in the packaged `3.5.0` archive.

## Still requires genuine live evidence

1. Twitch and Kick provider events, including rewards and reconnect behavior.
2. Stable identities for high-impact financial and reward events.
3. Real Discord, outbound-chat, Speaker.bot, scene-change, media-playback, and moderation side effects.
4. A controlled simultaneous-addon coordination test, including timeout recovery and emergency reset.
5. Persistence across a real Streamer.bot restart and computer restart.

These items do not invalidate the automated or local-install gates, but they must remain pending in public claims until witnessed. A fixture or Streamer.bot Test trigger proves routing only.
