# Facebook Page (experimental)

## What it is

Facebook is the one platform that does **not** go through Streamer.bot. StreamBridge connects straight to your **Facebook Page** from the wizard, using a **Page access token** you create in Meta's developer tools. It then checks your Page's live video for new comments every few seconds.

This connection is marked **Experimental** in the wizard. It works for reading live comments, follower and Page-like totals, and posting timed comments, but it has not had the full public testing the other platforms have.

## What StreamBridge gets from Facebook

| What | Details |
| --- | --- |
| Live comments | Shown in the chat overlay (in Facebook blue) and used for chat commands. Checked about every 5 seconds while you are live, the newest 100 comments each time. |
| Follower and Page-like **milestones** | Alerts when your Page's **total** followers or likes pass a step you choose (for example every 10). Individual follower names are not available. |
| Live started and ended | Your Page going live or ending tells timed features about it. |
| Live viewer count | How many people are watching right now, read about every 30 seconds while you are live. Shown on the [Viewer counter](../obs-and-overlays.md) and on the **Facebook Page** status line. |
| Timed comments (optional) | Your Timed Actions can post comments **as your Page** while you are live. |

Not supported: named follows, Stars, subscriptions, channel rewards, moderation, and automatic chat replies. Feature replies (for example to `!points`) are **not** posted on Facebook; only timed comments are. Some features do not accept Facebook at all yet (for example [First Five](../../addons/first-five.md)).

Comments that were already there when StreamBridge connected are skipped, so old comments never run as new commands.

## How it connects

```text
Your Facebook Page live video -> Meta Graph API -> StreamBridge (checks every few seconds)
```

- No Streamer.bot import and no Streamer.bot triggers are needed for Facebook.
- The Page access token is saved encrypted for your Windows account on this PC. The token box empties after you save, and the token is never shown again or written to the logs.
- If you move to another PC or Windows account, paste the token again.

## What you need

