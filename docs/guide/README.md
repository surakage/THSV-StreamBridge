# StreamBridge setup guide: start here

This guide is for streamers. You do not need to be a developer. Each page explains one part of THSV StreamBridge in plain steps, then links to the detailed reference docs if you want more.

StreamBridge runs on your Windows PC. It sits between Streamer.bot, your streaming app (OBS Studio, Meld Studio or Streamlabs Desktop) and your chat platforms (Twitch, Kick, YouTube, a Facebook Page and TikTok). You set it up in a private Setup Wizard that opens in your web browser.

**New here? Start with the [Quick start](quick-start.md).** It covers the whole first setup on one page. The steps below go deeper on each part.

## Set things up in this order

Do one step at a time. Test each step before you move on.

1. **Install StreamBridge.** [Install and first run](install-and-first-run.md)
2. **Work through the Setup Wizard.** Also in [Install and first run](install-and-first-run.md)
3. **Do the one Streamer.bot import, then approve actions.** [Where to find the Streamer.bot imports](streamerbot-imports.md) and [Streamer.bot import and approval](streamerbot-import-and-approval.md)
4. **Connect your platforms.** Start with the [Platforms overview](platforms.md), then the page for each platform you use: [Twitch](platforms/twitch.md), [Kick](platforms/kick.md), [YouTube](platforms/youtube.md), [Facebook Page](platforms/facebook.md), [TikTok](platforms/tiktok.md)
5. **Connect OBS (or Meld or Streamlabs).** [OBS and overlays](obs-and-overlays.md)
6. **Add your overlays as browser sources.** [OBS and overlays](obs-and-overlays.md)
7. **Tell StreamBridge which scene is which.** [Scene roles](scene-roles.md)
8. **Turn on the features you want.** Use the table below.

Other pages you will want later:

- [All features on one page](../feature-guide.md): every feature and extension group in one overview, with overlay URLs and quick troubleshooting
- [Points and !buy](points-and-buy.md): how viewers earn and spend StreamBridge points
- [Tray, launcher and Stream Deck](tray-launcher-and-stream-deck.md): one-button start and the tray icon
- [Updates, backups and recovery](updates-backups-and-recovery.md)
- [Troubleshooting](../troubleshooting.md)

## Two words you will see a lot

- **Built in** means the feature comes with StreamBridge. You turn it on in the wizard on the **Extensions** page. Built-in features are grouped into seven extension groups (Broadcast Director, Clip Engine, Community Rewards, Community Messaging, Community Insights, Community Play, and Voice & Language).
- **Add-on** means a separate download from the same GitHub release. You install its `.thsv-addon` file on the wizard's **Add-ons** page.

After you turn on a feature or install an add-on, go back to **Streamer.bot > One Streamer.bot import** and make a new import that includes it. See [Where to find the Streamer.bot imports](streamerbot-imports.md).

## Core features

| Feature | What it does | Where in the wizard | Read more |
| --- | --- | --- | --- |
| Platforms | Turns each chat platform on or off | **Platforms** | [Platforms](platforms.md) |
| Twitch | Chat, follows, subs, gift subs, cheers, raids and channel point rewards through Streamer.bot | **Platforms** | [Twitch](platforms/twitch.md) |
| Kick | Chat, follows, subs, gifts and Kick rewards through Streamer.bot | **Platforms** | [Kick](platforms/kick.md) |
| YouTube | Chat, subscribers, memberships, Super Chats and Jewels through Streamer.bot | **Platforms** | [YouTube](platforms/youtube.md) |
| Facebook Page | Live comments, follower milestones and timed comments, connected straight from the wizard | **Platforms > Facebook Page** | [Facebook Page](platforms/facebook.md) |
| TikTok | Chat, follows, gifts, likes and subs through TikFinity, plus TikTok LIVE Studio go-live help | **Platforms** and **Streamer.bot** | [TikTok](platforms/tiktok.md) |
| Streamer.bot imports | The one combined `.sb` import, the single recovery files and their checksums | **Streamer.bot > One Streamer.bot import** | [Where to find the Streamer.bot imports](streamerbot-imports.md) |
| Chat overlay and dock | Shows all your chats in one on-stream box, plus a dock you can reply from | **Chat Overlay** | [Browser overlay](../browser-overlay.md) |
| Alerts | Follows, subs, gifts, cheers, raids, Super Chats and more on stream | **Alerts** | [Browser overlay](../browser-overlay.md) |
| Closed Captions | Short-lived captions of your own speech, recognized by Streamer.bot | **Closed Captions** | [OBS and overlays](obs-and-overlays.md) |
| Commands | Lists every add-on chat command and builds a viewer command page | **Commands** | [Command directory](../command-directory.md) |
| Timed actions | Reminders and messages on a timer while you are live | **Timed Actions** | [Timed actions](../timed-actions.md) |
| Scene roles | Tells features which scene is Starting, Live, Break and so on | **Add-ons > Scene roles** | [Scene roles](scene-roles.md) |
| Channel rewards | Twitch and Kick channel point redemptions reach your features | Streamer.bot intakes | [Channel rewards](../rewards.md) |

