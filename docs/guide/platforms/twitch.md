# Twitch

## What it is

StreamBridge does not log in to Twitch itself. Streamer.bot is connected to your Twitch account, and the THSV import adds one action, **THSV Twitch - Intake**, that passes each Twitch event on to StreamBridge. StreamBridge then shows it in your chat overlay and alerts and hands it to your features.

## What StreamBridge gets from Twitch

| Twitch event | What StreamBridge does with it |
| --- | --- |
| Chat messages | Chat overlay and dock, chat commands. Keeps Twitch emotes, badges, name colors and profile photos. Also shows BTTV, FrankerFaceZ and 7TV emotes. Knows when it is a viewer's first message ever in your channel, and keeps reply information. |
| Follows | Follow alert |
| Subscriptions and resubscriptions | Sub alert (with tier and months) |
| Gift subs and gift bombs | Gift sub alert (with how many) |
| Cheers (Bits) | Cheer alert (with how many Bits) |
| Raids | Raid alert (with viewer count) |
| Channel point redemptions | Sent to features that use that reward ID |
| Stream online and offline | Tells timed features when you go live and end |

Twitch is the only platform where StreamBridge can also **fulfil or refund** a channel point redemption (see [Rewards](#rewards) below).

## How it connects

```text
Twitch -> Streamer.bot (your Twitch login) -> THSV Twitch - Intake -> StreamBridge
```

- Your Twitch login stays in Streamer.bot. StreamBridge never asks for it.
- All Twitch triggers come inside the one Streamer.bot import, already attached to **THSV Twitch - Intake**. You do not add them by hand.
- Chat replies from features (for example `!points`) go back to Twitch chat through Streamer.bot.

## What you need

- Streamer.bot 1.0.7 or newer with its WebSocket server running (the wizard's **Streamer.bot** page shows the port it expects, normally `8080`).
- Your Twitch account connected in Streamer.bot.
- The one Streamer.bot import done. See [Where to find the Streamer.bot imports](../streamerbot-imports.md).

## Set it up

### 1. Connect Twitch in Streamer.bot

1. In Streamer.bot, open **Platforms > Twitch > Accounts**.
2. Connect your **Broadcaster** account (the channel you stream on). Accept the permissions Streamer.bot asks for.
3. Optional: connect a separate **Bot** account if you want replies to come from a bot name.
4. Tick auto-connect in Streamer.bot so Twitch connects every time Streamer.bot starts.

### 2. Import the THSV actions

1. In the wizard, open **Streamer.bot > One Streamer.bot import**.
2. Select **Create & download one import**. The Twitch intake is in **Always included**.
3. In Streamer.bot, select **Import**, drag the file in, keep overwrite on and import.
4. Back in the wizard, select **I finished importing — verify now**.

Full steps: [Where to find the Streamer.bot imports](../streamerbot-imports.md).

### 3. Turn Twitch on in StreamBridge

1. In the wizard, open **Platforms**.
2. On the **twitch** card, tick **Platform enabled** and **Input enabled**. The card shows the adapter `streamerbot-native`.
3. Select **Save with backup** in the bar at the top, then **Restart safely**.

## Rewards

Twitch features use your own **channel point rewards**. StreamBridge does not create rewards for you.

1. Create the reward. If you want StreamBridge to be able to **refund** a viewer when something goes wrong, create the reward **in Streamer.bot**, so Streamer.bot owns it. Twitch only lets the app that created a reward change its redemptions.
2. For rewards a feature may refund, leave **Redemption Skips Queue** **off**. A redemption that skips the queue is already completed, so it cannot be refunded. The wizard's **Recommended reward blueprints** table (also in [Channel rewards](../../rewards.md#recommended-reward-blueprints)) says per feature whether the queue should be on or off.
3. Copy the reward's **ID** (not its name). In Streamer.bot, right-click the reward and choose **Copy Reward Id**.
4. Paste the ID into the feature's **Twitch reward ID** box in the wizard and save.

Twitch rewards keep their own limits and cooldowns (max per stream, cooldown), so set those on the reward itself. Some features, such as [Streamer Punishments](../../addons/streamer-punishments.md), rely on the reward's own limits on Twitch.

Viewers on Twitch normally use channel points, not StreamBridge points. Some features let you also allow `!buy` with StreamBridge points on Twitch. See [Points and !buy](../points-and-buy.md).

More detail and suggested costs: [Channel rewards](../../rewards.md).

## Check it works

1. In the wizard, open **Diagnostics** and select **Run pre-stream check**. Twitch should show as connected.
2. Type a message in your Twitch chat. It appears once in the chat overlay preview on **Chat Overlay**.
3. In Streamer.bot's **Action History**, **THSV Twitch - Intake** runs once, then **THSV StreamBridge - Receive Event**.
4. To test alerts without a real follow, use a Streamer.bot test trigger on **THSV Twitch - Intake** (right-click a trigger, then test it). Test events show on stream but do not earn StreamBridge points unless you turn that on in **Viewer Foundation**.
5. Redeem one of your rewards on a test account and check the feature reacts.

## Common problems

- **Nothing from Twitch.** Check Twitch is connected in Streamer.bot, **Platform enabled** and **Input enabled** are ticked on the **twitch** card, and you saved and restarted.
- **Everything arrives twice.** A Twitch trigger was added by hand as well as by the import. Select **verify now** on the **Streamer.bot** page and let it repair duplicates.
- **A feature says a permission is missing** (for example [Follower Pulse](../../addons/follower-pulse.md) needs to read followers). Reconnect your broadcaster account in Streamer.bot (**Platforms > Twitch > Accounts**) so it gets the current permissions.
- **A reward does nothing.** Paste the reward's **ID**, not its name, into the right **Twitch reward ID** box.
- **Refunds do not work.** The reward must be created in Streamer.bot and have **Redemption Skips Queue** off.
- **Emote errors in the Streamer.bot log** ("room not found" for BTTV, FFZ or 7TV). Harmless when your channel has no emotes with that service. See [Troubleshooting](../../troubleshooting.md#streamerbot-logs-bttv-ffz-or-7tv-channel-errors).

Back to the [Platforms overview](../platforms.md).
