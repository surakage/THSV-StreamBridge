# Chat Guard

Chat Guard is a disabled-by-default, observe-only public-chat safety add-on for Twitch, YouTube, Kick, and TikTok.

- It consumes only normalized `chat.message` events through the existing StreamBridge connection.
- It never subscribes to private, operator, system, or command messages.
- This release cannot warn, delete, timeout, ban, run a Streamer.bot action, or mutate a provider account.
- Creator rules can flag literal terms, exact normalized blocked/unapproved domains, excessive links or caps, repeated characters, long messages, and repeated messages.
- Trusted roles and creator-entered stable `platform|user-id` accounts can be exempted without trusting display names.
- Creator-approved temporary link permits are limited by expiry and use count, store only a salted account hash, and bypass domain policy only—not caps, flooding, repeat, or length signals.
- Raw messages, names, avatars, and platform account IDs are never written to private state.
- Retained incidents contain only salted account/message hashes, time, platform, rule identifiers, and simulation status.
- Incident history, replay identities, and repeat observations are time-, count-, and byte-bounded.
- The authenticated wizard can show aggregate rule/platform counts and an explicit capability matrix, or clear all retained observations after confirmation. It never returns message text or viewer identity.
- The local rule tester evaluates creator-supplied sample text and repeat counts without writing the sample to state, returning it, or performing enforcement.
- Recent incident review exposes only incident ID, time, platform, rule IDs, simulation status, and review label. Creators can mark confirmed or false-positive results without recovering the message or viewer.

Use the preview to tune false positives. Warn/Delete/Timeout/Ban remain separate future work and must not be enabled until provider capability reporting, explicit creator approval, dry-run previews, abort thresholds, and per-user results are proven.
