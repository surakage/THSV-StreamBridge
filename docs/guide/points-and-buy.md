# Points and !buy

## What it is

StreamBridge has its own viewer points, run by the built-in **Viewer Foundation**. They work the same way on every platform. You choose their name, for example Points, Acorns or Stars.

Points matter most on platforms without channel points. On **Twitch** and **Kick**, reward features normally use your own **channel point rewards**. On **YouTube** and **TikTok** (and a Facebook Page, where a feature supports it), viewers type a command and pay with **StreamBridge points**.

## What you need

- Nothing to import. Viewer Foundation is built in and works from the chat and events StreamBridge already receives.
- Your platforms connected ([Platforms](platforms.md)).

## How viewers earn points

Default amounts (you can change every one):

| Activity | Default points |
| --- | --- |
| A chat message (at most once every 60 seconds per viewer) | 1 |
| Consistency bonus, after 5 messages | 5 |
| Every 10 minutes of active chatting | 5 |
| Every 10 minutes of lurking after `!lurk` | 5 |
| Follow | 25 |
| Twitch or Kick subscription, YouTube membership | 100 |
| Gifted subscription | 75 |
| Platform gift | 50 |
| Cheer / Bits | 25 |
| Super Chat or Jewels | 100 |
| Raid | 100 |
| Channel reward redemption | 25 |

Every 100 points is one level. Viewers also unlock five milestone achievements at 100, 500, 1,000, 2,500 and 5,000 points. Test events from Streamer.bot do not earn points unless you turn on **Award points for simulated events**.

Awards are fixed numbers. A big cheer and a small cheer both give the same "Cheer / bits" amount.

## Set it up

1. In the wizard, open **Viewer Foundation**.
2. Check **Enable viewer progression** is on.
3. Set **Points name** and, if you like, the **Balance command** (default `points`).
4. Change any award amounts you want.
5. Optional: under **Explicit account links**, join one viewer's accounts across platforms. Use `viewer-id|platform|stable-user-id`, for example `alex|twitch|123456`. Use the platform's numeric user ID, never a display name.
6. Select **Save foundation settings**, then restart StreamBridge when asked.

## How viewers check points

A viewer types `!points` (or your balance command). StreamBridge replies on the same platform: "`<name>`, you have `<amount>` `<points name>` and are level `<level>`."

## How viewers spend points: !buy

**Streamer Punishments** (built in, in **Extensions > Community Play**) uses `!buy`:

- `!buy` on its own lists every screen effect and exercise with its price.
- `!buy pushups` buys that item.
- By default `!buy` with points works on **YouTube, TikTok and Facebook**. Twitch and Kick viewers use your channel point rewards. You can also tick Twitch or Kick under **Chats that can buy with StreamBridge points**.
- If a viewer cannot afford it, they get a message with the price and their balance.
- If an effect cannot run, the points are refunded.

Set up Streamer Punishments with [its guide](../addons/streamer-punishments.md). It needs the Streamer.bot import and the **Set Filter** and **Switch Scene** actions approved ([Streamer.bot import and approval](streamerbot-import-and-approval.md)).

### Other features that use points

These follow the same rule: Twitch and Kick use channel rewards, YouTube and TikTok use points plus the feature's command. If saving fails, points are refunded.

- [Fan Crown](../addons/fan-crown.md), [First Five](../addons/first-five.md), [Village Roll Call](../addons/village-roll-call.md), [Viewer Spotlight](../addons/viewer-spotlight.md), [Village Voice](../addons/voice-relay.md) and [Raid Scout](../addons/raid-scout.md) viewer suggestions
- [Village Draw](../addons/village-draw.md) can sell giveaway tickets for points
- [Chat Play Pack](../addons/chat-play-pack.md), [Village Jukebox](../addons/village-jukebox.md) and [Free Game Check](../addons/free-game-check.md) also read or change points

Channel reward costs, colors and suggested titles are listed in [Channel rewards](../rewards.md).

## Fixing a viewer's points

On the **Viewer Foundation** page you can find a viewer, apply a correction (add, remove or reset) with a reason, undo a correction, export a viewer's data, or delete a viewer. None of this is available from chat.

## Check it works

1. Type `!points` in chat. You get a reply on the same platform.
2. Send a few messages more than a minute apart, then check again.
3. On a YouTube or TikTok test, type `!buy`. You get the price list (Streamer Punishments must be enabled).

## Common problems

- **No reply to !points.** Check **Enable viewer progression** is on and you restarted after saving.
- **Test events do not give points.** That is on purpose. Use real chat, or turn on simulated awards only while testing.
- **A Kick claim was not refunded.** Streamer.bot cannot refund Kick rewards. Reject it yourself in the Kick queue.
- **One viewer shows as two people.** Add an explicit account link, then restart.

For depth, read [Viewer Foundation](../addons/viewer-foundation.md) and [Viewer Foundation contract](../viewer-foundation.md).
