# Scoreboard

**Module:** `thsv.scoreboard` · **Version:** `4.1.8` · **Built in (extension)**

A per-stream scoreboard of follows, subs, Bits, gifts, tips, raids and chat across every platform, next to your best stream on record.

A scoreboard for this stream: follows, subs and members, gifted subs, Bits, gifts, tips and Super Chats, raids, chatters and chat messages. Each row adds up every platform, shows the split by platform and sits next to your best stream on record. When this stream beats a record, that row lights up.

## Set it up

1. Turn on **Enable Scoreboard** and tick the rows to show.
2. Add `http://127.0.0.1:8787/overlay/addons/thsv.scoreboard` as a 1920x1080 browser source in the scenes where the scoreboard should show.
3. Restart StreamBridge.

No Streamer.bot import is needed: the events already arrive through the platform intakes.

## Good to know

- Counts start again when your next stream starts. If every platform drops and comes back within 30 minutes, it counts as the same stream.
- Moderators can type `!scorereset` to start the counts again.
- Records are the best single stream so far. Your first stream with the Scoreboard sets the bar.
- Tips and Super Chats count whole currency units; set a currency to count only that one. Bots and simulated test events never count.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Insights** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.scoreboard` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Scoreboard |  | Off |
| Scoreboard title |  | `Today's stream` |
| Rows to show | Each row counts this stream across every platform. | `follows`, `subs`, `giftedSubs`, `bits`, `tips`, `raids`, `chatters` |
| Show the best stream on record | A row lights up when this stream beats it. | On |
| Show the split by platform |  | On |
| Hide rows that are still at 0 |  | Off |
| Where the scoreboard sits |  | `top-right` |
| Only count tips in this currency (optional) | Three letters, for example USD. Leave blank to count every tip as whole units. | (blank) |
| Moderator reset command | Moderators type this (for example !scorereset) to start the counts again. Leave blank to turn it off. | `scorereset` |

## Health checks

- **thsv.scoreboard.runtime:** Confirms per-stream counting, records, stream resets and the scoreboard overlay.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`, `state.private`.

Private storage: `data/addons/thsv.scoreboard/`, `data/addons/.state/thsv.scoreboard/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
