# Streamer Punishments

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
- Twitch rewards enforce their own per-stream limit and cooldown. Kick rewards have neither, so StreamBridge applies the exercise limit (5 per stream) and cooldown (10 minutes), plus a per-effect cooldown (30 seconds), to Kick redemptions. Leave Redemption Skips Queue off on Kick rewards, so a blocked redemption stays in the Kick queue for you to reject.
- **Bean Boozled wheel** (off by default): 500 bits, 500 TikTok coins, or $5 per spin, up to 3 spins from one cheer, gift or tip. Small TikTok gifts from the same viewer add up during the stream. The wheel lands on a color, then a card reveals NICE or NASTY. It ships with the BeanBoozled 7th edition flavors, and you can edit the colors and flavors (up to 10).
- **Tracker panel** (on by default): a small corner panel shows what is owed and this month's total for each exercise (and beans). It hides when nothing is owed; turn off "Show the tracker only while something is owed" to keep it up. Add `?tracker=only` to a second browser source of this overlay to place the panel anywhere, and `?tracker=off` to hide it in the first one.
- Monthly totals reset at your first stream in a new month. When the stream ends, an exercise in progress goes back on the owed list, and owed exercises are kept when you disable the extension.
