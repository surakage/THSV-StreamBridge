# Control Panel

## What it is

The Control Panel is one small window for running your extensions while you are live. Each extension has its own tab. Extensions you have turned off are greyed out and cannot be picked.

It is a controller, not another wizard. Every tab is laid out the same way:

- **Now**: a strip of what the extension is doing, and its buttons in one even row.
- **Live lists**, such as owed exercises or the video queue, fold open and closed with a count.
- **Quick controls**: switches, one-tap choices, − / + steppers and short boxes. They save the moment you change them, with no Save button and no restart. Hover a control for its full explanation.
- **Lists** you edit, like exercises, Bean Boozle flavors, wheel choices or trivia questions, fold open and closed and each has its own **Save**.

Only the settings worth changing mid-stream are here. Everything else stays in the Setup Wizard.

Lists with several parts per row (exercises, screen effects, beans) show one box per part under a single header, and simple lists (wheel choices, blocked words) show as chips you remove with × and add to by typing and pressing Enter. Use **Find an extension** above the list to jump to a tab. The extension list and the open tab scroll on their own, so nothing is cut off.

Only one Control Panel is in charge at a time. If you open it again, the newer window takes over and the older one stops.

## Open it

Use any of these. Each one opens the panel already unlocked:

- the **Control Panel** button at the top of the Setup Wizard;
- **Open Control Panel** in the tray menu;
- the Streamer.bot action **THSV StreamBridge - Open Control Panel** from the Bridge Launcher import. Put it on a Stream Deck button or a hotkey.

You can also open `http://127.0.0.1:8787/wizard/panel` yourself, for example as an OBS custom browser dock. It asks for the Wizard password unless this PC is set to unlock without one (**Overview > Wizard unlock** in the Wizard).

## Tabs

| Tab | What you can do |
| --- | --- |
| Streamer Punishments | Mark the exercise in progress **Done**, add any exercise to the owed list yourself, remove or clear owed ones, fire a screen effect for free, **Spin Bean Boozle**, and edit exercises, effects and Bean Boozle beans |
| Prize Wheel | **Spin** the wheel or **Preview spin** without telling chat; edit the choices and slice colors |
| Village Jukebox | Approve, play now, skip, stop, block and set the volume; the [Jukebox remote](../addons/village-jukebox.md) has the full player |
| Scoreboard | See today's numbers next to your records, correct a row with +1/−1, reset for a new stream |
| Goal Bars | Add or remove progress by hand, reset a goal, change labels and targets |
| Village Draw | Open entries, close them, draw and confirm a winner, draw again or cancel with refunds |
| Village Polls | Type a poll in, watch the votes, close it and post the results |
| Custom Counter | +1, −1, add, set or reset, with the current value |
| Subathon Timer | Start, pause, add minutes and see the time left; change how much time each event adds |
| Starting Soon Countdown | Start, pause, set and start, finish now |
| Stream Break & End Guard | Pause or resume the break and end-of-stream automation |
| Viewer Lobby | Open or close the lobby, pick the next or a random player |
| Village Hydration Station | Log a drink, undo, snooze or send the reminder, change your goal |
| Village Voice | Pause, resume or stop text-to-speech |
| Quote Vault | Add quotes, approve suggested ones, delete or restore them |
| Raid Scout | Suggest a raid target, or run **Finish Stream**; turn viewer raid suggestions on or off and link their Twitch reward |
| Chat Play Pack, Magic Eight Ball, Village Fun Commands, Chat Guard, Face Filters | Edit your own trivia, words, answers, jokes, blocked words and links, and lenses |
| Random Clip Player, Fan Crown, First Five, Category Pilot, Ad Break Companion | Their start, stop, reset or preview buttons |

## Common problems

| Problem | Fix |
| --- | --- |
| A tab is greyed out | Turn that extension on in the Setup Wizard, save, and restart StreamBridge |
| "Opened in another window" | A newer Control Panel took over. Use that one, or press **Use this window instead** |
| A setting you want is not in the tab | Only settings that are safe to change while live are offered here. Change the rest in the Setup Wizard |