- A Facebook **Page** that you manage (not a personal profile).
- A free Meta developer account and a Meta **app** of your own at [developers.facebook.com](https://developers.facebook.com/).
- A **Page access token** with these permissions:

| Permission | Why |
| --- | --- |
| `pages_show_list` | To list your Pages and get the Page token (the `me/accounts` step below) |
| `pages_read_engagement` | To read your Page, its live videos, comments, and follower and like totals |
| `pages_read_user_content` | To read who wrote each comment. Without it, names may show as "Facebook Viewer". |
| `pages_manage_engagement` | **Only** if you want timed comments posted as your Page |
| `publish_video` | **Only** if the status line says "Live viewers unavailable". Some apps need it before Facebook shares the live viewer count. |

You do **not** need `pages_manage_metadata` or webhook permissions. StreamBridge checks for new comments itself.

## Set it up

### 1. Make a long-lived Page access token

A normal token from Meta expires after about an hour. These steps turn it into a Page token that keeps working.

1. Go to [developers.facebook.com](https://developers.facebook.com/), select **My Apps** and create an app if you do not have one. Choose a type that offers the Pages permissions (Business is the usual choice).
2. Open the **Graph API Explorer** (the wizard links to it under **Platforms > Facebook Page > Setup help & limitations**).
3. On the right, under **Meta App**, choose **your app**.
4. Under **User or Page**, choose **Get User Access Token**.
5. Under **Permissions**, add `pages_show_list`, `pages_read_engagement` and `pages_read_user_content`. Add `pages_manage_engagement` too if you want timed comments.
6. Select **Generate Access Token**. Log in, choose **your Page** when Facebook asks which Pages to allow, and accept.
7. Copy the token from the **Access Token** box.
8. Open the **Access Token Debugger** (`developers.facebook.com/tools/debug/accesstoken`), paste the token and select **Debug**.
9. At the bottom, select **Extend Access Token**. Copy the new, long-lived token it shows.
10. Back in the **Graph API Explorer**, paste the long-lived token into the **Access Token** box.
11. In the query box, enter `me/accounts` and select **Submit**.
12. In the result, find your Page. Copy its `access_token` (this is the **Page access token**) and its `id` (your **Page ID**).
13. Optional check: paste that Page token into the **Access Token Debugger**. It should say the token type is **Page**. A Page token made from a long-lived user token normally shows no expiry.

Keep the token private. Never paste it into chat, support messages or on stream.

### 2. Connect it in the wizard

1. In the wizard, open **Platforms** and scroll to **Facebook Page**.
2. Open **Page connection**.
3. **Page ID or username**: paste the Page `id` from step 12. A numeric ID is the safest; a username is looked up for you if it works.
4. **API version**: leave what the wizard shows (it must look like `v26.0`) unless your Meta app needs another version.
5. **Page access token**: click the box and paste the Page token.
6. Select **Verify and save**. StreamBridge checks that the token belongs to **this Page** (not your user account or another Page) and that it can read the Page's live videos. Saving leaves collection off.
7. Select **Enable Facebook** at the top of the Facebook card. No restart is needed.

### 3. Optional: follower and Page-like alerts

1. Open **Follower & Page-like alerts**.
2. Tick **Enable milestone alerts**, then **Followers** and/or **Page likes**.
3. Set **Alert every** (1 means every increase, 10 means every 10).
4. Keep **Only while the Page is live** ticked unless you want alerts while offline.
5. Select **Save alerts**, then **Test access** to check the totals can be read. The test shows no alert.

The first check only records your current totals. Alerts start from the next step after that. The Alerts editor has a Facebook milestone style.

### 4. Optional: timed comments as your Page

1. Make sure the token has `pages_manage_engagement` (redo step 1 if not).
2. Open **Timed messages** and tick **Allow scheduled comments**.
3. Open the **Timed Actions** page, open or create a timed message, and tick **Facebook Page live comments** under **Platforms that receive the message**. Save with backup.
4. Posting needs exactly **one** live broadcast on your Page. Comments are 1 to 500 characters. Tests never post, and a failed post is not retried automatically. Failures show on **Diagnostics**.

## Going live on Facebook

StreamBridge does not start the Facebook broadcast; you go live the usual way, and StreamBridge notices within about 30 seconds.

1. On your computer, open **Meta Live Producer** (on Facebook select **Live video**, or go to `facebook.com/live/producer`) and choose to post as **your Page**, not your profile.
2. Choose **Streaming software** as the video source.
3. Turn on **Use a persistent stream key** so the key stays the same every stream, then copy the **stream key**.
4. In OBS: **Settings > Stream**, set **Service** to **Facebook Live**, paste the stream key and save. If you stream to several platforms at once, add Facebook as another output in your multistream plugin or service instead (for example Aitum Multistream or Restream), using the same key.
5. Fill in the title and description in Live Producer, then select **Start Streaming** in OBS.
6. When the preview in Live Producer shows your stream, select **Go live**.

Within about 30 seconds the **Facebook Page** status line changes, Facebook comments start appearing in the chat overlay, and the viewer counter shows Facebook. When you end the broadcast in Live Producer (or stop streaming), StreamBridge marks Facebook offline and removes it from the viewer counter.

If you only want to test: start a broadcast with **Who can see this** set to **Only me**. StreamBridge reads it the same way.

## Rewards and points

Facebook has no channel rewards in StreamBridge. Facebook viewers earn **StreamBridge points** by chatting. Features that accept Facebook let them spend points with a command. For example, `!buy` in [Streamer Punishments](../../addons/streamer-punishments.md) works on Facebook by default. Because replies are not posted on Facebook, a Facebook viewer does not get a chat reply such as "not enough points". See [Points and !buy](../points-and-buy.md).

## Check it works

1. After **Verify and save**, the status line under **Facebook Page** shows your Page name.
2. Go live on your Page (a test broadcast is fine). Select **Test connection** in **Page connection**. You want "Live comments read succeeded. No comments were published by this test." If you are not live yet, it says "Page and broadcast access succeeded. Go live to verify comment access."
3. Post a **new** comment on the live video from another account. Within a few seconds it appears in the chat overlay preview on **Chat Overlay**.
4. The status line counts "new comments received". Select **Refresh** to update it.

## Common problems

- **"Facebook authorization expired or was revoked. Reconnect the Page."** The token expired, was removed, or your Facebook password or Page roles changed. Make a new token (step 1) and paste it in **Page connection**. StreamBridge stops retrying until you do.
- **"Facebook Page permissions are missing."** The token lacks one of the permissions above. Make a new token with all of them ticked and your Page selected.
- **"Use a Page access token belonging to the selected Page ..."** You pasted the user token from step 7 or 9, or another Page's token. Use the `access_token` of your Page from the `me/accounts` result.
- **"The Page lookup did not return a valid Page identity."** Use the numeric Page ID instead of a username.
- **"Enter a Page ID or username, Graph API version, and valid Page access token."** A field is empty, the version is not like `v26.0`, or the token was cut off when copying.
- **"Facebook could not be reached. Check your connection and API version."** Check your internet, and that the API version is one Meta still supports.
- **Comments show as "Facebook Viewer".** The token probably lacks `pages_read_user_content`.
- **Old comments did not appear.** That is on purpose: comments from before StreamBridge connected are skipped.
- **Timed comments do not post.** Check **Allow scheduled comments** is ticked, the token has `pages_manage_engagement`, Facebook is ticked on the timed action, and exactly one broadcast is live on your Page.
- **"Live viewers unavailable: ... missing permissions".** Facebook did not share the live viewer count with this token. Make a new token as in step 1, also ticking `publish_video`, and paste it in **Page connection**. Comments keep working either way.
- **Facebook does not appear on the viewer counter.** The count appears about 30 seconds after the broadcast goes live, and only for a broadcast on the connected **Page**. A broadcast on your personal profile is not read.
- **Very busy chat misses some comments.** StreamBridge reads the newest 100 comments every 5 seconds. Extremely fast chats can go over that.
- **"Facebook connection could not be loaded. Reconnect this Page on this computer."** The saved token cannot be opened by this Windows account (for example after moving PCs). Paste the token again.

More detail: [Facebook Page comments](../../facebook-page-comments.md).

Back to the [Platforms overview](../platforms.md).
