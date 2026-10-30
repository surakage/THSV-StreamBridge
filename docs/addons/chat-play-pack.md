# Chat Play Pack

**Module:** `thsv.chat-play-pack` · **Version:** `4.0.64` · **Built in (extension)**

Adds bounded cross-platform solo games, shared rounds, accepted viewer duels, idempotent points, optional OpenTDB trivia, and dictionary-backed Unscramble.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Chat Play Pack`

- `THSV Addon - Chat Play Pack - Fetch Trivia Questions` in `THSV Addon - Chat Play Pack`
- `THSV Addon - Chat Play Pack - Fetch Unscramble Words` in `THSV Addon - Chat Play Pack`

Fetch actions remain broker-dispatched and triggerless. Chat Play commands are owned by StreamBridge and arrive through the existing normalized platform intakes; do not create duplicate Streamer.bot Command objects or triggers.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.chat-play-pack` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Chat Play Pack |  | Off |
| Command prefix | Keep ! unless you also rename the imported Streamer.bot command entries. | `!` |
| Number Guess |  | On |
| Trivia |  | On |
| Prediction |  | On |
| Coin Flip |  | Off |
| Slots |  | Off |
| Color Roulette |  | Off |
| Rock Paper Scissors |  | Off |
| Unscramble |  | Off |
| Viewer Duel |  | Off |
| Round control command |  | `play` |
| Number guess command |  | `guess` |
| Trivia and unscramble answer command |  | `answer` |
| Prediction command |  | `predict` |
| Coin Flip command |  | `coinflip` |
| Slots command |  | `slots` |
| Roulette command |  | `roulette` |
| Rock Paper Scissors command |  | `rps` |
| Duel challenge command |  | `duel` |
| Accept duel command |  | `accept` |
| Decline duel command |  | `decline` |
| Number Guess and Prediction points |  | 25 |
| Trivia winner points |  | 25 |
| Unscramble winner points |  | 25 |
| Coin Flip winner points |  | 5 |
| Slots two-symbol match points |  | 15 |
| Slots three-symbol jackpot points |  | 50 |
| Roulette red or black winner points |  | 8 |
| Roulette green winner points |  | 40 |
| Rock Paper Scissors winner points |  | 10 |
| Duel winner points |  | 20 |
| Maximum game points per viewer each hour |  | 250 |
| Solo-game cooldown per viewer (seconds) |  | 30 |
| Duel challenge cooldown per viewer (seconds) |  | 300 |
| Viewer must have chatted within (minutes) |  | 30 |
| Shared-round timeout (seconds) |  | 120 |
| Trivia question source |  | `creator` |
| OpenTDB category |  | `any` |
| OpenTDB difficulty |  | `any` |
| OpenTDB question type |  | `any` |
| Questions fetched per batch |  | 10 |
| Fallback trivia questions and answers | Twenty ready-to-use entries are included. Edit one per line as: Question \| Correct answer \| Optional alternate answers separated by semicolons | `What is the capital of France? \| Paris`, `Which planet is the largest in our solar system? \| Jupiter`, `At what temperature does water freeze in Celsius? \| 0 \| zero`, `Which planet is known as the Red Planet? \| Mars`, `How many continents are there? \| 7 \| seven`, `Who wrote Romeo and Juliet? \| William Shakespeare \| Shakespeare`, `What is the chemical symbol for gold? \| Au`, `Which is the largest ocean on Earth? \| Pacific Ocean \| Pacific`, `What is the fastest land animal? \| Cheetah`, `Which gas do plants absorb from the atmosphere? \| Carbon dioxide \| CO2`, `What is the square root of 64? \| 8 \| eight`, `Which instrument has keys, pedals, and strings? \| Piano`, `In which country are the Pyramids of Giza? \| Egypt`, `What is the main language spoken in Brazil? \| Portuguese`, `Which planet is famous for its rings? \| Saturn`, `What is the largest organ of the human body? \| Skin`, `What color do red and blue make when mixed? \| Purple \| Violet`, `How many days are in a leap year? \| 366 \| three hundred sixty six`, `What is the first month of the year? \| January`, `What is a baby frog called? \| Tadpole` |
| Unscramble word source |  | `mixed` |
| Dictionary words fetched per batch |  | 5 |
| Shortest dictionary word |  | 5 |
| Longest dictionary word |  | 9 |
| Fallback Unscramble words and hints | Twenty ready-to-use words are included. Edit one per line as: Word \| Optional hint | `sloth \| A slow-moving tree-dwelling mammal`, `village \| A small community or settlement`, `forest \| A large area covered with trees`, `stream \| Live video sent over the internet`, `camera \| A device used to capture pictures or video`, `microphone \| A device that captures sound`, `keyboard \| A set of keys used for typing`, `lantern \| A portable light with a protective case`, `blossom \| A flower or a period of flowering`, `adventure \| An exciting or unusual experience`, `rainbow \| An arc of colors seen after rain`, `treasure \| Something valuable that is hidden or prized`, `mountain \| A very high natural elevation of land`, `ocean \| A vast body of salt water`, `starlight \| Light that comes from stars`, `community \| A group connected by a shared place or interest`, `creator \| A person who makes something`, `gaming \| The activity of playing video games`, `emerald \| A bright green gemstone`, `friendship \| A close relationship between friends` |
| Announce shared rounds to every currently live platform |  | On |
| Show game cards in the add-on browser source |  | On |
| Monthly round counter time zone | Leave blank to use this PC's time zone, or enter an IANA time zone such as America/New_York. Invalid values fall back to this PC's time zone. | (blank) |

## Health checks

- **thsv.chat-play-pack.runtime:** Confirms serialized rounds, bounded cooldowns, stable duel identities, trivia fallback, and idempotent Viewer Foundation awards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `streamerbot.run-approved-action`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.chat-play-pack/`, `data/addons/.state/thsv.chat-play-pack/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstalling preserves only bounded round statistics and pseudonymous Viewer Foundation IDs.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
