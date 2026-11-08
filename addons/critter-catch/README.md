# Critter Catch

Critter Catch lets wild Village Critters wander onto your stream now and then. Viewers (Keepers) throw a Jar with `!catch`, paid with Viewer Foundation points, a channel point reward or a gift. Each throw is rolled fairly, and every Keeper whose Jar lands adds the critter to their own Field Journal. A missed throw can scare the critter off, and a rare shiny Glimmer version turns up about once in 200 visits.

## What you need
- An OBS (or Meld/Streamlabs) browser source: `http://127.0.0.1:8787/overlay/addons/thsv.critter-catch`, 1920x1080. On a vertical canvas use 1080x1920.
- Viewer Foundation turned on (it holds the points). Nothing else: no Streamer.bot import, rewards or actions are needed.

## Set it up
1. Open Setup Wizard > Extensions > Critter Catch.
2. Tick the platforms it works on.
3. Pick which critters visit: the 151 built-in Village Critters, your own list (name, rarity, type, a picture link and a Field Journal entry), or both.
4. Set what a Jar, Honey Jar and Moon Jar cost. Optionally name channel point rewards or gifts that throw a Jar for free.
5. Turn on **Enable Critter Catch**, save, restart StreamBridge, add the browser source and press **Send a critter now** in the Control Panel to try it.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!catch` | Everyone | Throws a Jar at the critter on screen. |
| `!catch honey` | Everyone | Throws a Honey Jar (1.5 times the catch chance). |
| `!catch moon` | Everyone | Throws a Moon Jar (2.5 times the catch chance). |
| `!catch journal` | Everyone | How many critters you have caught, and how many Glimmers. |
| `!catch top` | Everyone | This month's top three Keepers. |
| `!catch info Pinecub` | Everyone | The Field Journal entry for a critter you have caught. |
| `!catch spawn` or `!catch spawn Pinecub` | Moderators and you | Sends a random critter, or the one you name, right now. |
| `!catch end` | Moderators and you | Makes the critter on screen wander off. |
| `!catch pause` / `!catch resume` | Moderators and you | Stops or restarts visits. |

## How catching works
- One critter visits at a time and stays for a set time (90 seconds for Common, 75 Uncommon, 60 Rare, 120 Guardian).
- The catch chance is the critter's catch rate times the Jar bonus, capped at 90% (25% for Guardians). Glimmers are a little harder to catch.
- After a missed throw the critter may run off: 5% Common, 10% Uncommon, 15% Rare, 20% Guardian.
- Visits are weighted Common 55, Uncommon 30, Rare 12, Guardian 3, with at most 3 Guardian visits a month. Every number can be changed in the settings.
- Linked accounts share one Field Journal. Monthly catches reset on the 1st with a hall of fame; Field Journals never reset.
