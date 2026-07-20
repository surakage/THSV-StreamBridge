# Stage 7 completion

Stage 7 is implementation-complete on `overhaul/v2-preview` for `2.0.0-preview.1`.

## Delivered

- One normalized mapping for follow, subscription, membership, gift subscription, gift,
  donation, cheer, Super Chat, raid, and milestone alerts.
- Wizard-managed per-type enablement, platform scope, priority, duration, title/detail templates,
  local chime, volume, and gift-quantity aggregation.
- Existing bounded queue behavior with `critical` priority, priority preemption, per-alert
  durations, and malformed-card isolation.
- Server-rendered plain-text presentation fields. Templates accept only documented tokens,
  reject control characters and unknown placeholders, and remain bounded before reaching the
  browser.
- Queue-only aggregation for gift and gift-subscription quantities. Active cards are never
  mutated and non-gift financial events are never combined.
- An authenticated **Preview saved** action that generates a fresh stable event ID, forces
  simulated provenance, and never creates a real follow, subscription, raid, charge, or chat
  message.
- Stage 7 alert settings in the existing wizard lease, validation, backup, atomic commit,
  rollback, and safe import/export path.
- A `2.0.0-preview.1` browser-alert display schema with strict duration, sound, and optional
  aggregation bounds.

## Verification

- Current full automated suite after review hardening: 54 files and 309 tests passed.
- Typecheck, lint, and `git diff --check` pass cleanly.
- Configuration tests cover valid profiles, unknown template tokens, and the gift-only
  aggregation boundary.
- Projection tests cover template rendering, critical priority, duration, local chime metadata,
  disabled-type suppression, and platform-scoped suppression. Source review still enforces
  text-only DOM sinks.
- Browser queue regressions inject 200-alert gift storms to verify the capacity bound and queued
  quantity aggregation, and verify that a high-priority raid preempts a lower-priority card.
- Wizard transaction tests cover staged alert profiles, backed-up commit, and safe export.
- Test helpers now isolate timed-action state per test, removing a parallel-suite file collision
  exposed during the full Stage 7 run.

## Live local acceptance

- The rebuilt service reported `healthy` and the wizard unlocked successfully against the active
  local configuration.
- The Alerts page visibly exposed all ten alert types, global queue/duration controls, simulated
  visibility, templates, priority, sound, volume, and aggregation.
- A creator-equivalent gift profile with high priority, 6000 ms duration, local chime, and a
  3000 ms aggregation window passed the real wizard validation path. Its draft was cancelled;
  the wizard confirmed that no configuration changed.
- A wizard donation preview was accepted as simulated and rendered on the live Alerts browser
  source as `Preview Viewer · donation`, `5.00 USD · Simulated support`, and `TEST EVENT`.
- Diagnostics confirmed one loopback overlay client, successful publication, healthy core
  modules, and successful Streamer.bot delivery.

## Host compatibility boundary

The renderer remains standards-only HTML, CSS, JavaScript, HTTP, WebSocket, and SharedWorker
with direct-WebSocket fallback. Earlier project acceptance verified the same fixed browser-source
surfaces in Meld Studio and OBS Studio; Streamlabs compatibility remains based on its equivalent
Chromium browser source and is not represented as a separately witnessed Stage 7 run. Exact host
build numbers were not captured, so release-candidate compatibility should record them explicitly.