## Every feature and add-on

"Needs Streamer.bot import" means the feature has its own Streamer.bot actions, so you must include it in the one Streamer.bot import. "No" features still rely on the normal import you already did for your platforms. "Shows on stream" means it has a browser source for OBS.

| Feature | What it does | Needs Streamer.bot import | Shows on stream | Built in or add-on |
| --- | --- | --- | --- | --- |
| [Accessibility Captions](../addons/accessibility-captions.md) | High-contrast, short-lived chat captions; message text is not saved | Yes | Yes | Add-on |
| [Ad Break Companion](../addons/ad-break-companion.md) | Countdown for upcoming and running Twitch ads | Yes | Yes | Built in (Broadcast Director) |
| [Automated Shoutouts](../addons/automated-shoutouts.md) | Shoutouts and once-a-day welcomes, with on-stream cards | Yes | Yes | Built in (Community Messaging) |
| [Category Pilot](../addons/category-pilot.md) | Suggests or applies a Creator Controls setup when a chosen game is running | Yes | Optional | Add-on |
| [Chat Guard](../addons/chat-guard.md) | Watches chat for problems; moderation is optional and off by default | Yes | No | Built in (Community Messaging) |
| [Chat Play Pack](../addons/chat-play-pack.md) | Chat games, duels, trivia and Unscramble with points | Yes | Yes | Built in (Community Play) |
| [Clip Courier](../addons/clip-courier.md) | `!clip` for Twitch, and optional posting of clips to Discord | Yes | No | Built in (Clip Engine) |
| [Clip Library Cache](../addons/clip-library-cache.md) | Keeps one shared list of your Twitch clips for the other clip features | Yes | No | Built in (Clip Engine) |
| [Community Analytics](../addons/community-analytics.md) | Private attendance and activity counts, plus monthly recaps | No | No | Built in |
| [Creator Controls](../addons/creator-controls.md) | Saves stream setups (title, category) and applies one to Twitch, YouTube and Kick | Yes | No | Add-on |
| [Custom Counter](../addons/custom-counter.md) | Counters that moderators can change from chat, with an overlay | Yes | Yes | Built in (Community Play) |
| [Discord Chat Archive](../addons/discord-chat-archive.md) | Copies chosen public chat to a private Discord webhook | Yes | No | Built in (Community Messaging) |
| [Face Filters](../addons/face-filters.md) | Chat triggers Streamfog face lenses on your camera | Yes | No (the lens shows on your camera) | Built in (Community Play) |
| [Magic 8-Ball](../addons/magic-eight-ball.md) | Viewers ask a yes-or-no question with a reward or command | No | Optional card | Built in (Community Play) |
| [Fan Crown](../addons/fan-crown.md) | A crown viewers can claim, with a monthly leaderboard | Yes | Yes | Built in (Community Rewards) |
| [First Five](../addons/first-five.md) | The first five viewers each stream claim a place | Yes | Yes | Built in (Community Rewards) |
| [Follower Pulse](../addons/follower-pulse.md) | Privately notices Twitch unfollows | Yes | No | Built in (Community Insights) |
| [Free Game Check](../addons/free-game-check.md) | After a redemption, checks public free-game giveaways and posts them to Discord | Yes | No | Add-on |
| [Ko-fi Donations](../addons/kofi-donations.md) | Ko-fi donations become StreamBridge alerts | Yes | Yes (main Alerts overlay) | Built in |
| [Live Beacon](../addons/live-beacon.md) | Posts a Discord "we are live" message for each platform | Yes | No | Built in (Broadcast Director) |
| [Prize Wheel](../addons/prize-wheel.md) | A wheel you spin on stream, with a result card | No | Yes | Add-on |
| [Quote Vault](../addons/quote-vault.md) | One moderated quote library shared by all platforms | Yes | No | Built in (Community Messaging) |
| [Raid Scout](../addons/raid-scout.md) | Previews Twitch raid targets and handles the end of your stream | Yes | Yes | Built in (Broadcast Director) |
| [Random Clip Player](../addons/random-clip-player.md) | Plays a random clip from your own Twitch clips on a timer | Yes | Yes | Built in (Clip Engine) |
| [Scene Actions](../addons/scene-actions.md) | Runs a Streamer.bot action when you switch to a chosen scene | Yes | No | Built in (Broadcast Director) |
| [Scene Gates](../addons/scene-gates.md) | Commands and rewards work only on the scenes you choose | Yes | No | Built in (Broadcast Director) |
| [Stream Break & End Guard](../addons/stream-session-guard.md) | Break reminders and break scenes based on your planned stream length | Yes | Yes | Built in (Broadcast Director) |
| [Stream Labels](../addons/stream-labels.md) | Latest follower, sub, donation and similar labels for OBS | No | Yes | Add-on |
| [Stream Launch Countdown](../addons/starting-soon-countdown.md) | A Starting Soon countdown with a message and sound | Yes | Yes | Built in (Broadcast Director) |
| [Streamer Punishments](../addons/streamer-punishments.md) | Viewers buy screen effects or exercises for you | Yes | Yes | Built in (Community Play) |
| [Subathon Timer](../addons/subathon-timer.md) | A subathon countdown that grows with live events | Yes | Yes | Add-on |
| [Translate](../addons/user-translate.md) | Viewer-requested and optional automatic chat translation | Yes | No | Built in (Voice & Language) |
| [Viewer Foundation](../addons/viewer-foundation.md) | Shared viewer identity and StreamBridge points | No | No | Built in |
| [Viewer Lobby](../addons/viewer-lobby.md) | A play-with-viewers queue with an overlay | Yes | Yes | Add-on |
| [Viewer Spotlight](../addons/viewer-spotlight.md) | Viewer cards on stream and a Stream Score | Yes | Yes | Built in (Community Rewards) |
| [Village Draw](../addons/village-draw.md) | Free or points giveaways with a winner overlay | No | Yes | Add-on |
| [Village Fun Commands](../addons/village-fun-commands.md) | Facts, jokes and other light fun commands | Yes | No | Built in (Community Play) |
| [Village Hydration Station](../addons/village-hydration-station.md) | Friendly sip reminders while you are live | Yes | Yes | Built in (Community Rewards) |
| [Village Jukebox](../addons/village-jukebox.md) | A fair song-request queue (YouTube first) | Yes | Yes | Add-on |
| [Village Lurk Tracker](../addons/lurk-tracker.md) | Tracks `!lurk`, returns and monthly visits | No | No | Add-on |
| [Village Polls](../addons/village-polls.md) | One chat poll across all platforms, with a result overlay | No | Yes | Add-on |
| [Village Roll Call](../addons/village-roll-call.md) | Daily viewer check-ins | No | Yes | Built in (Community Rewards) |
| [Village Voice](../addons/voice-relay.md) | Sends alerts and viewer TTS through Speaker.bot | Yes | Optional (avatar and text overlay) | Built in (Voice & Language) |

The full list of add-on guides is in [Extension and add-on setup guides](../addons/README.md). The seven extension groups are explained in [Main features](../main-features.md).
