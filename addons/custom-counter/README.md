# Custom Counter

Custom Counter gives you up to 20 named counters that remember their value between streams, such as deaths, wins or push-ups. You and your moderators change them with chat commands, and a counter card on your overlay shows the most recently changed counter. Counters can also go up automatically for follows, subs, memberships or raids.

## What you need
- A browser source for the counter card. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.custom-counter`).
- Nothing extra for chat commands. They arrive through your main chat intakes. Do not create Streamer.bot commands for them.
- Optional: the Custom Counter Streamer.bot package, only if you want hotkeys or Stream Deck buttons. It has one action, **THSV Addon - Custom Counter - Controller**. Attach it only to your own hotkeys, buttons or other trusted non-chat triggers.

## Set it up
1. Open the Setup Wizard and go to **Extensions > Community Play > Custom Counter**.
2. **Start here**: name your first counter and choose the value that Reset goes back to (default 0).
3. **Create distinct counter commands**: tick **Enable moderator chat command** (it is off by default). Add one line per counter, as `command=counter-id|Display name`, for example `death=deaths|Deaths` and `win=wins|Wins`.
4. **Optional automatic counting**: enter how much to add for each follow, sub, YouTube membership or raid. Zero means ignored. These go to your first (default) counter.
5. **Overlay layout** and **Overlay style**: set the icon, layout, font, colors, border and animation. For the icon, use a 512 x 512 transparent PNG or WebP image URL.
6. Save and restart StreamBridge so the commands register.
7. Copy the overlay URL from the wizard and add it as a browser source in OBS, Meld or Streamlabs Desktop.
8. Test it: type `!death` in your own chat. The card should change and chat should reply with the new value.
9. Optional hotkeys: import the `.sb` file. In each copy of **Controller**, set `counterOperation` (for example `increment`), `counterId` (for example `deaths`) and `counterName`.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!death` (your own command) | Broadcaster and moderators | Adds 1 to that counter. |
| `!death -1` | Broadcaster and moderators | Takes 1 away. |
| `!death add 10` / `!death subtract 10` | Broadcaster and moderators | Adds or takes away an amount. |
| `!death set 5` | Broadcaster and moderators | Sets an exact value. |
| `!death reset` | Broadcaster and moderators | Goes back to the reset value. |
| `!death show` / `!death hide` | Broadcaster and moderators | Shows or hides the counter on the overlay. |
| `!death rename Boss Deaths` | Broadcaster and moderators | Changes the display name. |
| `!streamcounter deaths +1` | Broadcaster and moderators | Same controls using one shared command: `!streamcounter <counter> <action> [value]`. |

## Good to know
- Commands only work when **Enable moderator chat command** is on. You can turn off broadcaster or moderator access separately.
- A counter is created the first time it is used. By default you can keep 10 counters (up to 20). When the limit is reached, new counters are refused.
- Duplicate or badly formatted command lines are ignored, and commands that clash with another add-on are blocked.
- The overlay shows one counter at a time: whichever was changed last.
- Values are saved and survive restarts and reinstalls. No chat text or viewer details are kept.
