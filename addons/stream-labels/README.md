# Stream Labels

Stream Labels turns equivalent normalized events from multiple platforms into persistent, OBS-ready text labels.

## Included labels

- **Latest Follower:** Twitch, Kick, and TikTok follows plus YouTube new subscribers.
- **Latest Member:** Twitch, Kick, and TikTok subscriptions or renewals plus YouTube memberships.
- **Latest Gift Membership:** gifted subscriptions or memberships.
- **Latest Support:** Twitch cheers, TikTok/Kick/YouTube gifts, YouTube Super Chats, Streamlabs donations, and Ko-fi events that enter the normalized support contract.
- **Latest Raid**
- **Latest Reward**
- **Latest Event:** the most recent event handled by any label above.

The add-on stores only one bounded display record per label. It does not store chat messages, raw provider payloads, access tokens, or a viewer history.

## Setup

1. Install and enable the add-on in the wizard.
2. Choose platforms, enabled labels, wording, and appearance.
3. In **Open overlay & test**, copy the exact individual label URL into an OBS, Meld, or Streamlabs browser source.
4. Run simulator fixtures before going live. Simulated previews display without replacing saved live labels.

No separate Streamer.bot package, trigger, action approval, or WebSocket connection is required. Stream Labels consumes the existing validated StreamBridge event stream.

## URL selectors

Append one of these selectors to `/overlay/addons/thsv.stream-labels`:

- `?label=follower`
- `?label=member`
- `?label=gift-membership`
- `?label=support`
- `?label=raid`
- `?label=reward`
- `?label=latest`
- `?label=all`

Individual sources remain visible until a newer event updates the same label.
