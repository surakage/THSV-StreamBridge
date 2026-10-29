# Magic 8-Ball

**Module:** `thsv.magic-eight-ball` · **Version:** `4.0.60` · **Built in (extension)**

Answers viewers' yes-or-no questions from Twitch and Kick channel point rewards or an optional chat command, in the chat the question came from, with an optional overlay card.

Viewers ask a yes-or-no question and the Magic 8-Ball answers. It works with Twitch and Kick channel point rewards and, if you want, a chat command on Twitch, YouTube, Kick and TikTok. The answer is sent only to the chat the question came from, and can also show on stream as a card.

No Streamer.bot import is needed. Rewards and commands already reach StreamBridge through the normal platform intakes.

## Set it up
1. On Twitch and/or Kick, create a channel point reward, for example **Magic 8-Ball**. Turn on **Require viewer to enter text** so viewers can type their question.
2. In Streamer.bot, right-click the reward and choose **Copy Reward Id**.
3. Open Setup Wizard > Extensions > Community Play > Magic 8-Ball and paste the ID into **Twitch reward ID** or **Kick reward ID**.
4. Optional: set a **Chat command**, such as `ask`, so viewers can type `!ask will I win?`. Village Fun Commands already has `!8ball`; if you want this extension to own `!8ball`, turn the 8-Ball command off there first so chat does not get two answers.
5. Optional: in OBS, add a 1920x1080 browser source with `http://127.0.0.1:8787/overlay/addons/thsv.magic-eight-ball` to show each question and answer. The card appears for 8 seconds after each question; scale or crop the source so the card sits in free space, away from your webcam, chat and gameplay.
6. Turn on **Enable Magic 8-Ball** and restart StreamBridge.

## How it behaves
- A reward always gets an answer, because the viewer already spent their points. If they left the question empty, the shorter **no question** message is used.
- The command has a cooldown for everyone and a cooldown per viewer. A command with no question is ignored.
- Answers come from the 18 built-in answers, or from your own list if you add one. By default the same answer is never given twice in a row.
- Messages use `{viewer}`, `{question}`, `{answer}` and, for the cooldown message, `{seconds}`.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.magic-eight-ball` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Magic 8-Ball |  | Off |
| Twitch reward ID | Right-click the reward in Streamer.bot and choose Copy Reward Id. Turn on "Require viewer to enter text" so viewers can type their question. | (blank) |
| Kick reward ID | Copy the Kick reward ID the same way. Kick rewards have no cooldown of their own; every redemption gets an answer. | (blank) |
| Chat command (optional) | For example ask, so viewers type !ask will I win? Leave empty for rewards only. If you choose 8ball, turn off the 8-Ball command in Village Fun Commands. | (blank) |
| Chats that can use the command |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Command cooldown for everyone (seconds) |  | 5 |
| Command cooldown per viewer (seconds) |  | 30 |
| Your own answers (optional) | One answer per row. Leave empty to use the 18 built-in answers. | (none) |
| Never give the same answer twice in a row |  | On |
| Answer message | Placeholders: {viewer}, {question}, {answer}. | `🎱 {viewer} asked "{question}" - {answer}` |
| Answer when a reward has no question | Placeholders: {viewer}, {answer}. | `🎱 {viewer}, the 8-Ball says: {answer}` |
| Cooldown message | Placeholders: {viewer}, {seconds}. | `{viewer}, the 8-Ball is resting. Ask again in {seconds}s.` |
| Show the question and answer on the overlay |  | On |
| Overlay seconds |  | 8 |
| Overlay title |  | `Magic 8-Ball` |

## Health checks

- **thsv.magic-eight-ball.runtime:** Confirms reward and command matching, cooldowns, and source-platform-only replies.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.magic-eight-ball/`, `data/addons/.state/thsv.magic-eight-ball/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source if you added one.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
