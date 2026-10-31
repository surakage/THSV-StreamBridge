# TikTok (TikFinity and TikTok LIVE Studio)

## What it is

TikTok has two separate parts in StreamBridge:

- **TikFinity** brings your TikTok LIVE **chat and events** in. TikFinity watches your LIVE and runs five THSV actions in Streamer.bot, which pass each event on to StreamBridge.
- **TikTok LIVE Studio** is the app you actually go live with. It is not a chat source. StreamBridge can start it for you, remind you to go live, and (optionally) press **Go LIVE** and **End LIVE** for you together with OBS.

You can use one without the other.

## What StreamBridge gets from TikTok (through TikFinity)

| TikTok event | What StreamBridge does with it |
| --- | --- |
| Chat comments | Chat overlay and dock, chat commands. Keeps profile photos and normal emoji. |
| Follows | Follow alert |
| Gifts | Gift alert with the gift name, how many, and coins |
| Likes | A like **milestone** alert every 100 likes |
| Subscriptions | Sub alert |
| Live viewer count | How many people are watching your TikTok LIVE right now, for the [Viewer counter](../obs-and-overlays.md). Read from TikFinity directly (see below). |

TikTok has no channel point rewards in StreamBridge. Viewers use **StreamBridge points** (see [Rewards and points](#rewards-and-points)).

TikFinity does not give a fixed ID for each event, and does not always mark its test events. So StreamBridge marks TikTok data as "less certain", and a TikFinity test event can count as real unless TikFinity labels it as a test.

## How it connects

```text
TikTok LIVE -> TikFinity -> Streamer.bot WebSocket (127.0.0.1:8080) -> THSV TikTok actions -> StreamBridge
```

- Your TikTok login stays in TikFinity.
- The five THSV TikTok actions come in the **Always included** part of the one Streamer.bot import. They have **no Streamer.bot triggers**. TikFinity calls them directly.
- Replies to TikTok chat go out through TikFinity, and are kept to 150 characters.
- The **live viewer count** is the one thing that skips Streamer.bot: StreamBridge listens (read-only) to the TikFinity desktop app on this PC at `ws://127.0.0.1:21213`, TikFinity's local Event API. Keep the TikFinity desktop app open while you are live. StreamBridge never sends anything to TikFinity there, and keeps quietly retrying when TikFinity is closed.

## What you need

- TikFinity, connected to your TikTok account.
- Streamer.bot with its WebSocket server running on `127.0.0.1`, port `8080`, endpoint `/` (in Streamer.bot: **Servers/Clients > WebSocket Server**, with **Auto Start** on).
- The one Streamer.bot import done. See [Where to find the Streamer.bot imports](../streamerbot-imports.md).
- For the LIVE Studio automation: TikTok LIVE Studio, its official **Stream Deck plugin**, and OBS Studio connected to StreamBridge.

## Set it up: TikFinity (chat and events)

### 1. Import the THSV TikTok actions

1. In the wizard, open **Streamer.bot > One Streamer.bot import**.
2. Select **Create & download one import**. The TikFinity intake is in **Always included**.
3. In Streamer.bot, select **Import**, drag the file in, keep overwrite on and import.
4. Check Streamer.bot now has a group **THSV StreamBridge - TikTok** with five actions: `THSV TikTok - Chat`, `THSV TikTok - Follow`, `THSV TikTok - Gift`, `THSV TikTok - Like` and `THSV TikTok - Subscription`.
5. Do **not** add Streamer.bot triggers to them.

### 2. Connect TikFinity to Streamer.bot

1. In TikFinity, open its Streamer.bot connection settings.
2. Enter Address `127.0.0.1`, Port `8080`, Endpoint `/`. If you changed Streamer.bot's WebSocket port, use that port instead (the wizard's **Streamer.bot** page shows it).
3. Select **Test Connection**. It must succeed before you go on.

### 3. Map TikFinity events to the THSV actions

In TikFinity, set each event to run the matching Streamer.bot action:

| TikFinity event | Streamer.bot action |
| --- | --- |
| Chat (any comment) | `THSV TikTok - Chat` |
| Follow | `THSV TikTok - Follow` |
| Gift | `THSV TikTok - Gift` |
| Like | `THSV TikTok - Like` |
| Subscription | `THSV TikTok - Subscription` |

Map each event **once**. A second mapping makes that event arrive twice.

### 4. Optional: let StreamBridge reply in TikTok chat

In TikFinity, turn on **Allow Streamer.bot to push messages to TikFinity**. Then feature replies (for example to `!points` or `!buy`) and timed messages with **TikTok through TikFinity** ticked can appear in TikTok chat. Keep TikTok timed messages within 150 characters.

### 5. Turn TikTok on in StreamBridge

1. In the wizard, open **Platforms**.
2. On the **tiktok** card (adapter `tikfinity-streamerbot`), tick **Platform enabled** and **Input enabled**.
3. Select **Save with backup**, then **Restart safely**.

### 6. Optional: start TikFinity with one button

On the wizard's **Streamer.bot** page, under **Exact programs for one-button startup**, find **TikFinity**, select **Choose TikFinity executable** and tick **Start automatically**. **Start all streaming tools** then opens it for you.

## Set it up: TikTok LIVE Studio (going live)

### 1. Let StreamBridge start LIVE Studio

1. On the wizard's **Streamer.bot** page, under **Exact programs for one-button startup**, find **TikTok LIVE Studio**.
2. Select **Choose TikTok LIVE Studio Launcher** and pick `TikTok LIVE Studio Launcher.exe` (normally in `Program Files\TikTok LIVE Studio`).
3. Tick **Start automatically**.

LIVE Studio runs as administrator. When StreamBridge starts it, it opens it the way a double-click does, so Windows may show a permission prompt: approve it there. If LIVE Studio is already running as administrator, StreamBridge sees that and does not start a second copy.

### 2. Reminders (on by default once LIVE Studio is chosen)

With **Start automatically** ticked, the tray icon reminds you:

- **"Go LIVE on TikTok"** when OBS starts streaming (skipped if TikTok events show you are already live);
- **"End your TikTok LIVE"** when OBS stops streaming.

Click the reminder to bring LIVE Studio to the front.

### 3. Optional: Go LIVE and End LIVE together with OBS

This presses LIVE Studio's **Go LIVE** / **End LIVE** button for you, through the same local connection LIVE Studio opens for its official Stream Deck plugin. Nothing leaves your PC.

Requirements:

- TikTok LIVE Studio chosen with **Start automatically** ticked (step 1). The automation never runs otherwise.
- LIVE Studio **open** when you start streaming, with its official **Stream Deck plugin** installed (that plugin is what makes LIVE Studio open its local control connection).
- **OBS Studio** connected to StreamBridge under **Streamer.bot > Direct scene connections** (see [OBS and overlays](../obs-and-overlays.md)). StreamBridge watches OBS to know when you start and stop streaming.
- A LIVE Studio scene that shows **OBS Virtual Camera**. StreamBridge turns OBS Virtual Camera on before it presses Go LIVE, so TikTok shows your OBS picture.

Turn it on:

1. Under **TikTok LIVE Studio** on the **Streamer.bot** page, tick **Go LIVE and End LIVE together with OBS**.
2. Start streaming in OBS. StreamBridge turns on Virtual Camera, checks LIVE Studio says you are **not** live yet, presses **Go LIVE** and waits up to 15 seconds for LIVE Studio to confirm.
3. Stop streaming in OBS. StreamBridge checks you **are** live, presses **End LIVE** and waits for confirmation.

It is careful: it only presses after LIVE Studio confirms the opposite state, leaves a paused LIVE alone, and falls back to the tray reminder whenever something is unclear (LIVE Studio closed, no answer, Virtual Camera failed, or LIVE Studio waiting for you to confirm something). The last result is shown under the checkbox.

## Rewards and points

TikTok viewers earn **StreamBridge points** from chat, follows, gifts and subscriptions, and spend them with commands such as `!buy` ([Streamer Punishments](../../addons/streamer-punishments.md)) or a feature's own command. Some features also react to TikTok gifts directly, for example the Bean Boozled wheel in Streamer Punishments (coins per spin). See [Points and !buy](../points-and-buy.md).

## Check it works

1. In TikFinity, run a test event for Chat, then Follow and Gift.
2. In Streamer.bot's **Action History**, the matching `THSV TikTok - ...` action runs once, followed by **THSV StreamBridge - Receive Event**.
3. The test chat appears once in the chat overlay preview on **Chat Overlay**.
4. On **Diagnostics**, select **Run pre-stream check**. The TikTok adapter shows as connected.
5. For LIVE Studio automation: with LIVE Studio open, start and stop a short private OBS stream and read the result line under **Go LIVE and End LIVE together with OBS**.

## Common problems

- **Nothing from TikTok.** Check TikFinity is connected to your LIVE, its Streamer.bot **Test Connection** works, each event is mapped to the right THSV action, and the **tiktok** card has both switches ticked (then save and restart).
- **TikFinity cannot connect to Streamer.bot.** Start Streamer.bot's WebSocket server and check the address, port and endpoint match exactly (`127.0.0.1`, `8080`, `/`).
- **TikTok events arrive twice.** An event is mapped twice in TikFinity, or someone added Streamer.bot triggers to a THSV TikTok action. Remove the extra one.
- **The THSV TikTok actions are missing in TikFinity's list.** Import the one Streamer.bot import, then refresh TikFinity's action list.
- **Empty chat lines are ignored.** TikFinity sometimes sends empty chat events when its connection changes. StreamBridge skips them on purpose.
- **No replies in TikTok chat.** Turn on **Allow Streamer.bot to push messages to TikFinity** in TikFinity.
- **Go LIVE was not pressed; I only got a reminder.** Open the last result under the checkbox. Usually LIVE Studio was closed, the Stream Deck plugin is not installed, OBS is not connected under **Direct scene connections**, or Virtual Camera could not start.
- **LIVE Studio does not start with one button.** Approve the Windows permission prompt. If it keeps failing, the wizard pauses automatic startup for a while; select **Clear crash pause** after fixing the cause.

Back to the [Platforms overview](../platforms.md).
