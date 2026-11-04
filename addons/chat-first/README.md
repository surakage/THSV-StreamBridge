# Chat First

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
