# Live Beacon

Live Beacon posts a "we're live" notification to your Discord server when you start streaming. Each platform you choose (Twitch, YouTube, Kick, TikTok, Facebook) gets its own Discord embed with the stream title, game or category, a direct watch link and the start time. It can also show your profile picture, category art and a stream preview. Your Discord webhook stays inside Streamer.bot.

## What you need
- A Discord webhook for the channel or forum where notifications should appear. Recommended: one forum called "Live Notifications" with one webhook.
- The Live Beacon Streamer.bot import:
  - **THSV Addon - Live Beacon - Deliver**: keep it triggerless and approve it for this add-on. Your webhook goes here.
  - **THSV Addon - Live Beacon - Broadcast Started**: only needed for TikTok (or another platform without its own "went live" event). Attach exactly one trigger: OBS Studio, Meld Studio or Streamlabs Desktop **Streaming Started**.
- Facebook needs the Facebook Page connection in StreamBridge if you want Facebook announcements.
- No overlay or rewards.

## Set it up
1. In Discord, create the webhook in your chosen channel or forum and copy its URL.
2. In Streamer.bot, import the Live Beacon package. Open **Deliver**, replace `REPLACE_WITH_PRIVATE_DISCORD_WEBHOOK_URL` in the `liveBeaconWebhookUrl` argument with your webhook URL, then Save and Compile.
3. If you stream on TikTok, attach your broadcast app's **Streaming Started** trigger to **Broadcast Started**. Use only one app.
4. Open Setup Wizard > Extensions > Broadcast Director > Live Beacon. Approve **Deliver**.
5. Pick the platforms to announce. Keep TikTok under "Platforms started by broadcast-app fallback".
6. Set the destination type (channel or forum) to match where you made the webhook. Leave each platform on the shared webhook unless you added extra webhooks.
7. Forums only: choose **Create for me** (Live Beacon makes one post per platform on its first real go-live and reuses it) or **Use existing posts** (turn on Discord Developer Mode, right-click each post, Copy Channel ID, paste it into the wizard).
8. Enter your Twitch login, YouTube channel URL, Kick login, TikTok @handle and Facebook Page live URL as needed. Plain names and full profile URLs both work.
9. Optional: add a role ID to mention, and edit the message and the welcome text for new posts.
10. Turn on **Enable Live Beacon**, save, and restart StreamBridge if asked.
11. Test by actually going live. Streamer.bot's trigger **Test** button is ignored on purpose, so a test never pings your Discord role.

## Good to know
- Platforms that start within 15 seconds of each other are collected together, but each still gets its own embed.
- During a multistream, missing titles or categories can be filled from another live platform (Twitch first). Each embed keeps its own link and start time.
- TikTok and other fallback announcements know the start time and link, but not the title or category.
- Missing details are left out, never guessed. Failed image lookups do not stop the post.
- Only the role ID you set can be mentioned. Discord rate limits are retried a few times.
- Advanced: for separate Discord destinations per platform, add `liveBeaconTwitchWebhookUrl`, `liveBeaconYouTubeWebhookUrl`, `liveBeaconKickWebhookUrl` or `liveBeaconTikTokWebhookUrl` to Deliver and set that platform's destination type in the wizard.
