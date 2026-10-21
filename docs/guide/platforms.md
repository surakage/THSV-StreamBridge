# Platforms

## What it is

StreamBridge collects chat and events from each platform and treats them the same way. Twitch, YouTube and Kick come in through Streamer.bot. TikTok comes in through TikFinity and Streamer.bot. A Facebook Page connects straight from the wizard.

StreamBridge never asks for your platform passwords. Those logins stay in Streamer.bot and TikFinity.

## What you need

- Streamer.bot with the platform accounts you use already connected.
- The one Streamer.bot import done ([Streamer.bot import and approval](streamerbot-import-and-approval.md)).
- For TikTok: TikFinity. For Facebook: a Page you manage and a Page access token.

## Set it up (all platforms)

1. In the wizard, open **Platforms**.
2. On each platform card, tick **Platform enabled** and **Input enabled** only for platforms you use. Leave the rest off.
3. Select **Save with backup** in the bar at the top, then **Restart safely**.
4. Turn on one platform, test it, then do the next.

Each card lists what that platform supports and its known limits. **Output enabled** is saved but no current feature uses it yet.

## Twitch

- **Supports:** chat and commands, follows, subs, gift subs, cheers (Bits), raids and channel point redemptions. Emotes (including BTTV, FrankerFaceZ and 7TV) show in the chat overlay.
- **Connect:** connect Twitch in Streamer.bot. The import puts all triggers on **THSV Twitch - Intake** for you.
- **Rewards:** viewers use your own channel point rewards. Features match them by reward ID, which you copy from Twitch or Streamer.bot. StreamBridge does not create rewards. Twitch rewards keep their own limits and cooldowns, and features can refund a Twitch redemption.
- **Create rewards in Streamer.bot** (**Platforms > Twitch > Channel Point Rewards**, right-click, **Add**) so Streamer.bot owns them and can refund them. Then right-click the reward and choose **Copy Reward Id**, and paste it into the feature's **Twitch reward ID** box.

## Kick

- **Supports:** chat and commands, follows, subs, gift subs and channel reward redemptions.
- **Connect:** connect Kick in Streamer.bot. Triggers go on **THSV Kick - Intake** through the import.
- **Limits:** Streamer.bot does not offer a way to change, fulfil or refund Kick rewards. So StreamBridge cannot refund Kick points if a claim is rejected, and Kick rewards have no per-stream limit or cooldown of their own. Some features (for example [Streamer Punishments](../addons/streamer-punishments.md)) add their own Kick cooldowns. Leave **Redemption Skips Queue** off on Kick rewards so you can reject blocked ones yourself.
- **Create rewards in Streamer.bot** (**Platforms > Kick > Rewards**, right-click, **Add**). Right-click a reward, choose **Copy Reward Id**, and paste it into the feature's **Kick reward ID** box.

## YouTube

- **Supports:** chat and commands, new subscribers (treated like follows), memberships and gifted memberships, Super Chats, Super Stickers and Jewels.
- **Connect:** connect YouTube in Streamer.bot. Triggers go on **THSV YouTube - Intake** through the import.
- **Rewards:** YouTube has no channel points here. Viewers use StreamBridge points and a chat command instead. See [Points and !buy](points-and-buy.md).

## TikTok (TikFinity)

- **Supports:** chat, follows, gifts, like milestones and subscriptions.
- **Connect:**
  1. Install TikFinity and sign in with your TikTok account.
  2. In Streamer.bot, open **Servers/Clients > WebSocket Server**: Address `127.0.0.1`, Port `8080`, Endpoint `/`, **Auto Start** on.
  3. Do the one import. Its **Always included** part adds `THSV TikTok - Chat`, `Follow`, `Gift`, `Like` and `Subscription`.
  4. In TikFinity, point Streamer.bot at Address `127.0.0.1`, Port `8080`, Endpoint `/`, then run **Test Connection**.
  5. In TikFinity, map Chat, Follow, Gift, Like and Subscription to the matching THSV actions.
  6. In TikFinity, turn on **Allow Streamer.bot to push messages to TikFinity** so StreamBridge can reply in TikTok chat.
  7. Enable **tiktok** on the wizard's **Platforms** page and restart StreamBridge, then send a TikFinity test event.
  8. Optional: on **Streamer.bot**, choose TikFinity under the programs for one-button startup and tick **Start automatically**.
