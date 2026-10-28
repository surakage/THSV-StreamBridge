# Streamer Punishments

**Module:** `thsv.streamer-punishments` · **Version:** `4.0.59` · **Built in (extension)**

Lets viewers spend points or channel points on short OBS screen effects or on exercises you do on camera, with a grace countdown, a safe scene, and monthly exercise totals.

This built-in StreamBridge extension lets viewers buy punishments. A **screen effect** turns on one of your OBS filters for a few seconds, for example a Color Correction filter that blacks out your game capture. An **exercise** such as 10 pushups goes on an owed list, and you do it on camera. An optional **Bean Boozled wheel** lets bits, TikTok gifts and tips spin for a jelly bean you have to eat.

## What you need
- The Streamer Punishments Streamer.bot package, with **THSV Extension - Streamer Punishments - Set Filter** and **THSV Extension - Streamer Punishments - Switch Scene** imported, approved in the wizard, and left triggerless.
- One OBS filter per screen effect, added to the source it should change and turned off. For example a Color Correction filter named "THSV Blackout" with brightness turned down. Pixelate and barrel roll need the free Composite Blur and Move plugins.
- A browser source for the overlay (countdown, wheel and tracker panel). Copy the URL from the wizard; it looks like `http://127.0.0.1:8787/overlay/addons/thsv.streamer-punishments`.
- For Twitch and Kick: one channel point reward per effect or exercise, at the same price. Paste each reward ID into the wizard.
- The Viewer Foundation extension, which holds the StreamBridge points that YouTube, Facebook and TikTok viewers spend.

## Set it up
1. In OBS, add your effect filters (see above) and turn each one off.
2. Import the Streamer Punishments package into Streamer.bot. Approve Set Filter and Switch Scene in the wizard, and leave both without triggers.
3. Open Setup Wizard > Extensions > Streamer Punishments.
4. Fill in each effect row: name, OBS source, OBS filter name, seconds and points price.
5. Check the exercises, reps and prices, and pick the safe scene for exercises (your Just Chatting scene by default, mapped through Scene roles in the wizard).
6. For Twitch and Kick, create the channel point rewards and paste each reward ID into its row.
7. To use the bean wheel, turn on the Bean Boozled wheel and check the bits, coins and tip amounts per spin.
8. Add the overlay browser source in OBS.
9. Enable the extension and restart StreamBridge.
10. To test offline, type `!buy blackout` (or `!punish bean` for a test spin) as yourself or a moderator. Moderators and you can test while offline.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!buy <name>` | Viewers on YouTube, Facebook and TikTok (tick Twitch or Kick to allow them too) | Buys an effect or exercise with StreamBridge points. `!buy` on its own lists everything with its price. |
| `!done` or `!done pushups` | You and moderators | Marks the exercise or bean in progress as done and switches back. |
| `!punishments` | Everyone | Shows this month's reps and what is still owed. |
| `!punish off` | You and moderators | Stops the current effect and puts the exercise back on the owed list. |
| `!punish clear` | You and moderators | Clears the owed list. |
| `!punish next` | You and moderators | Starts the next owed exercise. |
| `!punish bean` | You and moderators | A test spin of the bean wheel (when the wheel is on). |

## Good to know
- Effects run one at a time. Purchases beyond the effect queue limit (5 by default) are refunded, and points are refunded when an effect cannot run.
- For an exercise, the overlay counts down a grace period (30 seconds by default). Then StreamBridge switches to your safe scene, so you can step away from a game you cannot pause. After `!done` it returns to the scene you were on. Exercises bought during Starting Soon, a break or the ending wait for a normal scene.
- **Shared exercise limit** (5 per stream by default, 0 turns it off): every exercise counts toward one total, whichever exercise it is and wherever it was bought: Twitch and Kick channel point rewards and `!buy` on every platform. After each exercise, chat on that platform says how many are left ("3 of 5 exercises left this stream."). At the limit, the viewer sees "No exercises left this stream (5 of 5 used)." on their platform: `!buy` spends no points, and a refused Twitch or Kick redemption gets a note asking a mod to refund the channel points (reject it from the reward queue, so keep the queue on for those rewards). The total resets when a new stream starts, like the per-exercise limit; a stream that comes back within 30 minutes is the same stream. Both messages can be changed in the wizard.
- Twitch rewards enforce their own per-stream limit and cooldown. Kick rewards have neither, so StreamBridge applies the exercise limit (5 per stream) and cooldown (10 minutes), plus a per-effect cooldown (30 seconds), to Kick redemptions. Leave Redemption Skips Queue off on Kick rewards, so a blocked redemption stays in the Kick queue for you to reject.
- **Bean Boozled wheel** (off by default): 500 bits, 500 TikTok coins, or $5 per spin, up to 3 spins from one cheer, gift or tip. Small TikTok gifts from the same viewer add up during the stream. The wheel lands on a color, then a card reveals NICE or NASTY. It ships with the BeanBoozled 7th edition flavors, and you can edit the colors and flavors (up to 10).
- **Tracker panel** (on by default): a small corner panel shows what is owed and this month's total for each exercise (and beans). It hides when nothing is owed; turn off "Show the tracker only while something is owed" to keep it up. Add `?tracker=only` to a second browser source of this overlay to place the panel anywhere, and `?tracker=off` to hide it in the first one.
- Monthly totals reset at your first stream in a new month. When the stream ends, an exercise in progress goes back on the owed list, and owed exercises are kept when you disable the extension.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Extension - Streamer Punishments`

