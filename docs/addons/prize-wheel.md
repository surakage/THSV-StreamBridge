# Prize Wheel

**Module:** `thsv.prize-wheel` · **Version:** `4.0.56` · **Optional add-on**

Runs a creator-controlled equal-slice wheel with natural OBS animation, bounded multi-platform winner messages, and a result card.

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

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Prize-Wheel-4.0.56.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Prize-Wheel-4.0.56.thsv-addon` and review its permissions.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.prize-wheel` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Prize Wheel |  | Off |
| Moderator spin command | Registered automatically through the main chat intakes after restart. Do not include the ! prefix. | `spinwheel` |
| Wheel choices | Enter one unique choice per line. Every choice receives exactly the same-size slice. | `Option One`, `Option Two`, `Option Three`, `Option Four` |
| Spin duration (seconds) |  | 9 |
| Winner card duration (seconds) |  | 8 |
| Cooldown between spins (seconds) |  | 15 |
| Chats that receive the winner | Only enabled and connected destinations can accept a message. | `twitch`, `youtube`, `kick`, `tiktok` |
| Twitch winner message (500 characters) | Token: {winner}. The final rendered message is safely clamped to Twitch's configured limit. | `The wheel chose {winner}!` |
| YouTube winner message (200 characters) | Token: {winner}. | `The wheel chose {winner}!` |
| Kick winner message (500 characters) | Token: {winner}. | `The wheel chose {winner}!` |
| TikTok winner message (150 characters) | Token: {winner}. | `The wheel chose {winner}!` |
| Wheel heading |  | `SPIN THE WHEEL` |
| Panel color |  | `#101521` |
| Slice colors | Optional hex colors, one per line. Colors repeat safely when fewer colors than choices are supplied. | `#7c3aed`, `#0891b2`, `#16a34a`, `#ea580c`, `#dc2626`, `#2563eb`, `#c026d3`, `#ca8a04`, `#0d9488`, `#9333ea` |
| Wheel text color |  | `#ffffff` |
| Pointer and stud color |  | `#ffd166` |
| Winner highlight color |  | `#7ff5cc` |

## Health checks

- **thsv.prize-wheel.runtime:** Confirms bounded choices, serialized spins, delayed announcements, and the hosted wheel renderer.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.prize-wheel/`, `data/addons/.state/thsv.prize-wheel/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only the last bounded spin timestamp and winning choice.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