- **Limits:** TikFinity does not give a stable event ID, so TikTok data is marked as less certain. Viewers use StreamBridge points instead of channel points.

## TikTok LIVE Studio

TikTok LIVE Studio is not a chat source. StreamBridge can start it for you and help with going live:

1. On **Streamer.bot**, under **Exact programs for one-button startup**, select **Choose TikTok LIVE Studio Launcher** and tick **Start automatically** if you want.
2. Optional: tick **Go LIVE and End LIVE together with OBS**. When OBS starts streaming, StreamBridge turns on OBS Virtual Camera and presses Go LIVE. When OBS stops, it presses End LIVE. This needs LIVE Studio open and its official Stream Deck plugin installed.
3. Without that option, the tray icon reminds you to go live and end live on TikTok. Clicking the reminder opens LIVE Studio.

## Facebook Page (experimental)

- **Supports:** live comments into the chat overlay, follower and Page-like **total** milestones, and optional timed comments posted as your Page.
- **Connect:**
  1. On **Platforms**, open **Facebook Page > Page connection**.
  2. Enter your **Page ID or username**, the **API version** and your **Page access token**, then select **Verify and save**.
  3. Select **Enable Facebook** when ready.
  4. Optional: set up **Follower & Page-like alerts** and **Timed messages**.
- **Get a Page access token that does not expire:**
  1. Open the Meta **Graph API Explorer** and choose your Meta app.
  2. Select **Get User Access Token** with `pages_show_list`, `pages_read_engagement` and `pages_read_user_content`, plus `pages_manage_engagement` if you want timed comments. Approve it for your Page.
  3. Paste that token into the **Access Token Debugger** and select **Extend Access Token**. Copy the longer token.
  4. Back in the Explorer, use the longer token to run `me/accounts`. Copy your Page's `access_token` and paste it into **Page connection**.

  A Page token made this way does not expire unless you change your Facebook password or remove the app. Never paste a token into chat or a support message.
- **Limits:** the token needs read permissions, plus `pages_manage_engagement` for timed comments. Reconnect when the token expires. Named follows, Stars, subscriptions and rewards are not supported. Old comments are not replayed. Some features do not accept Facebook yet. Full details: [Facebook Page comments](../facebook-page-comments.md).

## Ko-fi

- **Supports:** tips, shown as alerts. They also count for the Bean Boozled wheel and the subathon timer.
- **Connect:**
  1. In Streamer.bot, open **Integrations > Ko-fi** and follow its steps to give Ko-fi the webhook address and your Ko-fi **verification token** (on Ko-fi under **More > API**).
  2. Do the one import with **Ko-fi Donations** ticked. Attach only the **Ko-fi > Donation** trigger to `THSV Addon - Ko-fi Donations - Intake`.
  3. Turn on Ko-fi Donations in the wizard.

## Apps Streamer.bot controls for features

| App | Connect it in Streamer.bot | Used by |
| --- | --- | --- |
| OBS Studio | **Stream Apps > OBS** (connection 0) | Scene switching, Streamer Punishments filters |
| Streamfog | **Integrations > StreamFog** with **Auto Connect** and **Auto Reconnect** on | Face Filters lenses |
| Voicemod | **Integrations > VoiceMod** with **Auto Connect** and **Auto Reconnect** on | Face Filters voices |
| Speaker.bot | **Integrations > Speaker.bot** | Village Voice text-to-speech |

On the wizard's **Streamer.bot** page, tick **Start automatically** for each app, so one launch opens everything in the right order. Apps that are already open are skipped.

## Check it works

1. Use a Streamer.bot test trigger (or a TikFinity test event) for one platform.
2. In Streamer.bot **Action History**, the platform's intake action runs once.
3. A test chat message appears once in the chat overlay preview on **Chat Overlay**.

## Common problems

- **Nothing arrives from a platform.** Check **Platform enabled** and **Input enabled** are both ticked, you saved and restarted, and the account is connected in Streamer.bot.
- **Events arrive twice.** Remove hand-added platform triggers. See [Streamer.bot import and approval](streamerbot-import-and-approval.md).
- **Facebook says authorization failed.** Your token expired or lost permissions. Paste a new one in **Page connection**.

For depth, read [Streamer.bot setup](../streamerbot-setup.md), [Channel rewards](../rewards.md) and the [Compatibility matrix](../compatibility.md).
