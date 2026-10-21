# YouTube

## What it is

Streamer.bot is connected to your YouTube channel, and the THSV import adds **THSV YouTube - Intake**, which passes each YouTube live event on to StreamBridge. YouTube has no channel points here, so viewers use **StreamBridge points** and chat commands instead.

StreamBridge also fixes one known YouTube chat problem for you when it starts Streamer.bot (see [Automatic YouTube chat repair](#automatic-youtube-chat-repair)).

## What StreamBridge gets from YouTube

| YouTube event | What StreamBridge does with it |
| --- | --- |
| Live chat messages | Chat overlay and dock, chat commands. Keeps YouTube emotes, profile photos and role badges (owner, moderator, member). Also shows BTTV and 7TV emotes. |
| New subscribers | Treated like a **follow** (follow alert) |
| New members and member milestones | Membership alert |
| Gifted memberships | Gift alert (with how many) |
| Super Chats and Super Stickers | Money alert with amount and currency |
| Jewels | Gift alert |
| Broadcast started and ended | Tells timed features when you go live and end |

YouTube has **no channel point rewards** in StreamBridge. Reward features use StreamBridge points plus a command instead (see [Rewards and points](#rewards-and-points)).

## How it connects

```text
YouTube -> Streamer.bot (your YouTube login) -> THSV YouTube - Intake -> StreamBridge
```

- Your Google login stays in Streamer.bot.
- All YouTube triggers come inside the one Streamer.bot import, already attached to **THSV YouTube - Intake**.
- Chat replies from features go back to YouTube chat through Streamer.bot. YouTube chat messages are kept short (200 characters).
- StreamBridge has no separate setting for a second YouTube broadcast (for example a vertical one). It receives whatever Streamer.bot's YouTube connection passes on.

## What you need

- Streamer.bot 1.0.7 or newer with its WebSocket server running.
- Your YouTube channel connected in Streamer.bot.
- The one Streamer.bot import done. See [Where to find the Streamer.bot imports](../streamerbot-imports.md).

## Set it up

### 1. Connect YouTube in Streamer.bot

1. In Streamer.bot, open **Platforms > YouTube > Accounts**.
2. Sign in with the Google account that owns your channel and accept the permissions.
3. Turn on auto-connect so YouTube connects when Streamer.bot starts.
4. Go live (an unlisted test stream is fine) and check Streamer.bot sees your broadcast.

### 2. Import the THSV actions

1. In the wizard, open **Streamer.bot > One Streamer.bot import**.
2. Select **Create & download one import**. The YouTube intake is in **Always included**.
3. In Streamer.bot, select **Import**, drag the file in, keep overwrite on and import.
4. Back in the wizard, select **I finished importing — verify now**.

### 3. Turn YouTube on in StreamBridge

1. In the wizard, open **Platforms**.
2. On the **youtube** card, tick **Platform enabled** and **Input enabled**.
3. Select **Save with backup**, then **Restart safely**.

### 4. Start Streamer.bot through StreamBridge

Start Streamer.bot with **Start all streaming tools** or **Start Streamer.bot only** on the wizard's **Streamer.bot** page, the **Start THSV Streaming Tools** shortcut, or your Stream Deck button. That way the YouTube chat repair below runs first.

## Automatic YouTube chat repair

**The problem:** on Windows 11 with **Smart App Control** turned on, some Streamer.bot 1.1.0 test (alpha) builds ship a file (`Google.Protobuf.dll`) that Windows blocks because it is not signed. YouTube chat then silently stops working. The usual fix is to point Streamer.bot at a Google-signed copy of that file in its settings file, but every Streamer.bot update throws that fix away.

**What StreamBridge does:** every time StreamBridge starts Streamer.bot, it checks this first and puts the fix back if needed. It:

1. only acts when **all** of these are true: a Google-signed copy is in Streamer.bot's folder under `dlls\google-protobuf-signed-<version>\`, the shipped file is unsigned, and Streamer.bot's `Streamer.bot.exe.config` has no fix of its own;
2. backs up the config file first, as `Streamer.bot.exe.config.before-thsv-youtube-chat-fix-<date>`;
3. adds the fix and says so in the startup output ("Re-applied the YouTube chat fix for Smart App Control ...").

Otherwise it changes nothing, and a failed check never stops Streamer.bot from starting. To undo it, delete the block marked `THSV` in `Streamer.bot.exe.config`, or put the backup back.

StreamBridge does **not** download the signed copy for you. You need to place it in `dlls\google-protobuf-signed-<version>\Google.Protobuf.dll` inside your Streamer.bot folder yourself. If you do not use Smart App Control, or your Streamer.bot build already ships a signed file, you need none of this.

## Rewards and points

YouTube viewers earn **StreamBridge points** by chatting, subscribing, becoming members, sending Super Chats and more. They spend them with feature commands:

- `!points` shows a viewer's balance.
- `!buy` lists and buys [Streamer Punishments](../../addons/streamer-punishments.md) effects and exercises.
- Features such as [Fan Crown](../../addons/fan-crown.md), [First Five](../../addons/first-five.md), [Village Roll Call](../../addons/village-roll-call.md), [Viewer Spotlight](../../addons/viewer-spotlight.md) and [Village Voice](../../addons/voice-relay.md) use points plus their own command on YouTube.

If a purchase cannot be completed, StreamBridge gives the points back. See [Points and !buy](../points-and-buy.md).

## Check it works

1. Go live (unlisted is fine). On **Diagnostics**, select **Run pre-stream check**. YouTube should show as connected.
2. Type a message in your YouTube live chat. It appears once in the chat overlay preview on **Chat Overlay**.
3. In Streamer.bot's **Action History**, **THSV YouTube - Intake** runs once, then **THSV StreamBridge - Receive Event**.
4. Type `!points`. You get a reply in YouTube chat.

## Common problems

- **No YouTube chat at all, and Smart App Control is on.** See [Automatic YouTube chat repair](#automatic-youtube-chat-repair). Start Streamer.bot through StreamBridge, and check the signed copy is in place.
- **Nothing arrives before you go live.** YouTube live chat belongs to a broadcast, so test with a live (for example unlisted) broadcast running.
- **Nothing from YouTube while live.** Check YouTube is connected in Streamer.bot, both switches are ticked on the **youtube** card, and you saved and restarted.
- **Replies are cut short.** YouTube messages are limited to 200 characters.
- **Events arrive twice.** Remove hand-added YouTube triggers, or select **verify now** and let it repair.

Back to the [Platforms overview](../platforms.md).
