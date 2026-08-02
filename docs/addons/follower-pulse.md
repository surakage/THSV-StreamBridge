# Follower Pulse setup

**Module:** `thsv.follower-pulse`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Privately detects delayed Twitch unfollows through complete, bounded, two-scan follower reconciliation.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Follower-Pulse-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Follower-Pulse-3.0.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Follower-Pulse-3.0.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the Follower Pulse Streamer.bot package.
2. Keep Snapshot Page triggerless and approve only its stable action ID for Follower Pulse.
3. Reconnect the Twitch broadcaster in Streamer.bot if moderator:read:followers is unavailable, then enable Follower Pulse.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.33`.

Imported group: `THSV Addon - Follower Pulse`

- `THSV Addon - Follower Pulse - Snapshot Page` in `THSV Addon - Follower Pulse`
- `THSV Addon - Follower Pulse - Reconcile Now` in `THSV Addon - Follower Pulse`

Snapshot Page must remain triggerless and is dispatched only through Follower Pulse's creator-approved stable action ID. Reconcile Now contains no Twitch credential access.

Creator-selected triggers:

- **reconcile-now:** Attach only to a creator-controlled hotkey, deck button, or operator command.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.follower-pulse` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.follower-pulse.runtime:** Confirms bounded Twitch follower reconciliation is scheduled and fail-closed.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.follower-pulse/`, `data/addons/.state/thsv.follower-pulse/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private bounded follower history remains preserved until the creator deletes it.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
