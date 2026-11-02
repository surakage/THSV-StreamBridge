# Discord Chat Archive

**Module:** `thsv.discord-chat-archive` · **Version:** `4.1.8` · **Built in (extension)**

Copies creator-selected normalized public chat to one Discord webhook chosen from your Discord webhooks, in bounded, privacy-gated batches.

Discord Chat Archive copies your public stream chat from Twitch, YouTube, Kick, TikTok and Facebook into a Discord channel or forum you own. Messages are collected for a few seconds and posted in small, tidy batches with platform colors. In forum mode, each live session (or offline day) gets its own forum post. Viewers do not see anything on stream, but their public messages are posted to your Discord.

## What you need
- A new private Discord webhook for the channel or forum that should hold the archive, added under **Platforms > Discord webhooks**. Treat its link like a password.
- Nothing else. Chat already reaches StreamBridge through your main platform intakes, including Facebook Page comments. No Streamer.bot import is needed.

## Set it up
1. In Discord, create a webhook for the channel or forum you want to use and copy its link.
2. In the Setup Wizard, go to **Platforms > Discord webhooks**, give it a name, paste the link, choose **Add webhook** and **Save**. Press **Send test** and check that a test message appears in Discord.
3. Go to **Extensions > Community Messaging > Discord Chat Archive** and choose your webhook under **Discord webhook**.
4. Choose **Discord destination**: normal channel or forum, to match your webhook. For forums you can set the post name and tag IDs.
5. Review platforms, ignored viewers and bots, appearance, batching and the privacy notice. Then tick **Enable Discord Chat Archive**, save and restart StreamBridge.
6. Test it: send a harmless chat message on one platform, wait for the batch window (5 seconds by default), and check Discord. In forum mode, send a second message and check it lands in the same post.

## Good to know
- Tell your viewers that public chat is being archived. Discord keeps the messages under that server's rules. Private, operator and system messages are never copied.
- The webhook link is stored encrypted for your Windows account and never shown again. If it ever shows up in a screenshot, stream or log, delete the webhook in Discord and make a new one.
- Ignore rules are exact and not case-sensitive: `nightbot` (any platform), `twitch:nightbot` (Twitch only) or `youtube:id:<user-id>` (one account, even after a name change). Common service bots are already listed, and detected bots are skipped.
- Limits: up to 10 messages per Discord post by default (max 20), up to 100 waiting messages (oldest dropped with a notice), and 500 characters per message. Failed posts are retried once by default.
- Discord mentions are switched off, so nobody gets pinged. Test events are not posted unless you allow simulated messages.
- StreamBridge writes no chat transcript to disk. Waiting messages are kept in memory only.
- Upgrading from an older version: the Streamer.bot **Deliver** action is no longer used. Add your webhook under Discord webhooks, then delete the **THSV Addon - Discord Chat Archive** group from Streamer.bot and remove its approval.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.discord-chat-archive` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Discord Chat Archive | Disabled by default. Complete the Discord and Streamer.bot setup first. | Off |
| Platforms to archive |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Discord webhook | Choose the archive channel or forum webhook from your Discord webhooks (Platforms > Discord webhooks). | (blank) |
| Ignore detected bot accounts | Uses StreamBridge's normalized human, bot, and system actor classification. | On |
| Ignored viewers and bots | Preloaded with common service bots. One exact value per line: username, platform:username, or platform:id:stable-user-id. Matching is case-insensitive. | `twitch:nightbot`, `twitch:streamelements`, `youtube:streamelements`, `kick:streamelements`, `twitch:fossabot`, `twitch:moobot`, `twitch:sery_bot`, `twitch:soundalerts`, `twitch:wizebot`, `twitch:kofistreambot`, `twitch:streamlabs`, `twitch:botrix`, `youtube:botrix`, `kick:botrix`, `tiktok:botrix` |
| Ignore command messages | Skips messages beginning with the saved command prefix. | Off |
| Command prefix |  | `!` |
| Allow simulated messages | Off by default so trigger tests cannot write to the real Discord channel. | Off |
| Discord destination | A normal channel receives ordered batches directly. A forum creates one post per live session or offline calendar day and appends later batches to it. | `channel` |
| Forum post name | Tokens: {community}, {date}, and {time}. {community} is your community name. The name is clamped to Discord's 100-character limit. | `{community} chat · {date} · {time}` |
| Forum tag IDs | Optional Discord forum tag snowflakes. Required-tag errors remain visible as delivery failures. | (none) |
| Archive layout | Clean embeds group consecutive messages by platform and add a colored platform edge. Plain text preserves the editable line template. | `clean-embeds` |
| Post a date and time header first | Posts one header at the beginning of each live session or offline calendar day. | On |
| Session header title | Token: {community} is your community name. | `{community} Stream Chat Archive` |
| Show time beside each viewer |  | On |
| Twitch color |  | `#9146ff` |
| YouTube color |  | `#ff0033` |
| Kick color |  | `#53fc18` |
| TikTok color |  | `#25f4ee` |
| Archived message format | Tokens: {time}, {date}, {platform}, {displayName}, {user}, {message}, and {channel}. Mentions are neutralized. | `[{time}] [{platform}] {displayName}: {message}` |
| Discord webhook display name | Used for normal batches. The private webhook URL stays in Streamer.bot and is never saved here. | `THSV Chat Archive` |
| Use viewer name for single-message deliveries | Off by default so Discord clearly identifies the archive bot instead of appearing to impersonate viewers. | Off |
| Use viewer profile picture for single messages |  | Off |
| Collect messages for (seconds) | Five seconds keeps the add-on below StreamBridge's approved-action rate limit while reducing Discord webhook calls. | 5 |
| Maximum messages per Discord post |  | 10 |
| Maximum messages waiting | When full, the oldest waiting message is omitted and a bounded notice is added to the next post. | 100 |
| Maximum characters copied from one chat message |  | 500 |
| Retry failed Discord posts | Retries stay in memory only and are discarded when StreamBridge stops. | 1 |
| Wait before retrying (seconds) |  | 10 |
| Report messages omitted by a full queue |  | On |
| Facebook color |  | `#1877f2` |

## Health checks

- **thsv.discord-chat-archive.runtime:** Confirms bounded public-chat filtering, batching, and Discord delivery are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `schedule.bounded`, `discord.post`.

Private storage: `data/addons/thsv.discord-chat-archive/`, `data/addons/.state/thsv.discord-chat-archive/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. No chat transcript is stored by StreamBridge.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
