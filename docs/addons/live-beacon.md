# Live Beacon

**Module:** `thsv.live-beacon` · **Version:** `4.0.64` · **Built in (extension)**

Announces selected live platforms with title, category, profile picture, category art and preview imagery, including shared metadata during multistreams.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Live Beacon`

- `THSV Addon - Live Beacon - Broadcast Started` in `THSV Addon - Live Beacon`

Broadcast Started accepts only creator-controlled broadcast-app start triggers and carries no secrets or viewer data. Discord posts are sent by StreamBridge from the shared Discord webhook list.

Creator-selected triggers:

- Attach exactly one active broadcast app trigger to Broadcast Started: OBS Studio > Streaming Started, Streamlabs Desktop > Streaming Started, or Meld Studio > Streaming Started.
- Use the wizard's fallback-platform selection only for platforms that lack a dependable provider start signal; TikTok is recommended.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.live-beacon` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Live Beacon |  | Off |
| Platforms to announce |  | `twitch`, `youtube`, `kick` |
| Discord webhook | Choose the channel or forum webhook from your Discord webhooks (Platforms > Discord webhooks). Every platform uses it unless you pick a different one below. | (blank) |
| Platforms started by broadcast-app fallback | Use only for platforms without a dependable native online event. TikTok is recommended. OBS, Meld, or Streamlabs Desktop Streaming Started then announces these selections. | `tiktok` |
| Shared webhook destination type | Choose the type of Discord destination where the main webhook was created. A forum webhook creates one new post per platform. | `channel` |
| Twitch webhook (optional) | Leave on the main webhook unless Twitch posts to a different channel or forum. | (blank) |
| YouTube webhook (optional) | Leave on the main webhook unless YouTube posts to a different channel or forum. | (blank) |
| Kick webhook (optional) | Leave on the main webhook unless Kick posts to a different channel or forum. | (blank) |
| TikTok webhook (optional) | Leave on the main webhook unless TikTok posts to a different channel or forum. | (blank) |
| Facebook webhook (optional) | Leave on the main webhook unless Facebook posts to a different channel or forum. | (blank) |
| Twitch webhook destination type | Use shared fallback unless Twitch has its own webhook. | `inherit` |
| YouTube webhook destination type | Use shared fallback unless YouTube has its own webhook. | `inherit` |
| Kick webhook destination type | Use shared fallback unless Kick has its own webhook. | `inherit` |
| TikTok webhook destination type | Use shared fallback unless TikTok has its own webhook. | `inherit` |
| Twitch existing forum-post ID | Optional. Paste the copied Discord channel ID for the existing Twitch notification post. | (blank) |
| YouTube existing forum-post ID | Optional. Paste the copied Discord channel ID for the existing YouTube notification post. | (blank) |
| Kick existing forum-post ID | Optional. Paste the copied Discord channel ID for the existing Kick notification post. | (blank) |
| TikTok existing forum-post ID | Optional. Paste the copied Discord channel ID for the existing TikTok notification post. | (blank) |
| Platform post setup | Choose whether Live Beacon creates and remembers the selected platform posts or uses IDs copied from posts you already created. | `create` |
| Twitch first welcome message |  | `Welcome to the official Twitch live notifications thread! Whenever {channel} goes live on Twitch, an automatic notification will be posted here with: 🎮 Game being streamed 📝 Stream title 🔗 Direct link to the stream ⏰ Time the stream started If Twitch is your preferred platform, keep an eye on this thread so you'll never miss a live stream. See you in chat, Villagers! 🌿` |
| YouTube first welcome message |  | `Welcome to the official YouTube live notifications thread! Every YouTube livestream will automatically be announced here with: 🎮 Game or category 📝 Stream title 🔗 Watch link ⏰ Stream start time Subscribe to the YouTube channel and follow this thread so you never miss a broadcast.` |
| Kick first welcome message |  | `Welcome to the official Kick live notifications thread! Whenever {channel} starts streaming on Kick, a notification will automatically appear here containing: 🎮 Game being streamed 📝 Stream title 🔗 Direct link to the stream ⏰ Stream start time If you enjoy watching on Kick, this is the place to stay updated.` |
| TikTok first welcome message |  | `Welcome to the official TikTok LIVE notifications thread! Whenever {channel} goes live on TikTok, an automatic notification will be posted here including: 🎮 Stream category 📝 Live title 🔗 Join the LIVE ⏰ Stream start time Perfect for anyone who prefers watching on TikTok.` |
| Combine platforms starting within (seconds) |  | 15 |
| Discord display name |  | `THSV Live Beacon` |
| Discord role ID to mention (optional) |  | (blank) |
| Notification message | One embed is posted per platform. Tokens: {platform}, {platforms}, {url}, {links}, {title}, {category}, {startedAt}. The embed always includes explicit detail fields when metadata exists. | `{platform} is live! Join the stream now.` |
| Twitch login or channel URL | Example: yourchannel. A full https://twitch.tv/... URL is also accepted and normalized. | (blank) |
| YouTube channel URL fallback | Use your @handle or channel URL. Live Beacon adds /live. A real Broadcast Started event uses its exact youtube.com/watch?v= link instead. | (blank) |
| Kick login or channel URL | Example: yourchannel. A full https://kick.com/... URL is also accepted and normalized. | (blank) |
| TikTok @handle or profile URL | Example: @yourhandle. Live Beacon creates https://www.tiktok.com/@handle/live. TikFinity does not document a native Stream Online trigger, so TikTok still needs an explicit creator-controlled start signal. | (blank) |
| Facebook webhook destination type | Use shared fallback unless Facebook has its own webhook. | `inherit` |
| Facebook existing forum-post ID | Optional. Paste the copied Discord channel ID for the existing Facebook notification post. | (blank) |
| Facebook first welcome message |  | `Welcome to the official Facebook live notifications thread! Whenever {channel} goes live on Facebook, an automatic notification will be posted here with: 🎮 Game or category 📝 Stream title 🔗 Direct link to the video ⏰ Stream start time See you in chat, Villagers! 🌿` |
| Facebook Page live URL fallback | Optional HTTPS Facebook Page /live URL. A genuine Facebook live event uses its associated video link first. Facebook announcements require selecting Facebook above; the Page integration supplies real online events. | (blank) |
| Facebook post setup (optional override) | Use the shared post setup, or create a Facebook post automatically while retaining existing posts for the other platforms. A supplied Facebook post ID always takes priority. | `inherit` |
| Fill missing details from other live platforms | During a multistream, fill missing title/category from an active platform, preferring Twitch. Each platform keeps its own link and start time. The delivery action can also read current Twitch metadata; offline streams are not used. | On |
| Show category art, profile picture and stream preview | Adds available creator profile imagery, category cover art and a large stream preview. Missing images or failed lookups never prevent the notification. | On |

## Health checks

- **thsv.live-beacon.runtime:** Confirms verified online events can produce guarded per-platform Discord deliveries.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `discord.post`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.live-beacon/`, `data/addons/.state/thsv.live-beacon/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded stream deduplication history remains preserved.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
