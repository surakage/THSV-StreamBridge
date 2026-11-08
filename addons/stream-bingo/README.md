# Stream Bingo

Stream Bingo puts one shared bingo card on your stream for your whole community. Squares tick by themselves when things happen on stream (follows, subs, Bits, gifts, tips, raids, channel point rewards, words in chat) or when a moderator marks them. Viewers type `!bingo` to join. When the card makes a line (or the pattern you pick), StreamBridge draws one fair winner from everyone who joined, on any platform, posts it in every chat you tick and can add Viewer Foundation points.

## What you need
- An OBS (or Meld/Streamlabs) browser source: `http://127.0.0.1:8787/overlay/addons/thsv.stream-bingo`, 1920x1080. On a vertical canvas use 1080x1920 and the Vertical layout.
- Viewer Foundation turned on (it holds the points). Nothing else: no Streamer.bot import, rewards or actions are needed.

## Set it up
1. Open Setup Wizard > Extensions > Stream Bingo.
2. Tick the platforms it works on.
3. Pick a square pack (your squares, Gaming, Just Chatting, or all three mixed) and edit the squares. Each square says what ticks it: a moderator, follows, subs and members, gifted subs, Bits, gifts, tips and Super Chats, raids, a channel point reward (by its title), different chatters saying a word, or a chat command such as `!lurk` or a death counter's `!death`. "How many" sets how many are needed, for example 3 follows or 100 Bits.
4. Choose the card size (3 x 3, 4 x 4 or 5 x 5), what wins (any line, two lines, four corners, an X or a full card), what happens after a bingo and the winner's points.
5. Turn on **Enable Stream Bingo**, save, restart StreamBridge, add the browser source and press **New card** in the Control Panel.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!bingo` | Everyone | Joins the current card's draw. Each person joins once per card; linked accounts count once. |
| `!bingo stats` | Everyone | Your bingo wins this month and all time. |
| `!bingo top` | Everyone | This month's top three. |
| `!bingo suggest Cat on keyboard` | Everyone, when ideas are on | Sends a square idea. It waits in the Control Panel until you press Add. |
| `!bingo mark 7` | Moderators and you | Marks square 7 (squares count from 1 at the top left, across each row). Several numbers work: `!bingo mark 3 8`. |
| `!bingo unmark 7` | Moderators and you | Unmarks square 7. |
| `!bingo new` | Moderators and you | Puts a new card on screen. |
| `!bingo end` | Moderators and you | Takes the card off screen. |

## Control Panel and Stream Deck
The Control Panel tab shows every square with a Mark or Unmark button, the players, this month's winners and the hall of fame, plus New card and Close buttons. Layout, position, size and colors change live from there.

For a Stream Deck button, make a Streamer.bot action that sends `!bingo mark 7` (or `!bingo new`) to your chat from your own broadcaster account, and point the button at that action.

## Extras
- **Full card bonus**: after the bingo, the card keeps going until every square is marked, then draws a second winner (someone else when possible) for the bonus points.
- **Hype mode**: when no square ticks for a few minutes (10 by default), the card glows on screen and chat gets one nudge saying how many squares the nearest bingo needs.
- **Square ideas from chat**: viewers send ideas with `!bingo suggest`. Nothing reaches the card until you press Add in the Control Panel; added ideas join Your squares and All three mixed.
- **Command squares**: each viewer counts once per square, while moderators and you count every use, so a counter command ticks the square each time it goes up. `!death -` or `!death reset` never ticks.
- **Discord**: pick a text channel webhook to post each bingo and a monthly recap on the 1st.
- **Streamer.bot**: pick one of your own actions (confetti, a sound, a scene) to run after each bingo, and approve it in the Approve Streamer.bot actions step. It gets `bingoWinner`, `bingoPlatform`, `bingoPattern`, `bingoPoints`, `bingoBonus`, `bingoPlayers` and `bingoCard`.

## Good to know
- Every player has the same chance in the draw, whichever platform they joined from. A player who already won on this card is skipped while others are waiting.
- Each bingo pays once. With "Keep playing for more lines", every new line draws another winner.
- Squares only tick while a card is running. Simulated test events never tick a square; use Mark in the Control Panel to try it out.
- Wins count per month and reset on the 1st in your time zone. Last month's top three move to the hall of fame; all-time wins never reset.
- Chat messages are cut to each chat's length limit (TikTok 150, YouTube 200 characters).
- Bingo is for fun. Do not use it for gambling or high-value prizes.
