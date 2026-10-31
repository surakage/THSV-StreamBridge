# Village Fun Commands

Village Fun Commands adds a bundle of light-hearted chat commands: sloth facts, cat facts, jokes, fun facts, number facts, a Magic 8-Ball, hugs with a leaderboard, dice, picking from a list, ratings, random colors, your local time, and Twitch follow age. Each command answers once, in the chat of the platform where it was typed.

## What you need
- The Village Fun Commands Streamer.bot package, kept triggerless:
  - **THSV Addon - Village Fun Commands - Fetch Fun Content**: approve it if "Use online providers" is on (it is by default).
  - **THSV Addon - Village Fun Commands - Twitch Follow Age**: approve it if you keep `!followage` on.
- No Streamer.bot command objects. StreamBridge reads the commands from your existing platform chat actions.

## Set it up
1. Open Setup Wizard > Extensions, install Village Fun Commands.
2. Turn on the commands you want and rename any of them. Chuck Norris jokes and Aesthetic text start off.
3. Optional: set your timezone (for example `America/Chicago` or `Europe/London`); leave it blank to use this PC's time zone.
4. Optional: add your own sloth facts, cat facts, jokes, fun facts, number facts or Chuck Norris jokes.
5. Import the Streamer.bot package and approve the actions you need in the wizard. Leave them without triggers.
6. Turn on "Enable Village Fun Commands", save and restart StreamBridge.
7. Test `!hug SomeViewer`, `!hugs` and `!timezone` in one connected chat. If you had older Hug or Timezone commands in Streamer.bot, turn them off to avoid double replies.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!slothfact`, `!catfact`, `!funfact` | Everyone | Posts a random fact. |
| `!joke` | Everyone | Posts a family-friendly joke. |
| `!numberfact` or `!numberfact 42` | Everyone | Posts a fact about a random number or the one you give. |
| `!8ball question` | Everyone | Magic 8-Ball answer. |
| `!hug name` / `!hugs` | Everyone | Hugs a viewer and counts it / shows the top 3 hug receivers. |
| `!timezone` | Everyone | Shows your local time. |
| `!dice` or `!dice 20` | Everyone | Rolls a die (6 sides by default, 2 to 1000). |
| `!pick pizza, tacos, sushi` | Everyone | Picks one option (2 to 10, separated by commas or `\|`). |
| `!rate something` | Everyone | Gives a playful score out of 100. |
| `!randomcolor` | Everyone | Posts a random color. |
| `!followage` | Everyone (Twitch only) | Shows how long the viewer has followed. |
| `!chucknorris`, `!aesthetic text` | Everyone (off by default) | Chuck Norris joke / wide "aesthetic" text. |

## Good to know
- Cooldowns: 5 seconds between any two commands, and 20 seconds per viewer per command. Commands on cooldown are silently ignored.
- Cat facts, jokes, fun facts, number facts and Chuck Norris jokes come from free online services (Cat Facts, JokeAPI, Random Useless Facts, Numbers API, Chuck Norris Jokes API). If a service is down, a built-in fallback answers instead. Turn off online providers to use only the built-in lists.
- No viewer names or chat text are sent to those services. `!followage` asks Twitch using the connection Streamer.bot already has.
- JokeAPI runs in safe mode, but no public joke service can promise to match your own channel rules.
- The same thing keeps the same `!rate` score for the whole stream. Streamer.bot test events are ignored.
