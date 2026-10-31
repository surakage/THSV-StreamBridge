# Discord Chat Archive

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
