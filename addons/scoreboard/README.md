# Scoreboard

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
