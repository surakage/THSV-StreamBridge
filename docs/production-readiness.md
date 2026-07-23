# Production-readiness gate

`2.4.0` is the stable release baseline. The bridge, every first-party add-on, and every Streamer.bot import share that visible version while the add-on/event API contract remains independently versioned. The automated, clean-machine, and visual gates below pass; the live-runtime items listed under "Remaining live verification" are still in progress. Publishing stable is a deliberate maintainer decision: the runtime independently blocks high-impact operations without verified provider-stable IDs, so the remaining verification limits which events can drive high-impact automation rather than the safety of installing the release.

## Automated gate

- Clean install of production dependencies
- Lint, typecheck, build, unit, integration, and browser tests pass
- Example and migrated configurations validate
- Streamer.bot imports reproducibly contain the reviewed C# sources
- Windows release ZIP, SHA-256 file, SBOM, and GitHub artifact attestation are produced
- No secret, control token, creator configuration, log, upload, or runtime state is included

## Clean-machine Windows gate

- Install from the self-contained ZIP without a preinstalled Node.js or npm
- Installer creates private runtime storage and a unique control token
- Start, replacement-start, custom-port stop, restart, upgrade, rollback, and uninstall pass
- Wizard, diagnostics, Chat, Alerts, and dock URLs open on loopback only
- Creator data survives a normal upgrade and default uninstall

## Streamer.bot runtime gate

- Every imported C# action compiles with the documented references
- Only platform intake actions receive platform triggers
- Core Receiver, Multi-Chat, Multi-Commands, Multi-Alerts, Multi-Timed Actions, Timed Message Output, administration actions, and wizard action remain triggerless
- Twitch, YouTube, and Kick chat plus stream-online/offline lifecycle triggers reach the bridge once
- Financial, gift, subscription, and reward events carry provider-stable IDs or remain blocked from high-impact automation
- Simulated events never send live chat or perform reward mutations
- Timed messages observe per-platform limits and shuffle without repeats

## Visual and load gate

- Chat and Alerts pass at 1920 x 1080 and cropped browser-source sizes
- Long names, Unicode, emoji, badges, missing avatars, compact mode, transparency, and reconnects remain crisp and bounded
- Alert storms and high-volume chat stay within configured queues and do not grow memory without a bound
- Slow Streamer.bot delivery demonstrates retry, restart replay, dead-letter handling, and no duplicate high-impact action

## Remaining live verification

- Twitch, YouTube, and Kick trigger field names and provider-stable identifiers have been captured and corrected against real Streamer.bot Action History argument dumps for most high-impact events (see the platform matrix in [integration assumptions](integration-assumptions.md)); Kick Mass Gift Subscription is the one exception, confirmed only against Streamer.bot's published variable reference because its live test trigger crashes Streamer.bot. None of the three has a genuine live-stream, real-viewer soak test yet.
- TikFinity does not document a stable event ID or trustworthy simulation marker; TikTok financial/progression use remains unsuitable.
- Kick reward mutations remain disabled because Streamer.bot does not document them.
- GitHub release publishing and attestations require an authenticated maintainer session.
- A paid Windows executable certificate is not used. Users verify the SHA-256 file and GitHub artifact attestation instead.

Do not describe unverified high-impact events as production-ready for financial, reward, or destructive automation until the remaining live-verification items above have dated evidence in the release notes.
