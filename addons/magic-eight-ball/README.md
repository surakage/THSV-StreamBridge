# Magic 8-Ball

Viewers ask a yes-or-no question and the Magic 8-Ball answers. It works with Twitch and Kick channel point rewards and, if you want, a chat command on Twitch, YouTube, Kick and TikTok. The answer is sent only to the chat the question came from, and can also show on stream as a card.

No Streamer.bot import is needed. Rewards and commands already reach StreamBridge through the normal platform intakes.

## Set it up
1. On Twitch and/or Kick, create a channel point reward, for example **Magic 8-Ball**. Turn on **Require viewer to enter text** so viewers can type their question.
2. In Streamer.bot, right-click the reward and choose **Copy Reward Id**.
3. Open Setup Wizard > Extensions > Community Play > Magic 8-Ball and paste the ID into **Twitch reward ID** or **Kick reward ID**.
4. Optional: set a **Chat command**, such as `ask`, so viewers can type `!ask will I win?`. Village Fun Commands already has `!8ball`; if you want this extension to own `!8ball`, turn the 8-Ball command off there first so chat does not get two answers.
5. Optional: in OBS, add a 1920x1080 browser source with `http://127.0.0.1:8787/overlay/addons/thsv.magic-eight-ball` to show each question and answer.
6. Turn on **Enable Magic 8-Ball** and restart StreamBridge.

## How it behaves
- A reward always gets an answer, because the viewer already spent their points. If they left the question empty, the shorter **no question** message is used.
- The command has a cooldown for everyone and a cooldown per viewer. A command with no question is ignored.
- Answers come from the 18 built-in answers, or from your own list if you add one. By default the same answer is never given twice in a row.
- Messages use `{viewer}`, `{question}`, `{answer}` and, for the cooldown message, `{seconds}`.
