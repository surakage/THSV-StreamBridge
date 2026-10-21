# Chat Play Pack

Chat Play Pack adds quick chat games for Twitch, YouTube, Kick and TikTok: Coin Flip, Slots, Color Roulette, Rock Paper Scissors, Number Guess, Trivia, Unscramble, Prediction and viewer Duels. Winners earn Viewer Foundation points, and losing never takes points away. Results appear in chat, and optional result cards can show on your overlay.

## What you need
- **Viewer Foundation**, installed and enabled first. It holds all the points.
- Nothing extra for viewer commands. They arrive through your main Twitch, YouTube, Kick and TikFinity chat intakes. Do not create Streamer.bot commands or Command Sync entries for them.
- Optional: the Chat Play Pack Streamer.bot package, only if you want online question or word sources. Import it, leave both actions without triggers, and approve only the ones you use:
  - **THSV Addon - Chat Play Pack - Fetch Trivia Questions** (for OpenTDB trivia)
  - **THSV Addon - Chat Play Pack - Fetch Unscramble Words** (for dictionary words)
- Optional: a browser source for result cards. Copy one of the URLs from the wizard. There are compact and regular sizes, each in landscape or vertical (for example compact landscape is 700 x 410).

## Set it up
1. Install and enable Viewer Foundation.
2. Open the Setup Wizard and go to **Extensions > Community Play > Chat Play Pack**. Tick **Enable Chat Play Pack**.
3. Switch on only the games you want. Number Guess, Trivia and Prediction are on by default. The others start off.
4. Trivia and Unscramble each come with 20 ready-made entries. Add your own as `Question | Correct answer | Alternate 1; Alternate 2` for trivia and `Word | Optional hint` for Unscramble.
5. Choose a source for each: your own list, the online source, or mixed (online first, your list as backup).
6. Keep the default points, cooldowns and hourly limit for now.
7. Save and restart StreamBridge so the commands register.
8. If you use the online sources, import the `.sb` file and approve the fetch action(s).
9. Test it: in your own chat, type `!coinflip heads` (if Coin Flip is on) or `!play number` as the broadcaster. Add the browser source and use **Show exact template** in the wizard to check the card.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!play number`, `!play trivia`, `!play unscramble` | Moderators and the broadcaster | Starts a shared round. |
| `!play stop` | Moderators and the broadcaster | Ends the current shared round. |
| `!guess <number>` | Everyone | Guesses in Number Guess. |
| `!answer <text>` | Everyone | Answers Trivia or Unscramble. |
| `!predict open Question \| Choice 1 \| Choice 2` | Moderators and the broadcaster | Opens a prediction with 2-6 choices. |
| `!predict <number>` | Everyone | Votes for a prediction choice. |
| `!predict resolve <number>` | Moderators and the broadcaster | Picks the winning choice and awards points. |
| `!coinflip heads` or `tails` | Everyone | Flips a coin. |
| `!slots` | Everyone | Spins the slots. |
| `!roulette red`, `black` or `green` | Everyone | Plays Color Roulette. |
| `!rps rock`, `paper` or `scissors` | Everyone | Plays Rock Paper Scissors. |
| `!duel @name` | Everyone | Challenges another viewer to a duel. |
| `!accept` / `!decline` | The challenged viewer | Answers a duel challenge within 5 minutes. |

## Good to know
- You can rename every command and the `!` prefix in the wizard. Games that are switched off do not respond.
- Anti-farming defaults: a 30-second cooldown per viewer for solo games, 5 minutes between duel challenges, and at most 250 game points per viewer per hour across all games. Shared rounds time out after 2 minutes.
- A duel target must have chatted on the same platform in the last 30 minutes.
- Solo results reply only on the platform the viewer used. Shared rounds can be announced on every platform you are live on.
- Online sources only send filters, word lengths and batch sizes, never chat text or viewer details. OpenTDB trivia is licensed CC BY-SA 4.0. If a source is down, your own list is used.
- If an older setup created `!play`, `!guess` and similar commands in Streamer.bot or `THSV Command - Chat Play` actions, disable them once the new commands work.