- `THSV Extension - Streamer Punishments - Set Filter` in `THSV Extension - Streamer Punishments`
- `THSV Extension - Streamer Punishments - Switch Scene` in `THSV Extension - Streamer Punishments`

Set Filter and Switch Scene must remain triggerless. StreamBridge supplies a one-use broker token, an exact OBS source and filter name or scene name, and a bounded connection index, and owns all timing.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.streamer-punishments` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Streamer Punishments | Requires the Streamer Punishments Streamer.bot actions approved, and one OBS filter per screen effect. | Off |
| Screen effects | Each row is one effect: its name, the OBS source it changes, the OBS filter StreamBridge turns on, how many seconds, the StreamBridge points price, and optional Twitch and Kick reward IDs in their own boxes. | `Blackout \| \| THSV Blackout \| 15 \| 100 \|`, `Pixelate \| \| THSV Pixelate \| 15 \| 100 \|`, `Barrel roll \| \| THSV Barrel Roll \| 15 \| 150 \|` |
| Exercises | Each row is one exercise: its name, reps per purchase, the StreamBridge points price, and optional Twitch and Kick reward IDs in their own boxes. | `Pushups \| 10 \| 250 \|`, `Situps \| 15 \| 200 \|`, `Squats \| 15 \| 200 \|` |
| Buy command | Viewers type !buy pushups. !buy on its own lists everything with its price. | `buy` |
| Chats that can buy with StreamBridge points | Twitch and Kick use channel point rewards by default; tick them here to also allow !buy with StreamBridge points. | `youtube`, `tiktok`, `facebook` |
| Done command (moderators and you) | Marks the exercise in progress as done, for example !done or !done pushups. | `done` |
| Totals command | Shows this month's reps and what is still owed. | `punishments` |
| Moderator control command | !punish off stops the current effect and puts the exercise back on the owed list; !punish clear clears owed exercises; !punish next starts the next one. | `punish` |
| Grace period before an exercise (seconds) | A countdown shows on the overlay before StreamBridge switches scenes, so you can get somewhere safe in a game you cannot pause. | 30 |
| Scene for exercises | StreamBridge switches here when the grace period ends. Leave empty to stay on the current scene. | `role:chatting` |
| Only on these scenes | Punishments can be bought or redeemed only while one of these scenes is live. Leave empty for every scene. role:live, role:chatting and the other roles follow Scene roles. Bits, tips and gifts are never blocked. | (none) |
| Wrong-scene message | Placeholders: {viewer}, {scenes}. | `{viewer}, punishments only work during {scenes}.` |
| Switch back when done | Returns to the scene you were on, unless you already moved away from the exercise scene. | On |
| OBS connection number in Streamer.bot | 0 is the first OBS connection. | 0 |
| Most purchases of each exercise per stream | 0 means no limit. Counts !buy and Kick rewards together. Twitch rewards use the limit set on the reward itself. | 5 |
| Most exercises per stream, all platforms together | 0 means no shared limit. Every exercise counts, whichever exercise it is and wherever it was bought: Twitch and Kick rewards and !buy on every platform. | 5 |
| Cooldown for each exercise (minutes) | Applies to !buy and Kick rewards. Twitch rewards use the cooldown set on the reward itself. | 10 |
| Cooldown for each screen effect from Kick rewards (seconds) | Kick rewards have no cooldown of their own. 0 means no cooldown. | 30 |
| Gap between screen effects (seconds) |  | 1 |
| Screen effects that can wait in line | Purchases beyond this are refunded. | 5 |
| Only while live | Moderators and you can still test while offline. | On |
| Show the countdown on the overlay | Uses this extension's overlay browser source. | On |
| Countdown size | Small and medium sit in a corner so they stay off the gameplay. Large fills the overlay like the original countdown. | `small` |
| Countdown position |  | `top-right` |
| Show the punishments tracker panel | A small panel on the overlay with what is owed and this month's totals. Add ?tracker=only to a second browser source to place it on its own. | On |
| Show the tracker only while something is owed | Hides the panel when no exercise or bean is owed or in progress. Turn off to keep it on screen all the time. | On |
| Tracker panel corner |  | `bottom-left` |
| Chat replies |  | On |
| Effect message |  | `{viewer} hit the stream with {name} for {seconds}s!` |
| Exercise bought message |  | `{viewer} bought {reps} {name}! Starting in {seconds}s.` |
| Exercise starts message |  | `Time for {reps} {name} from {viewer}! A mod types !{done} when they are done.` |
| Exercise done message |  | `{reps} {name} done! {name} this month: {month}.` |
| Per-stream limit message |  | `{viewer}, {name} is maxed out for this stream ({limit}). Try another punishment.` |
| Exercises left message | Sent on the platform an exercise came from, after it is accepted. Placeholders: {remaining}, {used}, {limit}, {viewer}, {name}. | `{remaining} of {limit} exercises left this stream.` |
| No exercises left message | Sent when the shared limit is reached. !buy spends no points. On Twitch and Kick a note asks a mod to refund the channel points. | `No exercises left this stream ({used} of {limit} used).` |
| Cooldown message |  | `{viewer}, {name} is cooling down. Try again in {minutes} min.` |
| Not enough points message |  | `{viewer}, {name} costs {cost} {currency}. You have {balance}.` |
| List message |  | `Punishments: {list}. Use !{buy} <name>.` |
| Enable the Bean Boozled wheel | Bits, TikTok gifts, and tips spin a wheel of bean colors, then reveal a nice or nasty flavor. The bean goes on the owed list like an exercise. | Off |
| Beans | Each row is one bean color on the wheel: its color name, the wheel color, the nice flavor, and the nasty flavor. Up to 10 rows. Ships with the BeanBoozled 7th edition. | `Black \| #1c1c1c \| Licorice \| Burnt Rubber`, `Yellow spotted \| #e8c33a \| Top Banana \| Wet Dog`, `Purple speckled \| #9b4dca \| Tutti-Frutti \| Stinky Socks`, `Light blue \| #7cc6f2 \| Berry Blue \| Toothpaste`, `Orange speckled \| #f28c28 \| Peach \| Barf`, `Tan \| #d9b98c \| Toasted Marshmallow \| Stink Bug`, `Green \| #9cc84b \| Juicy Pear \| Booger`, `Red \| #c0263a \| Pomegranate \| Old Bandage`, `Brown \| #8b5a3c \| Cappuccino \| Liver and Onions`, `Pink \| #f4a6c0 \| Strawberry Banana Smoothie \| Dead Fish` |
| Bits per spin | Twitch bits needed for one spin. 0 turns bits off. | 500 |
| TikTok coins per spin | TikTok gift coins needed for one spin. Small gifts from the same viewer add up during the stream. 0 turns TikTok gifts off. | 500 |
| Tip per spin (whole currency units) | For example 5 means $5 per spin. 0 turns tips off. | 5 |
| Tip currency | Three-letter currency code. Tips in other currencies do not spin. | `USD` |
| Most spins from one cheer, gift, or tip |  | 3 |
| Wheel spin length (seconds) |  | 8 |
| Bean result message | Placeholders: {viewer}, {color}, {result}, {flavor}. | `{viewer} spun the Bean Boozled wheel and landed on {color}... it is {result}: {flavor}!` |
| Bean eaten message | Placeholders: {flavor}, {month}. | `{flavor} bean eaten! Beans this month: {month}.` |

## Health checks

- **thsv.streamer-punishments.runtime:** Confirms bounded punishment parsing, refunded point spending, one effect at a time, and one exercise at a time with a grace countdown.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.streamer-punishments/`, `data/addons/.state/thsv.streamer-punishments/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable the extension. Any effect that is on turns off, and owed exercises stay saved until it is enabled again.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
