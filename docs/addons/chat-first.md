# Chat First

**Module:** `thsv.chat-first` · **Version:** `4.1.67` · **Built in (extension)**

The first real person to chat on each platform each stream gets a spot on a small on-stream card, with an all-time times-first count.

The first real person to chat on each platform each stream gets a spot on a small on-stream card, with their profile picture, name and how many times they have been first ("3x first"). It is free and automatic: no rewards or points needed. It works for Twitch, YouTube, Kick, TikTok and Facebook chat.

## What you need

- Chat from at least one platform already reaching StreamBridge.

## Set it up

1. Turn on **Enable Chat First** and tick the platforms that get a first spot.
2. Pick a layout (podium, row or column), where the card shows, and whether it stays on screen for the whole stream or shows for a few seconds after each new first.
3. Optional: keep the chat message on, for example "Sloth is first in chat on Twitch! First 3 times so far." `{name}`, `{platform}`, `{count}` and `{times}` are filled in for you.
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.chat-first` as a 1920x1080 browser source in the scenes where the card should show.
5. Restart StreamBridge.

No Streamer.bot import is needed: chat already arrives through the platform intakes.

## Good to know

- Bots and your own account are never first. You can also skip moderators and list names to skip.
- Everyone can be first again when a stream starts, or after chat has been quiet for the hours you set. Going live on a second platform within half an hour counts as the same stream.
- StreamBridge keeps an all-time "times first" count per viewer per platform, for up to 5,000 viewers, on this PC only.
- When the card stays on screen all stream, it comes back if OBS reloads the browser source.
- The Control Panel shows this stream's firsts and can reset them by hand. Simulated test chat never counts.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.chat-first` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Chat First |  | Off |
| Platforms with a first spot |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Card title | Leave empty for no title. | `First in chat` |
| Layout | Horizontal is one row, Vertical is one column. Podium puts the earliest first chatter in the middle and highest. | `row` |
| Where the card shows |  | `top-left` |
| How long the card shows |  | `stream` |
| Seconds on screen after each new first |  | 15 |
| Show how many times they have been first |  | On |
| Post in chat when someone is first |  | On |
| Chat message | Placeholders: {name}, {platform}, {count} (a number) and {times} (for example 3 times). | `🥇 {name} is first in chat on {platform}! First {times} so far.` |
| Moderators cannot be first |  | Off |
| These names cannot be first | Comma-separated. Bots (names like sery_bot) and your own channels on every platform are always skipped. | (blank) |
| New stream after this many quiet hours | Everyone can be first again when a stream starts, or after chat has been quiet this long. | 8 |

## Health checks

- **thsv.chat-first.runtime:** Confirms first-chat detection per platform, the stream reset, the times-first count and the card overlay.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.chat-first/`, `data/addons/.state/thsv.chat-first/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
