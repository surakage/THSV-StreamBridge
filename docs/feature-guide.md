# Feature guide

Every StreamBridge feature in one place: what it does, and the shortest path to set it up. Each
extension also has a detailed setup page under [docs/addons](./addons/README.md), generated from the
same settings the wizard shows.

- New install? Start with the [step-by-step setup guide](../README.md#set-it-up), then come back here.
- Everything is set up in the **Setup Wizard** (`Open THSV Setup Wizard.cmd` in the install folder,
  or the tray icon → Setup Wizard). Wizard pages are named in **bold** below.

## How the pieces fit

| Piece | Job |
| --- | --- |
| **StreamBridge** | Receives every platform's events, decides what happens (points, queues, timers, cooldowns), and draws the browser overlays. |
| **Streamer.bot** | Connects to Twitch, YouTube, Kick, OBS, Voicemod, Streamfog, and Ko-fi, and carries out the small actions StreamBridge asks for (switch a scene, toggle a filter, refund a reward). |
| **OBS / Meld / Streamlabs** | Shows the overlays as browser sources. Aitum Vertical is supported for a vertical canvas. |
| **TikFinity** | Brings TikTok chat, gifts, and follows into StreamBridge. |

Two rules keep this safe: StreamBridge never asks for your platform passwords (those connections stay
in Streamer.bot and TikFinity), and every Streamer.bot action an extension uses must be **approved**
in the wizard and must have **no triggers** of its own.

## Setup in seven steps

1. **Install** — run `Install THSV StreamBridge.cmd` from the release ZIP. It starts StreamBridge and
   opens the wizard.
2. **Streamer.bot** — choose `Streamer.bot.exe`, then turn on the optional apps you want started for
   you (see [Start streaming tools](#start-streaming-tools-and-optional-apps)).
3. **Platforms** — switch on the platforms you stream to. Facebook needs a Page access token
   ([Facebook](#facebook-page)).
4. **Scene roles** (Extensions > Scene roles) — pick your Starting, Live, Just Chatting, Break, and Ending
   scenes once. Extensions refer to `role:starting`, `role:break`, and so on, so they keep working if
   you rename a scene. If your main scenes nest a shared "contents" scene,
   choose the nested scene for each role too, so a nested scene never triggers
   automations by itself.
5. **Extensions** — enable the groups you want (below), open each component, and fill in its settings.
6. **Streamer.bot → One Streamer.bot import** — select the enabled features and import the single
   generated `.sb` file into Streamer.bot. Then, on each extension's **Approve Streamer.bot actions**
   step, choose **Approve recommended**.
7. **Restart StreamBridge** when the wizard asks. Command and settings changes take effect after a
   restart; action approvals apply straight away. **Setup checklist** shows anything still missing.

## Core features

### Chat overlay
One cross-platform chat feed with avatars, badges, platform colors, and regular, compact, minimal, or
classic layouts. **Chat Overlay** sets the look; add `http://127.0.0.1:8787/overlay/chat` as a browser
source (a dock version is at `/overlay/chat/dock`). Names you list under ignored names (bots, your own
accounts) are hidden.

### Alerts
Follows, subs and memberships, gifts, bits, Super Chats, raids, TikTok gifts and like milestones,
Ko-fi tips, and Facebook milestones, with sounds and images per alert. Configure under **Alerts** and
add `/overlay/alerts` as a browser source. **Closed Captions** adds an optional caption overlay at
`/overlay/captions`.

### Commands
Extension commands (for example `!buy`, `!filter`, `!done`) are registered automatically for the chats
each extension supports; your own Streamer.bot commands always win a name clash. `!commands` gives
viewers an automatic list. Change command names in each extension's settings, then restart.

### Timed actions
Rotating chat messages per platform (welcome, rules, socials, how to use rewards) with interval,
live-only, quiet-chat, and scene gates. Edit under **Timed Actions**; each platform can have its own
wording.

### Viewer Foundation (points)
One points balance per viewer across platforms, earned by chatting, watching, and lurking. Extensions
spend these points on YouTube, TikTok, and Facebook, where channel point rewards don't exist. Rename
the currency and tune earn rates under **Viewer Foundation**; viewers check with `!points`.

### Start streaming tools and optional apps
`Start THSV Streaming Tools.cmd` (or a Stream Deck **Open** action pointing at it) starts everything in
a safe order: Voicemod, Streamer.bot, Speaker.bot, StreamBridge, then OBS / Meld / Streamlabs,
TikFinity, TikTok LIVE Studio, and Streamfog. Choose each app on the **Streamer.bot** page under
optional apps and tick **Start automatically**. An app that is already open is never started twice,
and an already-open Streamer.bot is given time to finish starting instead of being restarted.

### Updates
**Overview → Check for updates** installs new releases. Updates keep your settings, reward IDs, and
approvals. If it says GitHub's hourly limit was reached, wait and try again.

## Extension groups

Enable a whole group under **Extensions**, then set up the parts you want. Every name links to its
detailed setup page.

### Broadcast Director — run the show

| Feature | What it does | Key setup |
| --- | --- | --- |
| [Live Beacon](./addons/live-beacon.md) | Announces you went live (title, category, artwork) to Discord. | Discord webhook in its settings. |
| [Stream Launch Countdown](./addons/starting-soon-countdown.md) | The Starting Soon countdown with a message and a tone at zero. | Add `/overlay/addons/thsv.starting-soon-countdown` to your Starting scene. |
| [Stream Break & End Guard](./addons/stream-session-guard.md) | Wellness breaks at set intervals and a maximum stream length, with on-screen countdowns, chat warnings, sound cues, a heads-up switch to Just Chatting before the end, and an automatic switch to your Ending scene. | Pick break and ending scenes; set **At the end of the countdown** to *Automatic* if you want the ending (and Raid Scout) to start by itself. |
| [Scene Actions](./addons/scene-actions.md) | Runs a Streamer.bot action when a chosen scene goes live. | Map scene → approved action. |
| [Scene Gates](./addons/scene-gates.md) | Lets Streamer.bot commands and Twitch rewards work only on chosen scenes; a Check action stops Kick rewards on the wrong scene. Everything turns back on when the stream ends. | One row per command or reward with its allowed scenes; approve **THSV Scene Gate - Apply**. |
| [Ad Break Companion](./addons/ad-break-companion.md) | Shows Twitch's upcoming-ad and running-ad countdown. | Add its overlay; nothing else. |
| [Raid Scout](./addons/raid-scout.md) | Picks a raid target when your Ending scene starts, shows who and a clip, waits for the ending ad, then raids. | Set **On the ending scene** to *suggest and confirm* for a hands-free end-of-stream raid. |

### Clip Engine — your Twitch clips on stream

| Feature | What it does | Key setup |
| --- | --- | --- |
| [Clip Library Cache](./addons/clip-library-cache.md) | Keeps one list of your Twitch clips for the other clip features. | Approve its action. |
| [Random Clip Player](./addons/random-clip-player.md) | Plays random clips on chosen scenes (for example Starting Soon, Be Right Back, Ending). | List the scenes; use **Scenes that play clips without sound** for scenes that already have music (`role:starting` by default). |
| [Clip Courier](./addons/clip-courier.md) | `!clip` makes a Twitch clip and can post clips to Discord. | Discord webhook optional. |

### Community Rewards — channel points and StreamBridge points

These work with Twitch and Kick channel point rewards (matched by reward ID, so renaming a reward never
breaks it) and with StreamBridge points on YouTube, TikTok, and Facebook.

| Feature | What it does |
| --- | --- |
| [First Five](./addons/first-five.md) | Rewards the first five viewers each stream. |
| [Fan Crown](./addons/fan-crown.md) | A crown viewers steal from each other; the price rises each time, with a monthly leaderboard. |
| [Viewer Spotlight](./addons/viewer-spotlight.md) | Viewer cards and a Stream Score on the overlay. |
| [Village Roll Call](./addons/village-roll-call.md) | Daily check-ins with streaks. |
| [Village Hydration Station](./addons/village-hydration-station.md) | Friendly sip reminders while live. |

**Reward IDs:** in Streamer.bot, right-click a reward → **Copy Reward Id**, and paste it into the
extension's Twitch or Kick box.

### Community Messaging

| Feature | What it does |
| --- | --- |
| [Automated Shoutouts](./addons/automated-shoutouts.md) | Raid and manual shoutouts plus once-a-day welcomes, with cards. |
| [Discord Chat Archive](./addons/discord-chat-archive.md) | Copies chosen chat to a private Discord channel. |
| [Chat Guard](./addons/chat-guard.md) | Flags or acts on spam and banned phrases per platform. |
| [Quote Vault](./addons/quote-vault.md) | A shared, moderated `!quote` library. |

### Community Insights

| Feature | What it does |
| --- | --- |
| [Follower Pulse](./addons/follower-pulse.md) | Privately notices Twitch unfollows. |
| [Goal Bars](./addons/goal-bars.md) | Up to three on-stream goal bars adding up follows, subs, Bits, Super Chats, gifts and tips from every platform, split by platform colour. |
| [Community Analytics](./addons/community-analytics.md) | Private attendance and chat trends across platforms. |

### Community Play — interactive fun

| Feature | What it does |
| --- | --- |
| [Custom Counter](./addons/custom-counter.md) | Death counters and other on-screen counters with mod commands. |
| [Chat Play Pack](./addons/chat-play-pack.md) | Chat games: trivia, predictions, coin flip, slots, duels, and more. |
| [Village Fun Commands](./addons/village-fun-commands.md) | Facts, jokes, and social commands. |
| [Face Filters](#face-filters-with-voicemod-voices) | Streamfog face lenses from commands or rewards, each with an optional Voicemod voice. |
| [Streamer Punishments](#streamer-punishments-and-the-bean-boozled-wheel) | Viewers buy screen effects or exercises; includes the Bean Boozled wheel. |
| [Magic 8-Ball](./addons/magic-eight-ball.md) | Twitch and Kick rewards (or an optional command) get an 8-Ball answer in the same chat, with an optional overlay card. |

### Voice & Language

| Feature | What it does |
| --- | --- |
| [Village Voice](./addons/voice-relay.md) | Text-to-speech for chosen alerts and viewer requests through Speaker.bot. |
| [Translate](./addons/user-translate.md) | Translates chat on request or automatically, back to the same platform. |

Prize Wheel, Village Polls, Polls & Predictions, Village Draw, Viewer Lobby, Village Jukebox, Subathon Timer, Stream
Labels, End Credits, Lurk Tracker, Creator Controls, Category Pilot, Free Game Check, and Accessibility Captions are
built in too, inside the extension groups. Each has its own page in [docs/addons](./addons/README.md).

## In-depth: the newer features

### Streamer Punishments and the Bean Boozled wheel

Viewers make you suffer, nicely:

- **Screen effects** switch an OBS filter on for a few seconds (default 15), one at a time with a short
  queue. Add each filter to a source in OBS and leave it **off**: Blackout is a built-in Color
  Correction filter with brightness lowered; Pixelate uses the free **Composite Blur** plugin; Barrel
  roll uses the free **Move** plugin (a Move Source filter on the scene that holds your camera, with
  *Transform relative* and a rotation). Type each effect's exact source and filter names into its row.
- **Exercises** (Pushups, Situps, Squats by default) go on an owed list. A countdown gives you time to
  get somewhere safe, StreamBridge switches to your safe scene (Just Chatting by default), and you or a
  mod type `!done` to switch back. Exercises bought during Starting Soon, a break, or the ending wait for
  a normal scene. `!punishments` shows what's owed and this month's totals (they reset at your first
  stream of a new month).
- **Paying:** Twitch and Kick use channel point rewards (one Twitch and one Kick reward ID box per row);
  YouTube, TikTok, and Facebook use `!buy <name>` with StreamBridge points. Twitch enforces each
  reward's own limit and cooldown; Kick rewards have none, so StreamBridge applies the per-stream limit
  and cooldowns to Kick redemptions. Leave **Redemption Skips Queue** off on Kick rewards so a mod can
  reject (refund) a blocked one.
- **Tracker panel:** a small corner panel with what's owed and this month's totals, shown only while
  something is owed (turn that off to keep it up all the time).
- **Bean Boozled wheel** (off until you enable it): Twitch bits, verified tips (for example Ko-fi), and
  TikTok gifts spin a wheel of bean colors; it lands on a color, then reveals NICE or NASTY, and the bean
  goes on the owed list. Defaults: 500 bits, $5, or 500 TikTok coins per spin, up to 3 spins at once.
  Ships with the BeanBoozled 7th edition; edit the colors and flavors to match your box. Mods can test
  with `!punish bean`.
- **Streamer.bot:** import the package, approve **Set Filter** and **Switch Scene**, no triggers.
- **Overlay:** add `/overlay/addons/thsv.streamer-punishments` to the scenes you play in.

### Face Filters with Voicemod voices

- Install **Streamfog**, connect it in Streamer.bot (Integrations → StreamFog), and set your camera
  source in OBS to the **Streamfog virtual camera** (not a Streamfog browser source, which can stop OBS
  from closing).
- Add one row per lens: name, the exact Streamfog lens name, an optional `!command`, optional Twitch and
  Kick reward IDs, seconds, and an optional **Voicemod voice ID**. One lens shows at a time.
- **Voices:** connect Voicemod in Streamer.bot (Integrations → VoiceMod, with **Auto Connect** and
  **Auto Reconnect** on). Voicemod picks voices by ID, so select a voice in Voicemod, type
  `!filter voice` in chat, and paste the ID StreamBridge replies with. The voice changer turns on with
  the lens and off when it ends.
- **Streamer.bot:** import the package and approve all five actions (Activate Lens, Deactivate Lens,
  Set Voice, Voice Off, Report Voice), then restart StreamBridge.

### Ko-fi tips
Connect Ko-fi in Streamer.bot (webhook and verification token), import the Ko-fi intake action and
attach only its **Ko-fi Donation** trigger. Tips then appear as alerts and count toward the Bean
Boozled wheel and subathon timers.

### Facebook Page
**Platforms → Facebook Page** reads live comments into your chat, follower milestones into alerts, and
can post timed messages. Paste a long-lived **Page access token** (create it in Meta's Graph API
Explorer with `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, and
`pages_manage_engagement`, extend it in the Access Token Debugger, then copy the Page's token from
`me/accounts`). Verify and save, then **Enable Facebook**. If it later says the authorization expired,
paste a new token the same way. Step-by-step: [Facebook Page setup](guide/platforms/facebook.md).

### Discord screenshots
**Platforms → Discord screenshots** posts every new picture saved in your screenshot folders to your
Discord channels. In Discord, open a channel's settings, choose **Integrations → Webhooks**, create a
webhook and **Copy Webhook URL**. In the Wizard, give it a name, paste the link and choose **Add webhook**.
You can add up to five. Then add the folders your screenshots are saved in (for example, the OBS
screenshot folder) and **Save**. **Send test** posts a short message to each webhook so you can check
the channel.

- **Who asked:** name a channel point reward or a chat command. The next screenshot in the next 30
  seconds is posted as that viewer, with their name and picture. Turn this off to always use your
  default name and picture.
- **OBS can take the picture:** turn on **Have OBS take the screenshot** to save the scene that is on
  air when a viewer asks.
- **Message:** the message can use `[user]`, `[platform]` and `[fileName]`.
- **Privacy:** webhook links are stored encrypted for your Windows account and never shown again. Only
  pictures saved after StreamBridge starts are posted, up to 10 MB each.

## Adding overlays to OBS

Every overlay is a browser source pointing at StreamBridge on your PC:

| Overlay | URL |
| --- | --- |
| Chat | `http://127.0.0.1:8787/overlay/chat` |
| Alerts | `http://127.0.0.1:8787/overlay/alerts` |
| Captions | `http://127.0.0.1:8787/overlay/captions` |
| Any extension | `http://127.0.0.1:8787/overlay/addons/<extension id>` (for example `thsv.streamer-punishments`) |

Use 1920×1080 for full-screen overlays and crop or scale in OBS. For a vertical canvas, add the same
URL at the size you want. Each extension's setup page lists its overlay and the scenes it belongs in.

## Quick troubleshooting

| You see | Do this |
| --- | --- |
| "Approve the … action in the wizard first" right after approving | Open **Setup checklist**: the action may be missing from Streamer.bot (import again), or a just-installed feature still needs one restart. |
| A command does nothing | Check the extension is enabled, the command name in its settings, and restart after changing commands. |
| A reward does nothing | Paste the reward's **ID** (not its name) into the matching Twitch or Kick box. |
| "GitHub's hourly limit … was reached" | Wait for the time shown, then **Check for updates** again. |
| Facebook "authorization expired" | Paste a new Page access token ([Facebook Page](#facebook-page)). |
| The ending scene or raid didn't start | Stream Break & End Guard → **At the end of the countdown** must be *Automatic*. |
| OBS stays open in Task Manager after closing | Use the Streamfog virtual camera instead of a Streamfog browser source. |
| An app opened twice | Update to 4.0.40 or later; already-open apps are now skipped. |

More help: [Troubleshooting](./troubleshooting.md) · [Streamer.bot setup](./streamerbot-setup.md) ·
[Live test checklist](./live-test-checklist.md)
