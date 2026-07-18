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
Multi-Timed Actions 1.1.0. The wizard requires explicit approval, reports action rename/missing
drift, and excludes the receiver and timed-action package itself to prevent recursion. Advanced
sub-action editing remains in Streamer.bot's native action editor.

## Testing and configuration

Use the wizard's Timed Actions page to stage changes. Commit creates a backup and applies the
validated configuration atomically; restart StreamBridge afterward. `Test saved` sends one
simulated execution through the normal receiver/package path while bypassing live gates. It does
not advance the schedule occurrence or consume a shuffle message.

PowerShell lifecycle controls remain available through `scripts/timed-actions.ps1`.
