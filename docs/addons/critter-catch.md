# Critter Catch

**Module:** `thsv.critter-catch` · **Version:** `4.1.67` · **Built in (extension)**

Wild Village Critters wander onto the stream now and then. Viewers throw Jars with !catch, a channel point reward or a gift, paid with Viewer Foundation points, and each catch goes into their own Field Journal.

Critter Catch lets wild Village Critters wander onto your stream now and then. Viewers (Keepers) throw a Jar with `!catch`, paid with Viewer Foundation points, a channel point reward or a gift. Each throw is rolled fairly, and every Keeper whose Jar lands adds the critter to their own Field Journal. A missed throw can scare the critter off, and a rare shiny Glimmer version turns up about once in 200 visits.

## What you need
- An OBS (or Meld/Streamlabs) browser source: `http://127.0.0.1:8787/overlay/addons/thsv.critter-catch`, 1920x1080. On a vertical canvas use 1080x1920.
- Viewer Foundation turned on (it holds the points). No Streamer.bot import is needed for `!catch`.
- Optional: Twitch or Kick channel point rewards that throw a Jar (see below). Turning the Twitch rewards on and off needs the Reward Administration action from the Streamer.bot import.

## Set it up
1. Open Setup Wizard > Extensions > Critter Catch.
2. Tick the platforms it works on.
3. Pick which critters visit: the 151 built-in Village Critters, your own list (name, rarity, type, a picture link and a Field Journal entry), or both.
4. Set what a Jar, Honey Jar and Moon Jar cost. Optionally name channel point rewards or gifts that throw a Jar for free.
5. Turn on **Enable Critter Catch**, save, restart StreamBridge, add the browser source and press **Send a critter now** in the Control Panel to try it.

## Channel point rewards (Twitch and Kick)
Create these rewards on Twitch and Kick (suggested; change names and costs as you like):

| Reward | Cost | Prompt | Jar |
| --- | --- | --- | --- |
| Throw a Jar | 500 | Throw a Jar at the critter on screen! | `jar` |
| Throw a Honey Jar | 1,500 | A sticky Honey Jar: 1.5 times the catch chance. | `honey` |
| Throw a Moon Jar | 4,000 | A glowing Moon Jar: 2.5 times the catch chance. | `moon` |

