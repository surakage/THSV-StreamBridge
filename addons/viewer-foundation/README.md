# Viewer Foundation

Viewer Foundation is the built-in identity and progression authority for THSV StreamBridge community features. It ships and updates with the Bridge, while retaining an isolated module identity, private state boundary, and capability-broker contract.

- Stable platform IDs are salted before pseudonymous viewer IDs are persisted.
- Cross-platform accounts are linked only through explicit creator-authored rules.
- Display names, avatars, messages, OAuth data, and financial amounts are not retained.
- The creator names the currency and configures chat, consistency, observed active/lurk time, and supported event awards.
- Fixed awards are replay protected and serialized before atomic private-state writes; simulated events are excluded by default.
- Viewers can use a source-routed balance command without exposing another viewer's record.
- State and replay collections have hard caps and time-based pruning.
- Five optional point-milestone achievements are derived from the existing points projection. They do not create a second identity store and disappear when achievements are disabled.

Account-link syntax is `viewer-id|platform|stable-user-id`, for example `alex|twitch|123456`. A display name is not a stable user ID and must never be used for linking.

The broker exposes only a versioned projection and idempotent, audited point mutations to add-ons that request the exact viewer permission and declare Viewer Foundation as a dependency. It never exposes the salt, link table, or backing state.

Creator-approved deletion also emits one broker-local notice containing only the deleted pseudonymous Viewer Foundation ID. Dependent add-ons use it to remove their own caches and projections immediately; the notice never contains a platform ID, name, avatar, or chat content.

The authenticated local wizard provides live private-state status, search by Viewer Foundation ID or stable platform ID, guided verified account linking, recent audit review, bounded privacy export, audited point corrections, safe correction undo, and creator-confirmed viewer deletion. These operations share the provider's serialized state queue with ordinary awards, preventing lost updates. Link history stores only a short SHA-256 fingerprint of the platform account ID; the raw ID remains only in creator-private settings. Link changes require a StreamBridge restart. No administration operation is exposed as a public chat command.

Correction undo is intentionally conservative. Copy the correction audit ID from the result or recent history; undo succeeds only while the current balance still equals that correction's recorded result. Any later award, spend, refund, or correction makes the old undo fail rather than overwrite newer activity.

Achievements are intentionally deterministic: First Steps (100), Village Regular (500), Community Supporter (1,000), Village Veteran (2,500), and Village Legend (5,000). Changing point-award settings does not rewrite prior event history; the unlocked list is recalculated from the viewer's current total.

Silent viewer presence cannot be verified consistently across Twitch, YouTube, Kick, and TikTok. Active-time awards therefore settle only when a viewer continues chatting inside the configured activity window. Lurk time begins with the configured normalized lurk command and settles on the viewer's next message or after the final observed platform goes offline. Catch-up awards are capped per event.

The wizard can preview the legacy `data/state/viewer-progression.json` file and show its exact bounded records before import. Applying the migration requires an explicit confirmation plus the preview's SHA-256 digest; a changed file is rejected, replaying the same digest is ignored, and existing viewers keep the higher point total. The legacy file is never deleted automatically.
