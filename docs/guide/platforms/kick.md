# Kick

## What it is

Kick works like Twitch: Streamer.bot is connected to your Kick account, and the THSV import adds **THSV Kick - Intake**, which passes each Kick event on to StreamBridge. The big difference is rewards: Kick rewards cannot be refunded or limited from outside Kick, so StreamBridge adds its own safety checks.

## What StreamBridge gets from Kick

| Kick event | What StreamBridge does with it |
| --- | --- |
| Chat messages | Chat overlay and dock, chat commands. Shows Kick badges and 7TV emotes. Kick does not give a profile photo, so the overlay shows a colored initial instead. |
| Follows | Follow alert |
| Subscriptions and resubscriptions | Sub alert |
| Gift subs and mass gift subs | Gift sub alert (with how many) |
| Kicks gifted | Gift alert |
| Channel reward redemptions | Sent to features that use that reward ID |
| Stream online and offline | Tells timed features when you go live and end |

## How it connects

```text
Kick -> Streamer.bot (your Kick login) -> THSV Kick - Intake -> StreamBridge
```

- Your Kick login stays in Streamer.bot.
- All Kick triggers come inside the one Streamer.bot import, already attached to **THSV Kick - Intake**. You do not add them by hand.
- Chat replies from features go back to Kick chat through Streamer.bot.

## What you need

- Streamer.bot 1.0.7 or newer with its WebSocket server running.
- Your Kick account connected in Streamer.bot.
- The one Streamer.bot import done. See [Where to find the Streamer.bot imports](../streamerbot-imports.md).

## Set it up

### 1. Connect Kick in Streamer.bot

1. In Streamer.bot, open **Platforms > Kick** and its accounts page.
2. Connect your Kick **Broadcaster** account, and a bot account if you use one.
3. Turn on auto-connect so Kick connects when Streamer.bot starts.

### 2. Import the THSV actions

1. In the wizard, open **Streamer.bot > One Streamer.bot import**.
2. Select **Create & download one import**. The Kick intake is in **Always included**.
3. In Streamer.bot, select **Import**, drag the file in, keep overwrite on and import.
4. Back in the wizard, select **I finished importing — verify now**.

### 3. Turn Kick on in StreamBridge

1. In the wizard, open **Platforms**.
2. On the **kick** card, tick **Platform enabled** and **Input enabled**.
3. Select **Save with backup**, then **Restart safely**.

## Rewards (how Kick is different)

Kick viewers use your own **Kick channel rewards**, matched by reward ID. But Streamer.bot has no documented way to change, fulfil or refund a Kick reward. That means:

- **No automatic refunds.** If a feature has to turn a Kick redemption down, the viewer's Kick points are not given back automatically. Some features tell the viewer a mod can refund them.
- **No limits or cooldowns from Kick.** Kick rewards have no per-stream limit or cooldown of their own. So features that need them apply **their own** cooldowns and limits to Kick redemptions. For example, [Streamer Punishments](../../addons/streamer-punishments.md) has an exercise limit per stream, an exercise cooldown and a per-effect cooldown for Kick, and [Face Filters](../../addons/face-filters.md) applies its command cooldowns to Kick redemptions.
- **Blocked redemptions stay in your Kick queue.** Leave **Redemption Skips Queue** **off** on your Kick rewards. Then a redemption StreamBridge turned down stays in the Kick redemption queue, and you or a mod can **reject** it there to give the points back.

Set it up:

1. Create the reward on Kick, with **Redemption Skips Queue** off.
2. Copy the reward's **ID** (not its name) from Streamer.bot: under **Platforms > Kick > Rewards**, right-click the reward and choose **Copy Reward Id**.
3. Paste it into the feature's **Kick reward ID** box in the wizard (it is a separate box from the Twitch one) and save.

Kick viewers can also be allowed to buy with StreamBridge points in some features. See [Points and !buy](../points-and-buy.md) and [Channel rewards](../../rewards.md).

## Check it works

1. On **Diagnostics**, select **Run pre-stream check**. Kick should show as connected.
2. Type a message in your Kick chat. It appears once in the chat overlay preview on **Chat Overlay**.
3. In Streamer.bot's **Action History**, **THSV Kick - Intake** runs once, then **THSV StreamBridge - Receive Event**.
4. Redeem a cheap test reward and check the feature reacts. Redeem it again inside the cooldown and check it is turned down and stays in the Kick queue.

## Common problems

- **Nothing from Kick.** Check Kick is connected in Streamer.bot, both switches are ticked on the **kick** card, and you saved and restarted.
- **Kick reward redemptions never arrive.** Kick reward triggers need Streamer.bot 1.0.2 or newer. Update Streamer.bot, then re-import.
- **A Kick claim was not refunded.** That is expected. Reject it yourself in the Kick redemption queue.
- **Viewers can spam a Kick reward.** Set the feature's Kick cooldown in its settings, because Kick has none.
- **Events arrive twice.** Remove hand-added Kick triggers, or select **verify now** and let it repair.

Back to the [Platforms overview](../platforms.md).
