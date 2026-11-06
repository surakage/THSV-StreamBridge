# Viewer Foundation

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
The Viewer Foundation page in the wizard lists every viewer by name with their points and level. You can:
- Search by name, sort by points, name or last seen, and page through the list.
- Give or take points, set an exact total, or delete a viewer.
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
