# Clip Courier

Clip Courier posts Twitch clips to a Discord channel or forum. When a viewer types `!clip` in Twitch chat, Streamer.bot clips the last 30 or 60 seconds and Clip Courier posts that clip to Discord straight away. Optionally, it can also post other clips people make during the current stream. Nothing appears on your stream overlay. Discord is the only output.

## What you need
- **Twitch** connected in Streamer.bot. Clip Courier is Twitch-only.
- A private Discord webhook for the text channel or forum you want clips posted in.
- The Clip Courier Streamer.bot package. Import it, leave both actions without triggers, and approve both in the wizard:
  - **THSV Addon - Clip Courier - Create Clip**
  - **THSV Addon - Clip Courier - Deliver**
- Optional: **Clip Library Cache**, only if you turn on **Also send other clips made during this stream**.

## Set it up
1. Import the `.sb` file into Streamer.bot.
2. Open **Create Clip** and set the `clipCourierDurationSeconds` argument to `30` or `60`. Save and Compile.
3. Open **Deliver** and replace `REPLACE_WITH_PRIVATE_DISCORD_WEBHOOK_URL` in `clipCourierWebhookUrl` with your Discord webhook. Save and Compile. The webhook stays only in Streamer.bot. Never paste it into StreamBridge.
4. If you have an older `!clip` command in Streamer.bot, disable it so the clip is not made twice.
5. Open the Setup Wizard and go to **Extensions > Clip Engine > Clip Courier**. Pick **Discord destination** (channel or forum) to match the webhook you made.
6. Under **Write the Discord post**, set the webhook display name and the message. For forums, you can add up to five forum tag IDs.
7. Approve **Create Clip** and **Deliver**, tick **Enable Clip Courier**, save and restart StreamBridge.
8. Test it while live on Twitch: type `!clip` in chat and check that the clip appears in Discord. Twitch only makes clips while you are live, and test events are ignored.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!clip` | Everyone on Twitch | Clips the last 30 or 60 seconds and posts it to Discord. |

## Good to know
- Message tokens: `{title}`, `{creator}` and `{url}`. For `!clip`, the creator is the viewer who used the command.
- Each clip is posted only once. The add-on remembers up to 300 posted clip IDs by default.
- Discord mentions are switched off, even if a clip title contains `@everyone`. If Discord rate-limits a post, it retries a few times.
- Automatic posting of other clips is off by default. When on, only clips made between your Twitch Stream Online and Stream Offline events are posted. Older clips never are. StreamBridge must see your stream go online for this to work.
- One webhook can point to a text channel or a forum, not both.
