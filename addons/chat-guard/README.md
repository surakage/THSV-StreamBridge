# Chat Guard

Chat Guard is a disabled-by-default public-chat safety add-on for Twitch, YouTube, Kick, and TikTok. Observe mode is the default; enforcement requires two separate creator approvals.

- It consumes only normalized `chat.message` events through the existing StreamBridge connection.
- It never subscribes to private, operator, system, or command messages.
- Optional warn, delete, timeout, and ban modes are capability-gated per provider, rate-capped, and dispatched through one approved triggerless Streamer.bot action. Simulations never enforce.
- Creator rules can flag literal terms, exact normalized blocked/unapproved domains, excessive links or caps, repeated characters, long messages, and repeated messages.
- Trusted roles and creator-entered stable `platform|user-id` accounts can be exempted without trusting display names.
- Creator-approved temporary link permits are limited by expiry and use count, store only a salted account hash, and bypass domain policy only—not caps, flooding, repeat, or length signals.
- Raw messages, names, avatars, and platform account IDs are never written to private state.
- Retained incidents contain only salted account/message hashes, time, platform, rule identifiers, and simulation status.
- Incident history, replay identities, and repeat observations are time-, count-, and byte-bounded.
- The authenticated wizard can show aggregate rule/platform counts and an explicit capability matrix, or clear all retained observations after confirmation. It never returns message text or viewer identity.
- The local rule tester evaluates creator-supplied sample text and repeat counts without writing the sample to state, returning it, or performing enforcement.
- Recent incident review exposes only incident ID, time, platform, rule IDs, simulation status, and review label. Creators can mark confirmed or false-positive results without recovering the message or viewer.

Use observe mode and the preview to tune false positives first. Then import and approve **THSV Addon - Chat Guard - Moderate**, enable enforcement, and acknowledge the second creator-approval switch. Twitch supports delete/timeout/ban, YouTube supports timeout/ban, Kick supports delete/timeout/ban, and TikTok is limited to a source-routed warning. Live provider acceptance remains required before relying on any destructive mode.
