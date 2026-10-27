# Village Fun Commands

**Module:** `thsv.village-fun-commands` · **Version:** `4.0.55` · **Built in (extension)**

Adds safe, source-routed facts, jokes, social interactions, and lightweight utility fun commands with bounded offline fallbacks.

Village Fun Commands adds a bundle of light-hearted chat commands: sloth facts, cat facts, jokes, fun facts, number facts, a Magic 8-Ball, hugs with a leaderboard, dice, picking from a list, ratings, random colors, your local time, and Twitch follow age. Each command answers once, in the chat of the platform where it was typed.

## What you need
- The Village Fun Commands Streamer.bot package, kept triggerless:
  - **THSV Addon - Village Fun Commands - Fetch Fun Content**: approve it if "Use online providers" is on (it is by default).
  - **THSV Addon - Village Fun Commands - Twitch Follow Age**: approve it if you keep `!followage` on.
- No Streamer.bot command objects. StreamBridge reads the commands from your existing platform chat actions.

## Set it up
1. Open Setup Wizard > Add-ons, install Village Fun Commands.
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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Village Fun Commands`

- `THSV Addon - Village Fun Commands - Fetch Fun Content` in `THSV Addon - Village Fun Commands`
- `THSV Addon - Village Fun Commands - Twitch Follow Age` in `THSV Addon - Village Fun Commands`

Both helper actions are broker-dispatched and must remain triggerless. Viewer commands register through the existing THSV platform chat intakes.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-fun-commands` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Village Fun Commands |  | Off |
| Use online providers when available |  | On |
| Avoid recent repeats |  | On |
| Shared cooldown (seconds) |  | 5 |
| Per-viewer cooldown (seconds) |  | 20 |
| Sloth facts |  | On |
| Sloth fact command |  | `slothfact` |
| Cat facts |  | On |
| Cat fact command |  | `catfact` |
| Family-friendly jokes |  | On |
| Joke command |  | `joke` |
| Fun facts |  | On |
| Fun fact command |  | `funfact` |
| Number facts |  | On |
| Number fact command |  | `numberfact` |
| Magic 8-Ball |  | On |
| 8-Ball command |  | `8ball` |
| Hugs and hug leaderboard |  | On |
| Hug command |  | `hug` |
| Hug leaderboard command |  | `hugs` |
| Streamer timezone and local time |  | On |
| Timezone command |  | `timezone` |
| Streamer timezone | Leave blank to use this PC's time zone, or enter an IANA timezone such as America/Chicago, America/New_York, Europe/London, or Asia/Tokyo. | (blank) |
| Timezone response label |  | `Streamer time` |
| Dice rolls |  | On |
| Dice command |  | `dice` |
| Pick from a list |  | On |
| Pick command |  | `pick` |
| Playful ratings |  | On |
| Rate command |  | `rate` |
| Random colors |  | On |
| Random color command |  | `randomcolor` |
| Twitch follow age | Twitch-only self lookup using the broadcaster connection held by Streamer.bot. | On |
| Follow age command |  | `followage` |
| Chuck Norris jokes |  | Off |
| Chuck Norris command |  | `chucknorris` |
| Aesthetic text |  | Off |
| Aesthetic command |  | `aesthetic` |
| Additional sloth facts |  | (none) |
| Additional cat facts |  | (none) |
| Additional family-friendly jokes |  | (none) |
| Additional fun facts |  | (none) |
| Additional number facts |  | (none) |
| Additional Chuck Norris jokes |  | (none) |

## Health checks

- **thsv.village-fun-commands.runtime:** Confirms automatic fun commands, bounded provider relays, source-only replies, and offline fallbacks are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `streamerbot.run-approved-action`, `schedule.bounded`.

Private storage: `data/addons/thsv.village-fun-commands/`, `data/addons/.state/thsv.village-fun-commands/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only bounded cooldown, recent-response, and hug-count state.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
