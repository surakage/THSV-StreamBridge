# Viewer Spotlight

Viewer Spotlight lets a viewer put their own "viewer card" on screen for a few seconds. The card shows their name, platform, points, level and latest achievement, and you can choose to add more stats. Twitch and Kick viewers ask for a card with a channel point reward; YouTube, TikTok and Facebook viewers type `!card` and pay with StreamBridge points.

## What you need
- The **Viewer Foundation** and **Community Analytics** add-ons, installed and enabled first. A viewer needs to have been seen by Community Analytics before they can get a card.
- A browser source for the cards. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.viewer-spotlight`).
- For Twitch and Kick: a Viewer Spotlight channel point reward on each. Paste the reward IDs into the wizard.
- The Viewer Spotlight Streamer.bot package, kept triggerless. Approve **THSV Addon - Viewer Spotlight - Settle Reward** if you use Twitch rewards. Approve **THSV Addon - Viewer Spotlight - Discord Snapshot** only if you want cards posted to Discord, and put your Discord webhook in that action's Set Argument in Streamer.bot.

## Set it up
1. Make sure Viewer Foundation and Community Analytics are enabled.
2. Open Setup Wizard > Extensions, install Viewer Spotlight.
3. Review which fields appear on the public card. Points, level, latest achievement, platform badge and avatar are on by default; message counts, session counts, engagement score and monthly rank are off.
4. Tick "I understand selected viewer statistics will appear publicly on the overlay", then enable the add-on.
5. For Twitch and Kick, turn on "Allow Twitch and Kick reward requests" and paste each reward ID.
6. Set the `!card` price for YouTube, TikTok and Facebook (100 points by default).
7. Pick a presentation mode (single card, fade carousel or credits scroll) and the card colors and font.
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
- The wizard also has a **Show current Stream Score** button that shows total viewer and interaction counts for the stream, with no names.
