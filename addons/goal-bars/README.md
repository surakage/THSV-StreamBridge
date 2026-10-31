# Goal Bars

Up to three goal bars on stream, for example Followers, Subs and Tips. Each goal adds up the events you tick from every platform: Twitch follows, subs, gifted subs and Bits; YouTube subscribers, members, gifted members and Super Chats; Kick follows, subs and gifted subs; TikTok follows and gifts; Facebook follows; and tips from Streamlabs or Ko-fi. Each bar is split into platform colours and can show who contributed last.

## Set it up

1. Turn on **Enable Goal Bars**.
2. For each goal, set a label, tick what it adds up and set a target. Optional: a reward line ("Face cam on!"), a starting count (for example today's follower count) and **Raise the target by**, so the goal moves up by itself when it is reached.
3. Add `http://127.0.0.1:8787/overlay/addons/thsv.goal-bars` as a 1920x1080 browser source in the scenes where the goals should show.
4. Restart StreamBridge.

No Streamer.bot import is needed: the events already arrive through the platform intakes.

## Good to know

- Counts are kept between restarts. Moderators can type `!goalreset` to reset every goal, or `!goalreset 2` for goal 2. You can also reset when the stream starts.
- Gifted subs, Bits and gifts count their amount. Super Chats and tips count whole currency units; set a currency to count only that one.
- Simulated test events never count toward goals.
