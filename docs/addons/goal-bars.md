# Goal Bars

**Module:** `thsv.goal-bars` · **Version:** `4.0.64` · **Built in (extension)**

Up to three on-stream goal bars that add up follows, subs, Bits, Super Chats, gifts and tips from the platforms you pick, split by platform colour.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Insights** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.goal-bars` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Goal Bars |  | Off |
| Show goal 1 |  | On |
| Label | Shown on the bar, for example Followers. | `Followers` |
| Reward line (optional) | What happens at the goal, for example Face cam on! | (blank) |
| Adds up | Every ticked item counts toward this goal. Gifted subs, Bits and gifts count their amount; Super Chats and tips count whole currency units. | `twitch-follows`, `youtube-subscribers`, `kick-follows` |
| Target |  | 100 |
| Raise the target by | When the total is reached, the target goes up by this much. 0 = off. | 0 |
| Starting count | Added to the total, for example your follower count today. | 0 |
| Show goal 2 |  | On |
| Label | Shown on the bar, for example Followers. | `Subs` |
| Reward line (optional) | What happens at the goal, for example Face cam on! | (blank) |
| Adds up | Every ticked item counts toward this goal. Gifted subs, Bits and gifts count their amount; Super Chats and tips count whole currency units. | `twitch-subs`, `twitch-gifted-subs`, `youtube-members`, `kick-subs`, `kick-gifted-subs` |
| Target |  | 25 |
| Raise the target by | When the total is reached, the target goes up by this much. 0 = off. | 0 |
| Starting count | Added to the total, for example your follower count today. | 0 |
| Show goal 3 |  | Off |
| Label | Shown on the bar, for example Followers. | `Tips` |
| Reward line (optional) | What happens at the goal, for example Face cam on! | (blank) |
| Adds up | Every ticked item counts toward this goal. Gifted subs, Bits and gifts count their amount; Super Chats and tips count whole currency units. | `tips`, `youtube-super-chats` |
| Target |  | 100 |
| Raise the target by | When the total is reached, the target goes up by this much. 0 = off. | 0 |
| Starting count | Added to the total, for example your follower count today. | 0 |
| Count Super Chats and tips in this currency only | Three-letter code such as USD. Leave empty to count every currency as whole units. | (blank) |
| Reset command (moderators) | !goalreset resets every goal; !goalreset 2 resets goal 2. Leave empty to turn off. | `goalreset` |
| Reset the counts when the stream starts |  | Off |
| Overlay heading (optional) |  | `Goals` |
| Show who contributed last under each bar |  | On |

## Health checks

- **thsv.goal-bars.runtime:** Confirms event counting, target raising, persistence and the goals overlay.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`, `state.private`.

Private storage: `data/addons/thsv.goal-bars/`, `data/addons/.state/thsv.goal-bars/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
