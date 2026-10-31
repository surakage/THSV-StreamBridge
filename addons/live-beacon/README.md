# Live Beacon

Live Beacon posts a "we're live" notification to your Discord server when you start streaming. Each platform you choose (Twitch, YouTube, Kick, TikTok, Facebook) gets its own Discord embed with the stream title, game or category, a direct watch link and the start time. It can also show your profile picture, category art and a stream preview. Your Discord webhook is saved once in StreamBridge, encrypted for your Windows account.

## What you need
- A Discord webhook for the channel or forum where notifications should appear, added under **Platforms > Discord webhooks**. Recommended: one forum called "Live Notifications" with one webhook.
- Only for TikTok (or another platform without its own "went live" event): the Live Beacon Streamer.bot import. Attach exactly one trigger to **THSV Addon - Live Beacon - Broadcast Started**: OBS Studio, Meld Studio or Streamlabs Desktop **Streaming Started**.
- Facebook needs the Facebook Page connection in StreamBridge if you want Facebook announcements.
- No overlay or rewards.

## Set it up
1. In Discord, create the webhook in your chosen channel or forum and copy its link.
2. In the Setup Wizard, go to **Platforms > Discord webhooks**, give it a name, paste the link, choose **Add webhook** and **Save**.
3. If you stream on TikTok, import the Live Beacon package in Streamer.bot and attach your broadcast app's **Streaming Started** trigger to **Broadcast Started**. Use only one app.
4. Open **Extensions > Broadcast Director > Live Beacon**. Pick the platforms to announce and choose your webhook under **Discord webhook**. Keep TikTok under "Platforms started by broadcast-app fallback".
5. Set the destination type (channel or forum) to match where you made the webhook. Leave each platform on **Use the main webhook** unless that platform posts somewhere else.
6. Forums only: choose **Create for me** (Live Beacon makes one post per platform on its first real go-live and reuses it) or **Use existing posts** (turn on Discord Developer Mode, right-click each post, Copy Channel ID, paste it into the wizard).
7. Enter your Twitch login, YouTube channel URL, Kick login, TikTok @handle and Facebook Page live URL as needed. Plain names and full profile URLs both work.
8. Optional: add a role ID to mention, and edit the message and the welcome text for new posts.
9. Turn on **Enable Live Beacon**, save, and restart StreamBridge if asked.
10. Test by actually going live. Streamer.bot's trigger **Test** button is ignored on purpose, so a test never pings your Discord role. **Send test** under Discord webhooks checks the webhook itself.

## Good to know
- Platforms that start within 15 seconds of each other are collected together, but each still gets its own embed.
- During a multistream, missing titles or categories can be filled from another live platform. Each embed keeps its own link and start time.
- TikTok and other fallback announcements know the start time and link, but not the title or category.
- Missing details are left out, never guessed.
- Only the role ID you set can be mentioned. If Discord rate-limits a post, StreamBridge waits and tries once more.
- Separate Discord destinations per platform: add one webhook per destination under Discord webhooks, then pick it under that platform's webhook and set its destination type.
- Upgrading from an older version: the Streamer.bot **Deliver** action is no longer used. Add your webhook under Discord webhooks, then delete Deliver and remove its approval.
