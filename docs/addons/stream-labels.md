# Stream Labels setup

Stream Labels combines equivalent events from every supported platform into a small set of persistent text sources. It reuses StreamBridge's validated event bus and browser-overlay connection.

**Module:** `thsv.stream-labels`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

## What each label means

| Label | Events |
| --- | --- |
| Latest Follower | Twitch, Kick, and TikTok follows; YouTube new subscribers |
| Latest Member | Twitch, Kick, and TikTok subscriptions or renewals; YouTube memberships |
| Latest Gift Membership | Gifted subscriptions and memberships |
| Latest Support | Cheers, gifts, YouTube Super Chats and Jewels, Streamlabs donations, and Ko-fi support events |
| Latest Raid | Raids |
| Latest Reward | Channel reward redemptions |
| Latest Event | The latest event handled by any label above |

## Install

1. Download and extract the Stream Labels add-on ZIP from the same release as StreamBridge.
2. Install `thsv.stream-labels-2.5.2.thsv-addon` in the Add-ons page and review its three permissions.
3. Enable the add-on.
4. Restart StreamBridge when prompted.

### Add-on-specific steps

1. Choose the enabled platforms and labels.
2. Adjust the optional headings and appearance.
3. Expand **Open overlay & test**.
4. Copy the individual label URL you need into an OBS, Meld, or Streamlabs browser source.
5. Use **Send all-label preview** or a normal event fixture before going live.

## Streamer.bot

No Streamer.bot package, action grant, command, or direct trigger is required. The existing THSV platform intake actions already deliver every normalized event.

## Browser source

Start an individual label at `900 × 180`. Crop the browser source only after confirming that the longest expected name or support amount remains visible. Use a transparent background for placement inside custom scene art. The combined `?label=all` panel needs more height and is primarily intended for testing or a compact supporter panel.

Simulated events are displayed when **Show simulator events without saving them** is enabled, but they do not overwrite the persisted live label.

## Offline test

1. Open the `?label=all` URL in a browser or temporary OBS browser source.
2. Press **Send all-label preview** and verify all seven labels remain readable.
3. Run the Twitch follow and YouTube Super Chat fixtures.
4. Confirm the individual follower and support URLs update once.
5. Confirm restarting StreamBridge restores the last genuine labels and does not persist simulator-only names.

## Data and permissions

Stream Labels stores one bounded display record per label: display text, platform, event type, stable event ID, and update time. It stores no chat text, raw provider payload, access token, or viewer history.

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, and `state.private`.

Private storage: `data/addons/thsv.stream-labels/` and `data/addons/.state/thsv.stream-labels/`.

Dependencies: none.

## Remove or repair

Uninstalling removes the executable package but preserves its small private label state for a later reinstall. Reinstall the matching version if package integrity or compatibility is rejected.
