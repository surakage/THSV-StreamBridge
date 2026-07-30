# Chat Guard

Chat Guard is a disabled-by-default public-chat safety add-on for Twitch, YouTube, Kick, and TikTok. Observe mode is the default; enforcement requires two separate creator approvals and can be narrowed by platform, signal, minimum matched signals, global rate, and per-viewer cooldown.

## Five-minute beginner setup

1. In the wizard, turn on **safe observation** and select the public-chat platforms you use.
2. Optionally add obvious blocked words or website hostnames. The supplied spam limits are suitable for a first test.
3. Save, restart StreamBridge, and import `THSV-StreamBridge-Chat-Guard-2.5.0.sb` into Streamer.bot. Do not attach platform chat triggers to its actions.
4. Paste a harmless sample into **Test safely before automatic actions**. Observation and testing cannot moderate anyone.
5. Stop here if reports are all you need. For automatic moderation, approve only **THSV Addon - Chat Guard - Moderate**, turn on both automatic-action switches, and start with **Warn**.

The import also creates a disabled `!guardtrust` command. Review it before enabling it. As the broadcaster or a moderator, reply to a viewer's message with `!guardtrust`, then refresh the wizard's trusted-viewer list. TikTok uses the manual stable-ID fallback for now.

An observation-only configuration is a valid finished setup. Delete, timeout, and ban modes are advanced options and should not be used until genuine live acceptance succeeds.

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

Use observe mode and the preview to tune false positives first. The wizard separates observation rules from the signals allowed to enforce, so caps or repeated-character observations do not need to trigger moderation.

The Streamer.bot package also imports a disabled `!guardtrust` command. After reviewing and enabling it, a broadcaster or moderator can reply to a viewer message with `!guardtrust`; Streamer.bot sends that provider's stable viewer ID to the local bridge. The wizard shows a friendly label plus a masked ID and supports deliberate removal. Manual stable-ID entry remains available for TikTok and provider contexts without reply identity.

Then import and approve **THSV Addon - Chat Guard - Moderate**, enable enforcement, select enforcement platforms and signals, and acknowledge the second creator-approval switch. Twitch supports delete/timeout/ban, YouTube supports timeout/ban, Kick supports delete/timeout/ban, and TikTok is limited to a source-routed warning. Live provider acceptance remains required before relying on any destructive mode.
