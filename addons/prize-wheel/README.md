# Prize Wheel

Prize Wheel puts a spinning wheel with 2 to 10 equal slices on your stream. A moderator or the broadcaster types a chat command, the wheel spins and slows down with a clicking pointer, and a winner card appears. The result is then posted to the chats you choose. StreamBridge picks the winner before the animation starts, so the overlay cannot change the result.

## What you need
- An OBS (or Meld/Streamlabs) browser source for the wheel. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.prize-wheel`). The page is transparent outside the wheel panel.
- Nothing else. No Streamer.bot import, action approval or rewards are needed. The chat command registers automatically.

## Set it up
1. Open Setup Wizard > Add-ons > Prize Wheel.
2. Enter 2 to 10 unique choices, one per line. Only pressing Enter starts a new choice.
3. Check the spin command (default `spinwheel`), spin duration (default 9 seconds), winner card time (default 8 seconds) and cooldown (default 15 seconds).
4. Choose which chats get the winner message (Twitch, YouTube, Kick, TikTok) and edit each message. Use `{winner}` for the result.
5. Optional: change the heading, panel color, slice colors, text color, pointer color and winner highlight.
6. Copy the browser source URL and add it to your scene in OBS, Meld or Streamlabs.
7. Turn on **Enable Prize Wheel**, save, and restart StreamBridge so the command registers.
8. To test offline, open the browser source and press **Send preview** in the wizard. A preview never posts to chat. Then use Streamer.bot's command Test trigger to check one real command before going live.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!spinwheel` | Moderators and the broadcaster | Spins the wheel and announces the winner. |

## Good to know
- Every choice gets exactly the same size slice.
- Only one spin runs at a time, with a 15-second cooldown by default (5 to 300 seconds).
- Each chat has its own message length limit: Twitch and Kick 500, YouTube 200, TikTok 150 characters. Only connected chats can receive the message.
- If you give fewer slice colors than choices, the colors repeat.
- Prize Wheel is for casual fun and stream choices. Do not use it for gambling, legal drawings or high-value prizes.
- It only stores the last spin time, the last winner and a counter.
