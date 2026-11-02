# Viewer Spotlight

**Module:** `thsv.viewer-spotlight` · **Version:** `4.1.8` · **Built in (extension)**

Displays privacy-gated viewer cards, presentation modes, and aggregate Stream Score from bounded projections.

Viewer Spotlight lets a viewer put their own "viewer card" on screen for a few seconds. The card shows their name, platform, points, level and latest achievement, and you can choose to add more stats. Twitch and Kick viewers ask for a card with a channel point reward; YouTube, TikTok and Facebook viewers type `!card` and pay with StreamBridge points.

## What you need
- The **Viewer Foundation** and **Community Analytics** add-ons, installed and enabled first. A viewer needs to have been seen by Community Analytics before they can get a card.
- A browser source for the cards. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.viewer-spotlight`).
- For Twitch and Kick: a Viewer Spotlight channel point reward on each. Paste the reward IDs into the wizard.
- The Viewer Spotlight Streamer.bot package, kept triggerless. Approve **THSV Addon - Viewer Spotlight - Settle Reward** if you use Twitch rewards.
- Optional: a Discord webhook added under **Platforms > Discord webhooks**, if you want cards posted to Discord.

## Set it up
1. Make sure Viewer Foundation and Community Analytics are enabled.
2. Open Setup Wizard > Extensions, install Viewer Spotlight.
3. Review which fields appear on the public card. Points, level, latest achievement, platform badge and avatar are on by default; message counts, session counts, engagement score and monthly rank are off.
4. Tick "I understand selected viewer statistics will appear publicly on the overlay", then enable the add-on.
5. For Twitch and Kick, turn on "Allow Twitch and Kick reward requests" and paste each reward ID.
6. Set the `!card` price for YouTube, TikTok and Facebook (100 points by default).
7. Pick a presentation mode (single card, fade carousel or credits scroll) and the card colors and font.
   To post cards to Discord too, turn on **Enable Discord snapshots** and choose your webhook under **Discord webhook**.
8. Add the overlay URL to an OBS browser source and restart StreamBridge.
9. To test the look offline, use the wizard preview; it shows fake values only. You can also show a card for one viewer from the Manual viewer card section of the wizard.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!card` | Viewers on YouTube, TikTok and Facebook while you are live | Spends points and queues the viewer's own card. It never shows another viewer's card. |

## Good to know
- Each viewer can get one card every 15 minutes, with at least 10 seconds between any two cards. Up to 8 cards wait in line, requests expire after 120 seconds, and there is a limit of 50 cards per stream.
- Points are refunded when a card cannot be shown. Twitch rewards are refunded too when "Refund rejected or expired requests" is on. Kick claims cannot be refunded automatically.
- Requests only work while that platform is live. When the stream ends, waiting cards are dropped and refunded.
- Privacy: names and avatars are only kept in memory for the queue and are never saved. If you delete a viewer in Viewer Foundation, their card disappears right away.
- Upgrading from an older version: the Streamer.bot **Discord Snapshot** action is no longer used. Add your webhook under Discord webhooks, then delete that action and remove its approval.
- The wizard also has a **Show current Stream Score** button that shows total viewer and interaction counts for the stream, with no names.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Viewer Spotlight`

- `THSV Addon - Viewer Spotlight - Settle Reward` in `THSV Addon - Viewer Spotlight`

Settle Reward remains triggerless and requires one-use broker tokens. Discord snapshots are posted by StreamBridge from the shared Discord webhook list.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.viewer-spotlight` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Viewer Spotlight |  | Off |
| I understand selected viewer statistics will appear publicly on the overlay |  | Off |
| Self-request command | Registered automatically through the main chat intakes after restart. A viewer may request only their own card. | `card` |
| Allowed request platforms |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Allow Twitch and Kick reward requests |  | Off |
| Owned Twitch reward ID | Exact Streamer.bot-owned reward ID. Other redemptions are ignored. | (blank) |
| Kick reward ID | Exact Kick reward ID. Kick claims cannot be automatically refunded by Streamer.bot's current documented API. | (blank) |
| YouTube and TikTok card cost |  | 100 |
| Refund rejected or expired requests |  | On |
| Enable Discord snapshots | Posts the card text to the Discord webhook chosen below. | Off |
| Discord webhook | Choose the channel or forum webhook from your Discord webhooks (Platforms > Discord webhooks). | (blank) |
| Send accepted reward cards to Discord |  | Off |
| Discord destination |  | `channel` |
| Discord webhook display name |  | `THSV Viewer Spotlight` |
| Per-viewer cooldown (minutes) |  | 15 |
| Minimum time between cards (seconds) |  | 10 |
| Maximum queued cards |  | 8 |
| Drop queued requests after (seconds) |  | 120 |
| Maximum cards per stream session |  | 50 |
| Card duration (seconds) |  | 10 |
| Ignored Viewer Foundation IDs |  | (none) |
| Show source-platform badge |  | On |
| Show validated profile picture when supplied |  | On |
| Show Viewer Foundation points |  | On |
| Show Viewer Foundation level |  | On |
| Show latest unlocked achievement |  | On |
| Show observed session count | Approximate local observations, not watch time. | Off |
| Show observed message count | Lifetime local count retained by Community Analytics. | Off |
| Show observed command count | Lifetime local count retained by Community Analytics. | Off |
| Show capped monthly engagement score | Appears only when Community Analytics scoring is enabled and the viewer has a current-month observation. | Off |
| Show protected monthly rank | Appears only after Community Analytics reaches its configured minimum viewer cohort. | Off |
| Presentation mode |  | `single` |
| Card background |  | `glass` |
| Background color |  | `#140d1f` |
| Background opacity |  | 0.94 |
| Accent color |  | `#7ff5cc` |
| Text color |  | `#ffffff` |
| Font |  | `broadcast` |

## Health checks

- **thsv.viewer-spotlight.runtime:** Confirms bounded self-request handling and projection-only overlay publication.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `overlay.publish`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`, `community.analytics.read`, `streamerbot.run-approved-action`, `discord.post`, `chat.send`.

Private storage: `data/addons/thsv.viewer-spotlight/`, `data/addons/.state/thsv.viewer-spotlight/`.

Dependencies: `thsv.viewer-foundation`, `thsv.community-analytics`.

## Remove or repair

1. Uninstall the add-on. Its pseudonymous cooldown state remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