Create the **Twitch** rewards in Streamer.bot (Platforms > Twitch > Channel Point Rewards > Add), not on the Twitch dashboard: Twitch only lets the app that created a reward turn it on and off or refund it, so a dashboard-made reward still throws Jars but stays on all the time. Turn off **Skip Reward Queue** (so a redemption that cannot throw is refunded) and add a short cooldown (5 seconds). Then, under **Jars and catching**, add one row per reward with its **reward ID** (shown in the Bridge's reward list and Reward Timers) and the Jar. To have Twitch and Kick use only rewards while YouTube, TikTok and Facebook type `!catch`, untick Twitch and Kick under **Where typing !catch throws a Jar**.

With **Turn the Twitch Jar rewards on only while a critter is on screen**, the Twitch rewards switch on when a critter wanders in and off when it is caught, runs off or leaves. Kick rewards stay on, because Streamer.bot has no Kick reward controls yet; a Kick redemption with no critter on screen is not refunded.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!catch` | Everyone | Throws a Jar at the critter on screen (on platforms where typing throws). |
| `!catch honey` | Everyone | Throws a Honey Jar (1.5 times the catch chance). |
| `!catch moon` | Everyone | Throws a Moon Jar (2.5 times the catch chance). |
| `!catch journal` | Everyone | How many critters you have caught, and how many Glimmers. |
| `!catch top` | Everyone | This month's top three Keepers. |
| `!catch info Pinecub` | Everyone | The Field Journal entry for a critter you have caught. |
| `!catch spawn` or `!catch spawn Pinecub` | Moderators and you | Sends a random critter, or the one you name, right now. |
| `!catch end` | Moderators and you | Makes the critter on screen wander off. |
| `!catch pause` / `!catch resume` | Moderators and you | Stops or restarts visits. |

## Where critters visit
By default each critter visits **one platform at a time**: one whose chat is active, meaning at least 2 different people chatted there in the last 10 minutes. You, your own connected accounts, the streamer role and bots never count. When several chats are active, the platforms take turns, starting with the one that waited longest, with the usual wait between visits. Only that platform's chat hears about the visit and can throw Jars, and the on-screen plate shows which platform it is visiting. A moderator's `!catch spawn` sends the critter to the moderator's own platform. Choose **Every platform at once** under Visits for one shared critter instead.

## How catching works
- One critter visits at a time and stays for a set time (90 seconds for Common, 75 Uncommon, 60 Rare, 120 Guardian).
- The catch chance is the critter's catch rate times the Jar bonus, capped at 90% (25% for Guardians). Glimmers are a little harder to catch.
- After a missed throw the critter may run off: 5% Common, 10% Uncommon, 15% Rare, 20% Guardian.
- Visits are weighted Common 55, Uncommon 30, Rare 12, Guardian 3, with at most 3 Guardian visits a month. Every number can be changed in the settings.
- Linked accounts share one Field Journal. Monthly catches reset on the 1st with a hall of fame; Field Journals never reset.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.critter-catch` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Critter Catch |  | Off |
| Platforms it works on | Viewers on these platforms can throw Jars, and wild critters are announced in their chats. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Where typing !catch throws a Jar | Untick a platform (such as Twitch or Kick) to throw only with the channel point rewards listed under Jars. !catch journal, top and info still work everywhere. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Chat command | Viewers type it to throw a Jar. Add honey or moon for a stronger Jar, journal for their Field Journal, top for this month's best Keepers, or info and a critter's name. Moderators add spawn, end, pause or resume. Do not include the ! prefix. | `catch` |
| Word for a Honey Jar | Viewers type !catch honey. Change it to match your language. | `honey` |
| Word for a Moon Jar | Viewers type !catch moon. | `moon` |
| Which critters visit | The 151 built-in Village Critters, your own list, or both. | `village` |
| Your own critters | Each row is one critter: its name, rarity, type, a picture link (https, a PNG, GIF or WebP) and its Field Journal entry. | (none) |
| Jar cost | Viewer Foundation points for one throw. 0 makes it free. | 50 |
| Honey Jar cost | A Honey Jar catches 1.5 times as often as a Jar. | 150 |
| Moon Jar cost | A Moon Jar catches 2.5 times as often as a Jar. | 400 |
| Rewards and gifts that throw a Jar | Use a Twitch or Kick channel point reward's ID (from Reward Timers or the Bridge's reward list) or its exact name, or a TikTok or YouTube gift name. The viewer already paid, so no Viewer Foundation points are taken. | (none) |
| Turn the Twitch Jar rewards on only while a critter is on screen | Needs the reward IDs above, the Reward Administration action in Streamer.bot, and Twitch rewards created in Streamer.bot (Twitch only lets the app that made a reward switch or refund it). A Twitch redemption that cannot throw (no critter, or already caught) is refunded. Kick rewards stay on: Streamer.bot has no Kick reward controls yet. | On |
| Who catches it | Everyone whose throw lands gets the critter, or only the first and then it leaves. | `everyone` |
| Seconds between one Keeper's throws |  | 5 |
| Highest catch chance (%) | No throw is ever surer than this. | 90 |
| Highest catch chance for Guardians (%) |  | 25 |
| Shortest wait between visits (minutes) |  | 6 |
| Longest wait between visits (minutes) |  | 12 |
| Where critters visit | One platform at a time: each critter visits one platform whose chat is active, and platforms take turns. Every platform at once: one critter for everyone. | `active-platform` |
| Chatters needed for a platform to get visits | Different people (not you, your accounts or bots) who chatted in the last few minutes. | 2 |
| Count chatters from the last (minutes) |  | 10 |
| Every platform at once: only visit while chat is active | Critters wait until someone has chatted in the last 10 minutes, so none wander in while you are offline. | On |
| How often Common critters visit | A share of all visits compared with the other rarities. 0 stops them. | 55 |
| How often Uncommon critters visit | A share of all visits compared with the other rarities. 0 stops them. | 30 |
| How often Rare critters visit | A share of all visits compared with the other rarities. 0 stops them. | 12 |
| How often Guardian critters visit | A share of all visits compared with the other rarities. 0 stops them. | 3 |
| Guardian visits per month |  | 3 |
| Glimmer odds (1 in ...) | How rare a shiny Glimmer critter is. 0 turns Glimmers off. | 200 |
| Seconds a Common critter stays |  | 90 |
| Seconds a Uncommon critter stays |  | 75 |
| Seconds a Rare critter stays |  | 60 |
| Seconds a Guardian critter stays |  | 120 |
| Chance a Common critter runs off after a miss (%) |  | 5 |
| Chance a Uncommon critter runs off after a miss (%) |  | 10 |
| Chance a Rare critter runs off after a miss (%) |  | 15 |
| Chance a Guardian critter runs off after a miss (%) |  | 20 |
| Tell chat when a critter wanders in |  | On |
| Critter wanders in | Placeholders: {critter}, {rarity}, {type}, {command}. | `A wild {critter} ({rarity}) wandered in! Type !{command} to throw a Jar.` |
| Glimmer critter wanders in |  | `A shimmering Glimmer {critter} ({rarity}) wandered in! Type !{command} to throw a Jar.` |
| A critter wandered in (reward-only platforms) | Sent on platforms where !catch does not throw. | `A wild {critter} ({rarity}) wandered in! Redeem a Jar channel point reward to throw one.` |
| Caught | Placeholders: {name}, {critter}, {jar}, {number}, {count}, {total}. | `{name} caught {critter} with a {jar}! Field Journal: {count} of {total}.` |
| Glimmer caught |  | `{name} caught a Glimmer {critter} with a {jar}! Field Journal: {count} of {total}.` |
| Post the Field Journal entry after the first catch |  | On |
| Field Journal entry line | Sent once per visit, after the first catch. {number}, {critter}, {entry}, {type}, {rarity}. | `Field Journal #{number} {critter}: {entry}` |
| Tell the thrower when a Jar misses |  | Off |
| Missed |  | `{critter} broke out of {name}'s {jar}!` |
| Ran off after a miss |  | `{critter} broke out of {name}'s {jar} and scurried off into the woods.` |
| Tell chat when nobody caught it |  | On |
| Wandered off |  | `{critter} wandered off. Watch for the next visitor!` |
| Not enough points |  | `{name}, a {jar} costs {cost} {currency}. You have {points}.` |
| Typed !catch where only rewards throw |  | `{name}, here you throw a Jar by redeeming a Jar channel point reward.` |
| No critter right now |  | `No critter is wandering about right now. Watch the stream!` |
| Critter is on another platform |  | `{name}, {critter} is visiting {platformName} chat right now. The next one may wander in here!` |
| Already caught this one |  | `{name}, you already caught {critter} on this visit. Wait for the next critter!` |
| Threw too soon |  | `{name}, catch your breath. You can throw again in {seconds}s.` |
| !catch journal |  | `{name}'s Field Journal: {count} of {total} critters, {glimmers} Glimmer. {month} caught this month.` |
| !catch top |  | `Top Keepers this month: {top}` |
| No catches yet |  | `Nobody has caught a critter yet this month.` |
| !catch info |  | `#{number} {critter} ({rarity} {type}): {entry}` |
| !catch info for a critter they lack |  | `{name}, you have not caught {critter} yet.` |
| Where critters wander in |  | `bottom-right` |
| Critter size |  | `medium` |
| Show who threw each Jar |  | On |
| Hint under the critter |  | `Type !{command}` |
| On-screen hint when some platforms use rewards |  | `Type !{command} or redeem a Jar` |
| Word before a critter's name |  | `A wild` |
| Word for a shiny critter |  | `Glimmer` |
| Caught banner |  | `Caught!` |
| Broke free banner |  | `Broke free!` |
| Ran off banner |  | `It ran off!` |
| Rarity names | In this order: Common, Uncommon, Rare, Guardian. | `Common`, `Uncommon`, `Rare`, `Guardian` |
| Jar names | In this order: Jar, Honey Jar, Moon Jar. | `Jar`, `Honey Jar`, `Moon Jar` |
| Time zone for monthly stats | Monthly catches reset on the 1st in this time zone. Leave empty to use this PC's time zone. Example: America/Chicago. | (blank) |

## Health checks

- **thsv.critter-catch.runtime:** Confirms critters wander in on schedule, throws are paid and rolled fairly, catches land in Field Journals, and monthly stats reset on the 1st.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`, `rewards.administer`.

Private storage: `data/addons/thsv.critter-catch/`, `data/addons/.state/thsv.critter-catch/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable the extension and remove its browser source. Field Journals and monthly catches are kept until you delete its data.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
