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

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!points` | Everyone | Replies with the viewer's own points and level. |
| `!lurk` | Everyone | Starts tracked lurk time (no chat reply). The viewer's next chat message ends the lurk and pays out lurk points. |

## Good to know
- Chat points have a 60 second cooldown per viewer, so spamming does not farm points.
- Silent watching cannot be checked the same way on every platform. Active-time points only pay out when a viewer keeps chatting within the activity window (20 minutes by default). Lurk time pays out on the viewer's next message or when your last platform goes offline. Catch-up awards are capped at 6 at once.
- Achievements are fixed milestones: First Steps (100), Regular (500), Community Supporter (1,000), Veteran (2,500) and Legend (5,000).
- Privacy: StreamBridge stores only a private ID per viewer, their points and timestamps. It never keeps display names, avatars, messages or money amounts. Accounts on different platforms are only linked when you link them.
- The wizard page lets you search viewers, link accounts, correct points (with a safe undo), export one viewer's data, and delete a viewer. None of this is a chat command.
- Test events from Streamer.bot do not award points unless you turn on "Award points for simulated events". The system tracks up to 250 viewers by default; the least recently seen are dropped first.
