# Timed actions

Timed actions are session-relative bridge schedules. They are dormant until a normalized
`stream.online` event or authenticated operator start begins a session, and they stop after all
observed live platforms are offline. Pause/resume preserves the remaining interval.

## Scheduling

- **Fixed:** runs every configured number of minutes.
- **Random:** chooses an inclusive value between the configured minimum and maximum. The chosen
  next interval and due time are persisted before arming, so a restart does not reroll it.
- **Message rotation:** shuffle-container mode sends every creator-authored message once before
  starting another cycle. The pending choice is persisted before delivery.

## Gates

- Require at least one observed live platform.
- Require one of a selected set of platforms to be live.
- Require a minimum number of public chat messages within a bounded recent window.
- Require an allowed scene. Scene gates skip safely until a provider emits
  `stream.scene-changed` with a plain-text `sceneName` payload.

No chat text, viewer identity, or long-term activity history is stored for these gates.

## Execution providers

`event-only` publishes the normalized timer event without running another action.

`run-existing-action` invokes one creator-selected Streamer.bot action by stable ID through
Multi-Timed Actions 1.2.0. The wizard requires explicit approval, reports action rename/missing
drift, and excludes the receiver and timed-action package itself to prevent recursion. Advanced
sub-action editing remains in Streamer.bot's native action editor.

For cross-platform timed chat, import **Timed Message Output 1.0.0**, select
`THSV StreamBridge - Send Timed Message`, and use the wizard's Twitch, YouTube, Kick, and TikTok
delivery switches. One occurrence selects one message and makes one Streamer.bot dispatch; that
action fans the message out to every selected platform. Twitch, YouTube, and Kick use native
Streamer.bot chat APIs. TikTok uses TikFinity's `sendChatbotMessage` WebSocket action and requires
**Allow Streamer.bot to push messages to TikFinity** in TikFinity chatbot settings. Live-platform
gates and delivery-platform switches are intentionally separate.

Timed Message Output is the only THSV StreamBridge package that automatically posts messages to
live channel chat. Enable only the delivery platforms where the configured messages should appear
publicly. Wizard test executions are simulated and cannot send externally.

## Testing and configuration

Use the wizard's Timed Actions page to stage changes. Commit creates a backup and applies the
validated configuration atomically; restart StreamBridge afterward. `Test saved` sends one
simulated execution through the normal receiver/package path while bypassing live gates. It does
not advance the schedule occurrence, consume a shuffle message, or post to platform chat.

PowerShell lifecycle controls remain available through `scripts/timed-actions.ps1`.
