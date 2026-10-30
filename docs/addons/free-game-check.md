# Free Game Check

**Module:** `thsv.free-game-check` · **Version:** `4.0.64` · **Optional add-on**

Checks bounded public game giveaways only after a viewer redemption, routes available games to Discord, and refunds supported empty checks.

Free Game Check lets viewers ask whether any games are free to claim right now. When a viewer redeems it, StreamBridge does one lookup on the public GamerPower giveaway list. If games are available, the viewer's chat gets a short message pointing to your Discord. If none are found, the viewer gets their points back where the platform allows it. It never runs on a timer.

## What you need
- The **Viewer Foundation** add-on, if you want YouTube and TikTok viewers to use points.
- The Free Game Check Streamer.bot import. Keep all three actions triggerless:
  - **THSV Addon - Free Game Check - Refresh** (approve it).
  - **THSV Addon - Free Game Check - Settle Twitch Reward** (approve it for Twitch fulfil and refund).
  - **THSV Addon - Free Game Check - Discord Deliver** (approve it only if you post games to Discord).
- A Twitch channel point reward called something like "Free Games". Paste the reward ID into the wizard.
- A Kick reward, if you stream on Kick. Paste the reward ID into the wizard.
- Optional: a Discord webhook for the channel or forum where new games should be posted.

## Set it up
1. Install and enable Viewer Foundation first if you want the YouTube and TikTok command.
2. In Streamer.bot, import the Free Game Check package. Do not add triggers to any of its actions. Your reward redemptions already reach StreamBridge through its normal platform intake actions.
3. Create the Twitch reward. Keep **Skip Reward Queue** off so empty checks can be refunded. Create the Kick reward too if needed.
4. Open Setup Wizard > Add-ons > Free Game Check. Paste the Twitch and Kick reward IDs.
5. Check the command name (default `freegames`) and point cost (default 100) for YouTube and TikTok.
6. Replace the Discord invite link with your own server's invite, and edit the chat messages if you like.
7. Optional: to post new games to Discord, paste your webhook URL into the **Discord Deliver** action's `freeGameDiscordWebhookUrl` argument in Streamer.bot. Then turn on **Post newly discovered games to Discord** and choose channel or forum.
8. Approve the actions listed above, turn on **Enable Free Game Check**, save, and restart StreamBridge so the command registers.
9. Test while live on one platform. Requests are ignored while offline, and simulated events and trigger tests never start a lookup.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!freegames` | Viewers on YouTube and TikTok | Spends 100 Viewer Foundation points and checks for free games. Points are refunded if none are found or the check fails. |

## Good to know
- Only one check runs at a time. A second request during a check is refunded with a short "already running" message.
- Twitch rewards are fulfilled on success and refunded on an empty or failed check. Kick rewards start a check but cannot be refunded automatically.
- Each redemption can post up to 2 newly found games to Discord (max 5). Games already posted are not posted again.
- Your Discord webhook stays inside Streamer.bot. StreamBridge never sees or logs it, and Discord mentions are turned off.
- Replies go only to the chat the request came from.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Free-Game-Check-4.0.64.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Free-Game-Check-4.0.64.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Free-Game-Check-4.0.64.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Free Game Check`

- `THSV Addon - Free Game Check - Refresh` in `THSV Addon - Free Game Check`
- `THSV Addon - Free Game Check - Discord Deliver` in `THSV Addon - Free Game Check`
- `THSV Addon - Free Game Check - Settle Twitch Reward` in `THSV Addon - Free Game Check`

All three actions stay triggerless. Viewer rewards and commands reuse the main platform intakes. Refresh runs only for a matching viewer request and can call only the fixed GamerPower HTTPS endpoint. Discord Deliver and Settle Twitch Reward require one-use broker tokens; the webhook stays in its private Set Argument.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.free-game-check` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Free Game Check |  | Off |
| Twitch Free Games reward ID | Use a pending Twitch reward so empty or failed checks can be refunded. | (blank) |
| Kick Free Games reward ID | Kick rewards start checks but cannot currently be settled automatically by Streamer.bot. | (blank) |
| YouTube and TikTok command |  | `freegames` |
| YouTube and TikTok points cost | Viewer Foundation points are refunded when no games are available or the lookup fails. | 100 |
| Discord invite link shown in chat | Your own https://discord.gg/... or https://discord.com/invite/... link. Leave blank to list the free games in chat instead. | (blank) |
| Games-available chat message | Available variables: {name}, {discord}, and {count}. | `{name}, new free games are available. View and redeem them in Discord: {discord}` |
| No-games chat message | Available variable: {name}. Supported refunds are added automatically. | `{name}, no free games are available right now.` |
| Lookup-failed chat message | Available variable: {name}. Supported refunds are added automatically. | `{name}, I could not check the free-game list right now.` |
| Maximum new Discord posts per redemption |  | 2 |
| Post newly discovered games to Discord |  | Off |
| Discord destination type |  | `channel` |
| Existing Discord forum-post ID (optional) |  | (blank) |
| New forum-post name | Use {title} for the game title. | `Free Game - {title}` |
| Discord display name |  | `THSV Free Game Check` |

## Health checks

- **thsv.free-game-check.runtime:** Confirms redemption-only giveaway lookup, source-chat guidance, and supported refund paths are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`, `streamerbot.run-approved-action`, `chat.send`.

Private storage: `data/addons/thsv.free-game-check/`, `data/addons/.state/thsv.free-game-check/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling preserves only bounded request, giveaway, cooldown, and delivery status.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
