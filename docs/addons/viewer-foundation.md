# Viewer Foundation setup

**Module:** `thsv.viewer-foundation`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Provides one named, configurable, privacy-conscious cross-platform points balance for chat consistency, observed active/lurk time, supported events, and dependent community add-ons.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Viewer-Foundation-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Viewer-Foundation-2.5.2.thsv-addon` and review its permissions.
3. No separate add-on Streamer.bot import is required.
4. Return to the wizard, name the currency, configure awards, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install Viewer Foundation in the wizard and review its private-state permission.
2. Choose a currency name, such as Village Points, Acorns, or Stars.
3. Configure ordinary chat, consistency, observed active time, explicit lurk time, and event awards.
4. Optionally add explicit account links using `viewer-id|platform|stable-user-id`. Never link accounts by display name.

## Streamer.bot

Existing THSV platform intake actions supply normalized chat and community events. Do not attach duplicate triggers.

In **Command Sync**, apply **Viewer points balance**, generate and import the package, then enable `!points`. Keep the existing `!lurk` command if lurk-time awards are enabled. Viewer Foundation observes that normalized command without requiring another action or trigger.

## What viewers see

Viewer Foundation has no browser source. The optional `!points` command replies only in the viewer's source chat with the configured currency balance and level. Add Viewer Spotlight later if you want a visual viewer card or leaderboard.

## Offline test

1. Name the currency `Test Leaves`, set chat cooldown to zero, and choose small test values.
2. Send the same viewer enough simulated chat events to cross the consistency threshold. Confirm replayed or cooldown-suppressed messages do not advance the bonus.
3. Test `!points` and confirm only the source chat receives the named balance and level.
4. Test `!lurk`, repeat it once, advance through the configured interval, then send another message. Confirm the repeated command did not reset the original lurk start and time settles once.
5. Simulate each enabled follow/support/community event and confirm its configured fixed award. Simulated awards remain disabled unless explicitly enabled for this test.
6. Restore production values and record the result as Offline/manual; genuine provider events remain separate acceptance evidence.

### Health checks

- **thsv.viewer-foundation.runtime:** Confirms named currency, salted identity resolution, bounded chat/time/event awards, replay protection, and atomic private progression state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `viewer.foundation.provide`, `chat.send`.

Viewer Foundation stores no chat text and never guesses a silent audience. Activity records contain only pseudonymous Viewer Foundation IDs, point totals, bounded counters, and timestamps. The cross-platform balance command is clamped to Twitch 500, YouTube 200, Kick 500, and TikTok 150 Unicode characters.

Private storage: `data/addons/thsv.viewer-foundation/`, `data/addons/.state/thsv.viewer-foundation/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its pseudonymous progression state remains preserved for a later reinstall or privacy export.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
