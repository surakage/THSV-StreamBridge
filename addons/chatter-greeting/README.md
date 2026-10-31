# Chatter Greeting

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
