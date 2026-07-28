# Viewer Foundation

Viewer Foundation is the optional identity and progression authority for future THSV community features. It is deliberately not part of Bridge Core.

- Stable platform IDs are salted before pseudonymous viewer IDs are persisted.
- Cross-platform accounts are linked only through explicit creator-authored rules.
- Display names, avatars, messages, OAuth data, and financial amounts are not retained.
- Fixed point awards are replay protected and serialized before atomic private-state writes.
- Chat awards have a per-viewer cooldown; simulated events are excluded by default.
- State and replay collections have hard caps and time-based pruning.
- Five optional point-milestone achievements are derived from the existing points projection. They do not create a second identity store and disappear when achievements are disabled.

Account-link syntax is `viewer-id|platform|stable-user-id`, for example `alex|twitch|123456`. A display name is not a stable user ID and must never be used for linking.

The broker exposes only a versioned projection and idempotent, audited point mutations to add-ons that request the exact viewer permission and declare Viewer Foundation as a dependency. It never exposes the salt, link table, or backing state.

Creator-approved deletion also emits one broker-local notice containing only the deleted pseudonymous Viewer Foundation ID. Dependent add-ons use it to remove their own caches and projections immediately; the notice never contains a platform ID, name, avatar, or chat content.

The authenticated local wizard provides live private-state status, bounded privacy export, audited point corrections, and creator-confirmed viewer deletion. These operations share the provider's serialized state queue with ordinary awards, preventing lost updates. Account links remain explicit creator settings; remove the link, save, and restart before deleting a linked viewer when the stable-ID link must be erased too. No administration operation is exposed as a public chat command.

Achievements are intentionally deterministic: First Steps (100), Village Regular (500), Community Supporter (1,000), Village Veteran (2,500), and Village Legend (5,000). Changing point-award settings does not rewrite prior event history; the unlocked list is recalculated from the viewer's current total.

The wizard can preview the legacy `data/state/viewer-progression.json` file and show its exact bounded records before import. Applying the migration requires an explicit confirmation plus the preview's SHA-256 digest; a changed file is rejected, replaying the same digest is ignored, and existing viewers keep the higher point total. The legacy file is never deleted automatically.
