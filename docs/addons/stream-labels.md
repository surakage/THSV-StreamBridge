# Stream Labels

**Module:** `thsv.stream-labels` · **Version:** `4.1.8` · **Built in (extension)**

Projects equivalent Twitch, YouTube, Kick, TikTok, Streamlabs, and Ko-fi events into persistent OBS-ready stream labels.

Stream Labels shows on-screen text labels like "Latest Follower" or "Latest Support" that stay up until a newer event replaces them. Similar events from Twitch, YouTube, Kick, TikTok, Streamlabs and Ko-fi feed the same label, so one "Latest Follower" label covers all your platforms. Viewers see each label wherever you place it in your scenes.

## What you need
- One browser source per label you want (or one combined panel). Copy the URLs from the wizard. They look like `http://127.0.0.1:8787/overlay/addons/thsv.stream-labels?label=follower`.
- Nothing else. No Streamer.bot import, trigger or action approval is needed. Stream Labels uses the events StreamBridge already receives.

## Set it up
1. Open Setup Wizard > Extensions > Stream Labels.
2. Choose which platforms can update labels and which labels to publish.
3. Optional: rename the label titles (for example "Newest Friend" instead of "Latest Follower").
4. Choose the look: background (glass, solid or none), colors, font, size, alignment, and whether to show the title and platform name.
5. In **Open overlay & test**, copy the URL for each label you want and add it as a browser source in OBS, Meld or Streamlabs.
6. Save and restart StreamBridge if asked.
7. To test offline, run the StreamBridge simulator. Simulated events appear on the labels without replacing your saved live labels.

## Good to know
- The labels and their URL selectors:
  - `?label=follower`: Twitch, Kick and TikTok follows, plus YouTube new subscribers.
  - `?label=member`: Twitch, Kick and TikTok subscriptions or renewals, plus YouTube memberships.
  - `?label=gift-membership`: gifted subscriptions or memberships.
  - `?label=support`: Twitch cheers, TikTok/Kick/YouTube gifts, YouTube Super Chats, Streamlabs donations and Ko-fi donations.
  - `?label=raid`, `?label=reward`, and `?label=latest` (the newest event from any label).
  - `?label=all`: one compact panel with every enabled label.
- Names longer than 48 characters are shortened (you can change this limit).
- Only the latest value of each label is stored. No chat, viewer history or tokens are kept.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Insights** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.stream-labels` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Stream Labels |  | On |
| Platforms allowed to update labels |  | `twitch`, `youtube`, `kick`, `tiktok`, `streamlabs`, `kofi` |
| Labels to publish |  | `follower`, `member`, `gift-membership`, `support`, `raid`, `reward`, `latest` |
| Show simulator events without saving them |  | On |
| Maximum displayed name length |  | 48 |
| Follower label title |  | `Latest Follower` |
| Member label title |  | `Latest Member` |
| Gift membership label title |  | `Latest Gift Membership` |
| Support label title |  | `Latest Support` |
| Raid label title |  | `Latest Raid` |
| Reward label title |  | `Latest Reward` |
| Latest event label title |  | `Latest Event` |
| Show label title |  | On |
| Show platform name |  | On |
| Background style |  | `glass` |
| Background color |  | `#101820` |
| Background opacity |  | 0.88 |
| Label title color |  | `#7ff5cc` |
| Value color |  | `#ffffff` |
| Font style |  | `broadcast` |
| Value font size |  | 42 |
| Text alignment |  | `left` |

## Health checks

- **thsv.stream-labels.runtime:** Confirms bounded latest-event persistence and namespaced overlay publication.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`.

Private storage: `data/addons/thsv.stream-labels/`, `data/addons/.state/thsv.stream-labels/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its latest label values remain preserved for a later reinstall.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
