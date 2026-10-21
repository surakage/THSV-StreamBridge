# September 23, 2026 cleanup validation

Scope: chat-emote reliability on the 4.0.11 source baseline. No event contracts, Streamer.bot actions, triggers, wizard configuration, or credentials are changed.

## Changes

- Correct protocol-relative 7TV image URLs so the CDN hostname is retained.
- Avoid the unsupported YouTube channel lookup on 7TV while retaining global emotes.
- Keep available global catalogs when channel requests fail.
- Apply a one-minute retry cooldown after total provider failure, retaining the last working catalog rather than retrying and logging on every chat message.
- Exclude local creator artwork and installation receipts under `output/` from Git and release-source notes.

## Validation

- 213 test files passed: 1,324 tests passed, three skipped.
- Type checking, focused ESLint, production build, and diff whitespace checks passed.
- Installed runtime read-only check before installation: healthy and ready, no blockers, 81/81 deliveries acknowledged, no queued or failed deliveries, all reported modules healthy.
- An earlier public command-directory fetch failure was followed by five normal `unchanged` sync results; it was not an active blocker.

Source validation and runtime health are different evidence. Installation details belong in a local receipt, not a public document containing creator paths or configuration. Live caption recognition, actual provider events, scene changes, and audible TTS are not re-certified by these checks.

## Data preservation

Preserve wizard configuration, secrets, action/trigger bindings, live state, logs, and recovery backups. Historical release notes remain historical; do not erase them or relabel old acceptance results as new tests. Personal emote artwork and provenance remain local under `output/emotes/`.
