# Viewer Foundation

**Module:** `thsv.viewer-foundation` · **Version:** `4.1.67` · **Built in (integration)**

Provides named, configurable, privacy-conscious cross-platform points for chat consistency, observed active/lurk time, and supported community events.

Viewer Foundation is the built-in points and levels system of StreamBridge. Viewers earn points (you choose the name, such as Points, Acorns or Stars) for chatting, staying active, lurking, following, subscribing, gifting, cheering and raiding, across all your platforms. Other add-ons, such as Streamer Punishments, use these points when viewers spend them.

## What you need
- Nothing extra. Viewer Foundation ships and updates with StreamBridge and cannot be uninstalled separately.

## Set it up
1. Open Setup Wizard > Extensions > Viewer Foundation.
2. Name your points (Points by default) and choose the balance command (`!points`) and lurk command (`!lurk`).
3. Set the awards: points per chat message, the consistency bonus, active-chat time, lurk time, and points for follows, subs, memberships, gifts, cheers, Super Chats, raids and reward redemptions.
4. Set the points needed per level (100 by default) and decide whether to keep the milestone achievements on.
5. Optional: link one viewer's accounts on different platforms with lines like `alex|twitch|123456` (viewer ID, platform, stable user ID). Never use a display name.
6. Save and restart StreamBridge. Commands and link changes only take effect after a restart.
7. To test, type `!points` in chat; you should get your balance and level back on the same platform.
8. Optional: turn on "Let moderators add and remove points in chat" to give your moderators `!addpoints` and `!removepoints`.

## Points list
The Viewer Foundation page in the wizard lists every viewer by name and platform with their points. You can:
- Search by name, sort by points, name or last seen, and page through the list.
- Press **Change** next to a viewer to add points, take points away, set an exact total, or delete them.
- Viewers saved before names were kept show their platform and get their name back automatically: from names other extensions saved (Lurk Tracker, Stream Bingo and others) when the list opens, or the next time they chat.
- **Delete everyone** clears the whole list at once after a confirmation. A daily backup under Your data can bring it back.
- Give points to everyone, or to everyone seen recently, in one go.
- Export the list as CSV (opens in Excel or Google Sheets) or JSON.
- Import a CSV or JSON file with `name` and `points` columns. You see a preview first and pick whether to add the points, keep the higher total, or replace totals. Names that have not chatted yet wait in the list and get their points the first time they chat. You can undo the last import.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!points` | Everyone | Replies with the viewer's own points and level. |
| `!lurk` | Everyone | Starts tracked lurk time (no chat reply). The viewer's next chat message ends the lurk and pays out lurk points. |
| `!addpoints name 50` | You and moderators, when turned on | Gives a viewer points. |
| `!removepoints name 50` | You and moderators, when turned on | Takes points away from a viewer. |
| `!points name` | You and moderators, when turned on | Shows another viewer's points and level. |

## Good to know
- Chat points have a 60 second cooldown per viewer, so spamming does not farm points.
- Silent watching cannot be checked the same way on every platform. Active-time points only pay out when a viewer keeps chatting within the activity window (20 minutes by default). Lurk time pays out on the viewer's next message or when your last platform goes offline. Catch-up awards are capped at 6 at once.
- Achievements are fixed milestones: First Steps (100), Regular (500), Community Supporter (1,000), Veteran (2,500) and Legend (5,000).
- Privacy: StreamBridge stores a private ID per viewer, their latest name and platform, their points and timestamps. It never keeps avatars, messages or money amounts. Accounts on different platforms are only linked when you link them. Deleting a viewer removes their name too.
- Under "Advanced" the wizard page also lets you link accounts, correct points with a safe undo, and export one viewer's data.
- Test events from Streamer.bot do not award points unless you turn on "Award points for simulated events". The list keeps up to 2,000 viewers by default (3,000 at most); the least recently seen are dropped first.

## Where to find it

1. This integration ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from its dedicated **Viewer Foundation** wizard page, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

Viewer Foundation has no browser source. Features request only its bounded private projections.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable viewer progression | Turn off to pause points. | On |
| Award points for simulated events | Keep disabled outside deliberate testing. | Off |
| Points name | What your points are called, like Acorns or Stars. | `Points` |
| Balance command | Viewers use this command to check their current points and level. | `points` |
| Explicit account links | One per entry: viewer-id\|platform\|stable-user-id. Example: alex\|twitch\|123456. Never use a display name. IDs shaped like generated platform hashes are reserved. | (none) |
| Chat message points |  | 1 |
| Chat award cooldown per viewer (seconds) |  | 60 |
| Messages required for a consistency bonus |  | 5 |
| Chat consistency bonus |  | 5 |
| Active-chat minutes per award |  | 10 |
| Active-chat time points |  | 5 |
| How long a viewer remains active after chatting (minutes) |  | 20 |
| Lurk command | Starts lurk time. The next chat message ends it. | `lurk` |
| Let moderators add and remove points in chat | Moderators can use !addpoints name 100, !removepoints name 50 and !points name. | Off |
| Add points command (moderators) |  | `addpoints` |
| Remove points command (moderators) |  | `removepoints` |
| Lurk minutes per award |  | 10 |
| Lurk time points |  | 5 |
| Maximum time awards settled at once | Stops a late or delayed event from giving a huge catch-up award. | 6 |
| Follow points |  | 25 |
| Twitch/Kick subscription points |  | 100 |
| YouTube membership points |  | 100 |
| Gifted subscription points |  | 75 |
| Platform gift points |  | 50 |
| Cheer / bits event points |  | 25 |
| Super Chat / Jewels event points |  | 100 |
| Raid points |  | 100 |
| Reward redemption points |  | 25 |
| Points required per level |  | 100 |
| Enable milestone achievements | Gives achievements based on points, without saving any extra viewer details. | On |
| Maximum tracked viewers |  | 2000 |
| Recent events remembered (to avoid double counting) |  | 200 |
| How long recent events are remembered (hours) |  | 168 |

## Health checks

- **thsv.viewer-foundation.runtime:** Checks your points name, private viewer matching, chat/watch-time/event points within their limits, protection against counting an event twice, and safe saving of private progress.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `viewer.foundation.provide`, `chat.send`.

Private storage: `data/addons/thsv.viewer-foundation/`, `data/addons/.state/thsv.viewer-foundation/`.

Dependencies: none.

## Remove or repair

1. Viewer Foundation is a required Bridge integration and cannot be uninstalled separately.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
