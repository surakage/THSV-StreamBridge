# Chatter Greeting

**Module:** `thsv.chatter-greeting` · **Version:** `4.1.67` · **Built in (extension)**

Greets each viewer the first time they chat in a stream with an on-stream bubble showing their picture, name and platform, and welcomes back viewers from earlier streams.

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
| Welcome line for first-time chatters | Placeholders: {name}, {visits} (streams they have chatted in, counting this one), {away} (how long since their last stream), {platform}, {community} (your community name). | `Welcome to {community}, {name}! First time here, so grab a cozy spot and say hi anytime.` |
| More first-time welcome lines | One line per row; a line is picked at random, never the same one twice in a row. Placeholders: {name}, {visits} (streams they have chatted in, counting this one), {away} (how long since their last stream), {platform}, {community} (your community name). | `{name} just found {community}! So glad you are here.`, `A new face! Welcome in, {name}. Make yourself at home.` |
| Greet returning chatters too | Viewers who chatted in an earlier stream get the welcome-back line. | On |
| Welcome-back line | Placeholders: {name}, {visits} (streams they have chatted in, counting this one), {away} (how long since their last stream), {platform}, {community} (your community name). | `Welcome back, {name}! That makes {visits} streams together.` |
| More welcome-back lines | One line per row; a line is picked at random, never the same one twice in a row. Placeholders: {name}, {visits} (streams they have chatted in, counting this one), {away} (how long since their last stream), {platform}, {community} (your community name). | `{name} is back in {community}! Thanks for hanging out again.`, `Good to see you again, {name}! Visit number {visits}.` |
| Line for regulars | Placeholders: {name}, {visits} (streams they have chatted in, counting this one), {away} (how long since their last stream), {platform}, {community} (your community name). | `{name}, a true regular! {visits} streams and counting. Your usual spot is saved.` |
| Regular after this many streams | Viewers who have chatted in at least this many streams get the regulars line. | 10 |
| Line for viewers back after a long break | Placeholders: {name}, {visits} (streams they have chatted in, counting this one), {away} (how long since their last stream), {platform}, {community} (your community name). | `{name}! It has been {away}. {community} missed you, welcome home.` |
| Long break after this many days |  | 14 |
| Show their first message in the bubble |  | On |
| Seconds on screen |  | 7 |
| Where the bubbles appear |  | `bottom-left` |
| Do not greet moderators |  | Off |
| Never greet these names | Comma-separated, for example your bot accounts. Bots and your own account are always skipped. | (blank) |
| New stream after this many quiet hours | Everyone can be greeted again when a stream starts, or after chat has been quiet this long. | 8 |
| Let viewers turn their greeting off | Viewers type the opt-out command to stop being greeted, and the opt-in command to start again. Their choice is remembered. | On |
| Opt-out command |  | `nogreet` |
| Opt-in command |  | `greetme` |
| Reply when a viewer opts out | Placeholders: {name}, {optIn} (the opt-in command). | `Got it, {name}. No more greetings from me. Type !{optIn} anytime to turn them back on.` |
| Reply when a viewer opts back in | Placeholder: {name}. | `Yay, {name}! Your greetings are back on.` |

## Health checks

- **thsv.chatter-greeting.runtime:** Confirms first-chat detection, visit memory, opt-out and the greeting overlay.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`, `chat.send`.

Private storage: `data/addons/thsv.chatter-greeting/`, `data/addons/.state/thsv.chatter-greeting/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
