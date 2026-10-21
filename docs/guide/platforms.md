# Platforms

## What it is

StreamBridge collects chat and events from each platform and treats them the same way: one chat overlay, one alerts overlay, and features that work across platforms. Each platform connects in its own way, and each has its own page with full steps.

StreamBridge never asks for your platform passwords. Those logins stay in Streamer.bot, TikFinity, or (for Facebook) in a Page token you create.

## At a glance

| Platform | How it connects | Chat | Alerts | Rewards / points | Needs the Streamer.bot import |
| --- | --- | --- | --- | --- | --- |
| [Twitch](platforms/twitch.md) | Streamer.bot's Twitch connection, then **THSV Twitch - Intake** | Yes, with emotes, badges, replies | Follows, subs, gift subs, cheers, raids | Twitch channel point rewards (can fulfil and refund) | Yes (included automatically) |
| [Kick](platforms/kick.md) | Streamer.bot's Kick connection, then **THSV Kick - Intake** | Yes, with badges and 7TV emotes | Follows, subs, gift subs, Kicks | Kick channel rewards (no refunds; StreamBridge adds cooldowns) | Yes (included automatically) |
| [YouTube](platforms/youtube.md) | Streamer.bot's YouTube connection, then **THSV YouTube - Intake** | Yes, with emotes and profile photos | New subscribers (as follows), memberships, gifted memberships, Super Chats, Super Stickers, Jewels | StreamBridge points and commands such as `!buy` | Yes (included automatically) |
| [Facebook Page](platforms/facebook.md) (experimental) | Directly from the wizard with a Page access token | Yes (read only; replies are not posted) | Follower and Page-like **total** milestones | StreamBridge points where a feature accepts Facebook | No |
| [TikTok](platforms/tiktok.md) | TikFinity sends events to Streamer.bot (`127.0.0.1:8080`), then the **THSV TikTok** actions | Yes | Follows, gifts, like milestones, subs | StreamBridge points and commands such as `!buy` | Yes (included automatically), plus mapping in TikFinity |

"Included automatically" means the platform's actions are in the **Always included** part of the one Streamer.bot import, and (for Twitch, Kick and YouTube) their triggers come attached. See [Where to find the Streamer.bot imports](streamerbot-imports.md).

## What you need

- Streamer.bot with the platform accounts you use connected (Twitch, Kick, YouTube), and its WebSocket server running.
- The one Streamer.bot import done ([Where to find the Streamer.bot imports](streamerbot-imports.md)).
- For TikTok: TikFinity. For a Facebook Page: a Page you manage and a Page access token.

## Set it up (all platforms)

1. Connect the platform where its page says (Streamer.bot, TikFinity, or the wizard for Facebook).
2. In the wizard, open **Platforms**.
3. On each platform card, tick **Platform enabled** and **Input enabled** only for platforms you use. Leave the rest off.
4. Select **Save with backup** in the bar at the top, then **Restart safely**.
5. Turn on one platform, test it, then do the next.

Each card lists what that platform supports and its known limits. **Output enabled** is saved but no current feature uses it yet. Facebook is not a card: it has its own **Facebook Page** section lower on the same page, with its own **Enable Facebook** button that needs no restart.

## Which page do I need?

### Twitch

Connect Twitch in Streamer.bot, do the import, tick the **twitch** card. Channel point rewards can be refunded when created in Streamer.bot with **Redemption Skips Queue** off. [Twitch setup](platforms/twitch.md)

### Kick

Like Twitch, but Kick rewards cannot be refunded or limited from outside Kick, so features add their own cooldowns and you reject blocked claims in the Kick queue. [Kick setup](platforms/kick.md)

### YouTube

Connect YouTube in Streamer.bot. Viewers use StreamBridge points. StreamBridge also re-applies a YouTube chat fix for Windows Smart App Control when it starts Streamer.bot. [YouTube setup](platforms/youtube.md)

### Facebook Page (experimental)

No Streamer.bot needed. Create a long-lived Page access token in Meta's Graph API Explorer and paste it into **Platforms > Facebook Page > Page connection**. [Facebook setup](platforms/facebook.md)

### TikTok

TikFinity sends chat and events to Streamer.bot. TikTok LIVE Studio can be started, and optionally put live and ended together with OBS. [TikTok setup](platforms/tiktok.md)

## Ko-fi tips

Ko-fi is not a streaming platform, but its tips come in the same way. Tips show as alerts and also count for the Bean Boozled wheel and the subathon timer.

1. In Streamer.bot, open **Integrations > Ko-fi** and follow its steps to give Ko-fi the webhook address and your Ko-fi **verification token** (on Ko-fi under **More > API**).
2. Make the one Streamer.bot import with **Ko-fi Donations** ticked. Attach only the **Ko-fi > Donation** trigger to `THSV Addon - Ko-fi Donations - Intake`.
3. Turn on Ko-fi Donations in the wizard. See [Ko-fi Donations](../addons/kofi-donations.md).

## Apps Streamer.bot controls for features

Some features talk to other apps through Streamer.bot. Connect each one in Streamer.bot first.

| App | Connect it in Streamer.bot | Used by |
| --- | --- | --- |
| OBS Studio | **Stream Apps > OBS** | Scene switching, Streamer Punishments filters |
| Streamfog | **Integrations > StreamFog**, with **Auto Connect** and **Auto Reconnect** on | Face Filters lenses |
| Voicemod | **Integrations > VoiceMod**, with **Auto Connect** and **Auto Reconnect** on | Face Filters voices |
| Speaker.bot | **Integrations > Speaker.bot** | Village Voice text-to-speech |

On the wizard's **Streamer.bot** page you can tick **Start automatically** for each app, so one launch opens everything. Apps that are already open are skipped. See [Tray, launcher and Stream Deck](tray-launcher-and-stream-deck.md).

## Check it works

1. Use a real test message, or a Streamer.bot (or TikFinity) test event, for one platform.
2. In Streamer.bot **Action History**, the platform's intake action runs once.
3. The message appears once in the chat overlay preview on **Chat Overlay**.
4. On **Diagnostics**, **Run pre-stream check** shows the platform as connected.

## Common problems

- **Nothing arrives from a platform.** Check **Platform enabled** and **Input enabled** are both ticked, you saved and restarted, and the account is connected in Streamer.bot (or TikFinity).
- **Events arrive twice.** Remove hand-added platform triggers, or a double mapping in TikFinity. See [Where to find the Streamer.bot imports](streamerbot-imports.md#common-problems).
- **Facebook says authorization failed.** Your token expired or lost permissions. Make a new one and paste it in **Page connection**. See [Facebook](platforms/facebook.md#common-problems).

For depth, read [Streamer.bot setup](../streamerbot-setup.md), [Channel rewards](../rewards.md) and the [Compatibility matrix](../compatibility.md).
