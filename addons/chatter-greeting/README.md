# Chatter Greeting

The first time someone chats in a stream, a bubble pops up on stream with their profile picture, name, platform and a welcome line. The line fits who they are: first-timers, viewers back again, regulars and viewers back after a long break each get their own, for example "Welcome back, Sloth! That makes 4 streams together." It works for Twitch, YouTube, Kick, TikTok and Facebook chat.

## Set it up

1. Turn on **Enable Chatter Greeting** and tick the platforms to greet.
2. Write your lines. Each kind (first-timer, welcome back) can have extra lines that rotate, so greetings never read the same twice in a row. Placeholders:
   - `{name}`: the viewer's name
   - `{visits}`: how many streams they have chatted in, counting this one
   - `{away}`: how long since their last stream, for example "3 weeks"
   - `{platform}`: Twitch, YouTube, Kick, TikTok or Facebook
   - `{community}`: your community name from the Wizard
3. Optional: set when a viewer counts as a regular (10 streams by default) and how long a break gets the "missed you" line (14 days by default).
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.chatter-greeting` as a 1920x1080 browser source in the scenes where greetings should show.
5. Restart StreamBridge.

No Streamer.bot import is needed: chat already arrives through the platform intakes.

## Viewers who prefer no greeting

Viewers can type `!nogreet` to stop being greeted and `!greetme` to start again. They get a short reply in the chat they typed in, and their choice is remembered between streams. You can rename both commands, change the replies, or turn the option off.

## Good to know

- Each viewer is greeted once per stream. Everyone can be greeted again when a stream starts, or after chat has been quiet for the hours you set.
- Bots and your own account are never greeted. You can also skip moderators and list names to skip.
- Up to three bubbles show at once; more wait their turn.
- StreamBridge remembers who has chatted before (up to 5,000 viewers), with how many streams and when they were last here, only to choose the right line. Simulated test chat never triggers a greeting.
