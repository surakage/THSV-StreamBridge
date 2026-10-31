# Stream Labels

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
