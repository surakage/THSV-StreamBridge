# Free Game Check

Free Game Check lets viewers ask whether any games are free to claim right now. When a viewer redeems it, StreamBridge does one lookup on the public GamerPower giveaway list. If games are available, the viewer's chat gets a short message pointing to your Discord. If none are found, the viewer gets their points back where the platform allows it. It never runs on a timer.

## What you need
- The **Viewer Foundation** add-on, if you want YouTube and TikTok viewers to use points.
- The Free Game Check Streamer.bot import. Keep both actions triggerless:
  - **THSV Addon - Free Game Check - Refresh** (approve it).
  - **THSV Addon - Free Game Check - Settle Twitch Reward** (approve it for Twitch fulfil and refund).
- A Twitch channel point reward called something like "Free Games". Paste the reward ID into the wizard.
- A Kick reward, if you stream on Kick. Paste the reward ID into the wizard.
- Optional: a Discord webhook for the channel or forum where new games should be posted, added under **Platforms > Discord webhooks**.

## Set it up
1. Install and enable Viewer Foundation first if you want the YouTube and TikTok command.
2. In Streamer.bot, import the Free Game Check package. Do not add triggers to any of its actions. Your reward redemptions already reach StreamBridge through its normal platform intake actions.
3. Create the Twitch reward. Keep **Skip Reward Queue** off so empty checks can be refunded. Create the Kick reward too if needed.
4. Open Setup Wizard > Extensions > Free Game Check. Paste the Twitch and Kick reward IDs.
5. Check the command name (default `freegames`) and point cost (default 100) for YouTube and TikTok.
6. Replace the Discord invite link with your own server's invite, and edit the chat messages if you like.
7. Optional: to post new games to Discord, turn on **Post newly discovered games to Discord**, choose your webhook under **Discord webhook**, and choose channel or forum.
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
- Your Discord webhook link is saved once in StreamBridge, encrypted for your Windows account. Free Game Check only sees its name, and Discord mentions are turned off.
- Upgrading from an older version: the Streamer.bot **Discord Deliver** action is no longer used. Add your webhook under Discord webhooks, then delete that action and remove its approval.
- Replies go only to the chat the request came from.
