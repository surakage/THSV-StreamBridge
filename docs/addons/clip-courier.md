# Clip Courier

**Module:** `thsv.clip-courier` · **Version:** `4.0.64` · **Built in (extension)**

Creates Twitch clips from !clip and optionally publishes other clips made during the observed current stream to a Discord channel or forum chosen from your Discord webhooks.

Clip Courier posts Twitch clips to a Discord channel or forum. When a viewer types `!clip` in Twitch chat, Streamer.bot clips the last 30 or 60 seconds and Clip Courier posts that clip to Discord straight away. Optionally, it can also post other clips people make during the current stream. Nothing appears on your stream overlay. Discord is the only output.

## What you need
- **Twitch** connected in Streamer.bot. Clip Courier is Twitch-only.
- A Discord webhook for the text channel or forum you want clips posted in, added under **Platforms > Discord webhooks** in the Setup Wizard.
- The Clip Courier Streamer.bot package. Import it, leave **THSV Addon - Clip Courier - Create Clip** without triggers, and approve it in the wizard.
- Optional: **Clip Library Cache**, only if you turn on **Also send other clips made during this stream**.

## Set it up
1. In Discord, open the channel or forum settings, choose **Integrations > Webhooks**, create a webhook and copy its link.
2. In the Setup Wizard, go to **Platforms > Discord webhooks**, give the webhook a name, paste the link, choose **Add webhook** and **Save**.
3. Import the `.sb` file into Streamer.bot. Open **Create Clip** and set the `clipCourierDurationSeconds` argument to `30` or `60`. Save and Compile.
4. If you have an older `!clip` command in Streamer.bot, disable it so the clip is not made twice.
5. Go to **Extensions > Clip Engine > Clip Courier**. Pick your webhook under **Discord webhook**, and pick **Discord destination** (channel or forum) to match it.
6. Under **Write the Discord post**, set the display name and the message. For forums, you can add up to five forum tag IDs.
7. Approve **Create Clip**, tick **Enable Clip Courier**, save and restart StreamBridge.
8. Test it while live on Twitch: type `!clip` in chat and check that the clip appears in Discord. Twitch only makes clips while you are live, and test events are ignored.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!clip` | Everyone on Twitch | Clips the last 30 or 60 seconds and posts it to Discord. |

## Good to know
- Message tokens: `{title}`, `{creator}` and `{url}`. For `!clip`, the creator is the viewer who used the command.
- Each clip is posted only once. The add-on remembers up to 300 posted clip IDs by default.
- Discord mentions are switched off, even if a clip title contains `@everyone`. If Discord rate-limits a post, StreamBridge waits and tries once more; a clip that still fails is tried again with the next clip.
- Automatic posting of other clips is off by default. When on, only clips made between your Twitch Stream Online and Stream Offline events are posted. Older clips never are. StreamBridge must see your stream go online for this to work.
- One webhook points to either a text channel or a forum, not both.
- The webhook link is stored encrypted for your Windows account. Clip Courier only knows the name you gave it.
- Upgrading from an older version: the old **Deliver** action is no longer used. You can delete it from Streamer.bot and remove its approval in the wizard.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Clip Engine** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Clip Courier`

- `THSV Addon - Clip Courier - Create Clip` in `THSV Addon - Clip Courier`

Create Clip remains triggerless and requires one-use broker tokens. The existing Twitch intake owns !clip. Discord posts are sent by StreamBridge from the shared Discord webhook list.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.clip-courier` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Clip Courier | Allows the reviewed !clip command and any optional current-stream discovery to send confirmed clips to Discord. | Off |
| Discord webhook | Choose the channel or forum webhook from your Discord webhooks (Platforms > Discord webhooks). | (blank) |
| Also send other clips made during this stream | Optional. Uses Twitch creation timestamps and the observed Twitch online/offline session. Clips from earlier streams never qualify. | Off |
| Discord destination | Choose Forum when the chosen webhook belongs to a Discord forum channel, so each clip starts its own forum post. | `channel` |
| Maximum delivered clip IDs remembered | Prevents repeat Discord posts while keeping private state bounded. | 300 |
| Discord webhook display name | The sender name Discord displays for Clip Courier posts. | `THSV Clip Courier` |
| Discord clip message | Tokens: {title}, {creator}, {url}. | `{title} - clipped by {creator} {url}` |
| Optional Discord forum tag IDs | One numeric tag ID per line, up to five. | (none) |

## Health checks

- **thsv.clip-courier.runtime:** Confirms command clip creation, current-stream filtering, and idempotent Discord publication are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `discord.post`, `state.private`.

Private storage: `data/addons/thsv.clip-courier/`, `data/addons/.state/thsv.clip-courier/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded publication history remains preserved.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
