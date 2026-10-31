# Chatter Greeting

**Module:** `thsv.chatter-greeting` · **Version:** `4.1.0` · **Built in (extension)**

Greets each viewer the first time they chat in a stream with an on-stream bubble showing their picture, name and platform, and welcomes back viewers from earlier streams.

The first time someone chats in a stream, a bubble pops up on stream with their profile picture, name, platform and a welcome line, for example "Welcome in, Sloth! Glad you found us." Viewers who chatted in an earlier stream get a welcome-back line instead. It works for Twitch, YouTube, Kick, TikTok and Facebook chat.

## Set it up

1. Turn on **Enable Chatter Greeting** and tick the platforms to greet.
2. Write your welcome line and welcome-back line. `{name}` becomes the viewer's name.
3. Add `http://127.0.0.1:8787/overlay/addons/thsv.chatter-greeting` as a 1920x1080 browser source in the scenes where greetings should show.
4. Restart StreamBridge.

No Streamer.bot import is needed: chat already arrives through the platform intakes.

## Good to know

- Each viewer is greeted once per stream. Everyone can be greeted again when a stream starts, or after chat has been quiet for the hours you set.
- Bots and your own account are never greeted. You can also skip moderators and list names to skip.
- Up to three bubbles show at once; more wait their turn.
- StreamBridge remembers who has chatted before (up to 5,000 viewers) only to choose the welcome-back line. Simulated test chat never triggers a greeting.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.chatter-greeting` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Chatter Greeting |  | Off |
| Greet chatters from |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Welcome line for new chatters | {name} becomes the viewer's name. | `Welcome in, {name}! Glad you found us.` |
| Greet returning chatters too | Viewers who chatted in an earlier stream get the welcome-back line. | On |
| Welcome-back line | {name} becomes the viewer's name. | `Welcome back, {name}!` |
| Show their first message in the bubble |  | On |
| Seconds on screen |  | 7 |
| Where the bubbles appear |  | `bottom-left` |
| Do not greet moderators |  | Off |
| Never greet these names | Comma-separated, for example your bot accounts. Bots and your own account are always skipped. | (blank) |
| New stream after this many quiet hours | Everyone can be greeted again when a stream starts, or after chat has been quiet this long. | 8 |

## Health checks

- **thsv.chatter-greeting.runtime:** Confirms first-chat detection, welcome-back memory and the greeting overlay.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`.

Private storage: `data/addons/thsv.chatter-greeting/`, `data/addons/.state/thsv.chatter-greeting/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
