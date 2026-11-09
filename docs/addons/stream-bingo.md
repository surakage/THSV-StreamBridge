# Stream Bingo

**Module:** `thsv.stream-bingo` · **Version:** `4.1.67` · **Built in (extension)**

One shared bingo card on stream for the whole community. Squares tick from follows, subs, Bits, gifts, tips, raids, rewards and chat words, or a moderator marks them; viewers type !bingo to join and each bingo draws one fair winner.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Play** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.stream-bingo` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Stream Bingo |  | Off |
| Platforms it works on | Viewers on these platforms can join, their events tick squares, and wins are posted in their chats. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Chat command | Viewers type it to join the card. Moderators add mark 5, unmark 5, new or end. Do not include the ! prefix. | `bingo` |
| Square pack | Which squares a new card is picked from. Every card shuffles them into a new order. | `mine` |
| Your squares | Each row is one square: its text, what ticks it, how many it needs, and the reward title, chat word or command (such as lurk or death) for reward, chat and command squares. | `A new follower \| follow \| 1 \|`, `3 new followers \| follow \| 3 \|`, `Someone subscribes \| sub \| 1 \|`, `A gifted sub \| gift-sub \| 1 \|`, `100 Bits cheered \| bits \| 100 \|`, `A tip or Super Chat \| tip \| 1 \|`, `A raid arrives \| raid \| 1 \|`, `A TikTok gift \| gift \| 1 \|`, `5 people say GG \| chat \| 5 \| gg`, `3 people say LOL \| chat \| 3 \| lol`, `Chat says hi \| chat \| 3 \| hi`, `Hydrate reward \| reward \| 1 \| Hydrate`, `Streamer laughs \| manual \| 1 \|`, `Streamer says oops \| manual \| 1 \|`, `Pet appears \| manual \| 1 \|`, `Tech trouble \| manual \| 1 \|`, `Song request \| manual \| 1 \|`, `Forgot to unmute \| manual \| 1 \|`, `Chat goes wild \| manual \| 1 \|`, `Snack break \| manual \| 1 \|`, `Inside joke \| manual \| 1 \|`, `Streamer sings \| manual \| 1 \|`, `Someone lurks \| manual \| 1 \|`, `Big win \| manual \| 1 \|` |
| Gaming pack | Squares for game streams. Most are marked by a moderator. | `Streamer dies \| manual \| 1 \|`, `Rage moment \| manual \| 1 \|`, `Clutch play \| manual \| 1 \|`, `Wrong way \| manual \| 1 \|`, `Game crashes \| manual \| 1 \|`, `Lag spike \| manual \| 1 \|`, `Boss defeated \| manual \| 1 \|`, `New record \| manual \| 1 \|`, `Falls off a ledge \| manual \| 1 \|`, `Out of ammo \| manual \| 1 \|`, `Gets lost \| manual \| 1 \|`, `Rare loot \| manual \| 1 \|`, `Says one more try \| manual \| 1 \|`, `Blames the controller \| manual \| 1 \|`, `Chat backseats \| chat \| 3 \| left`, `Chat says F \| chat \| 5 \| f`, `Chat says GG \| chat \| 5 \| gg`, `Jump scare \| manual \| 1 \|`, `Low health panic \| manual \| 1 \|`, `Achievement unlocked \| manual \| 1 \|`, `Restarts the level \| manual \| 1 \|`, `Glitch spotted \| manual \| 1 \|`, `A new follower \| follow \| 1 \|`, `A raid arrives \| raid \| 1 \|` |
| Just Chatting pack | Squares for chatting streams. | `Chat says hi \| chat \| 3 \| hi`, `Story time \| manual \| 1 \|`, `Coffee or tea sip \| manual \| 1 \|`, `Talks about food \| manual \| 1 \|`, `Pet appears \| manual \| 1 \|`, `Shoutout given \| manual \| 1 \|`, `Off-topic tangent \| manual \| 1 \|`, `Streamer laughs \| manual \| 1 \|`, `Plans for next stream \| manual \| 1 \|`, `Reads a donation \| manual \| 1 \|`, `Asks chat a question \| manual \| 1 \|`, `Music change \| manual \| 1 \|`, `Chat says LOL \| chat \| 3 \| lol`, `Someone lurks \| manual \| 1 \|`, `Streamer yawns \| manual \| 1 \|`, `Forgot what they said \| manual \| 1 \|`, `Says good question \| manual \| 1 \|`, `Weather talk \| manual \| 1 \|`, `A new follower \| follow \| 1 \|`, `Someone subscribes \| sub \| 1 \|`, `A tip or Super Chat \| tip \| 1 \|`, `A raid arrives \| raid \| 1 \|`, `A TikTok gift \| gift \| 1 \|`, `Hydrate reward \| reward \| 1 \| Hydrate` |
| Card size | 3 x 3 suits small corners and vertical streams; 5 x 5 is classic bingo. | `5x5` |
| Free square in the middle | Only on 3 x 3 and 5 x 5 cards. | On |
| What wins |  | `line` |
| After a bingo |  | `new-card` |
| Seconds before the next card |  | 30 |
| Points for the winner | Viewer Foundation points. 0 gives no points. | 100 |
| Points for joining a card | Once per card. 0 gives no points. | 0 |
| Full card bonus | Points for a second winner when every square gets marked. After the bingo the card keeps going until it is full. 0 turns it off. | 0 |
| Hype after quiet minutes | When no square ticks for this long, the card pulses on screen and chat gets one nudge. 0 turns it off. | 10 |
| Reply in chat when someone joins | Off keeps busy chats quiet; the card shows how many are playing. | Off |
| Join reply | Tokens: {name}, {players}. | `{name} joined Stream Bingo! {players} playing.` |
| Tell chat when a new card starts |  | On |
| New card message | Token: {command}. | `A new Stream Bingo card is on screen! Type !{command} to join the draw.` |
| Winner message | Tokens: {winner}, {platform}, {pattern}, {points}, {players}. Cut to each chat's limit (TikTok 150, YouTube 200). | `BINGO! The card made {pattern}. {winner} ({platform}) wins{points}! {players} were playing.` |
| Message when nobody joined | Tokens: {pattern}, {command}. | `BINGO! The card made {pattern}, but nobody had joined. Type !{command} to join the next card!` |
| Stats reply | Viewers type !bingo stats. Tokens: {name}, {month}, {total}. | `{name}: {month} bingo wins this month, {total} all time.` |
| Top three reply | Viewers type !bingo top. Token: {top}. | `Bingo this month: {top}` |
| Reply when nobody has won yet |  | `No bingo wins yet this month.` |
| Reply when there is no card | Sent at most once every 30 seconds. Token: {command}. | `There is no bingo card to join right now.` |
| Full card bonus message | Tokens: {winner}, {platform}, {points}, {players}. | `FULL CARD! {winner} ({platform}) wins the blackout bonus{points}!` |
| Hype nudge | Tokens: {left} (squares still needed for the nearest bingo), {players}, {command}. | `The card needs {left} more for a BINGO! Type !{command} to join.` |
| Card title |  | `STREAM BINGO` |
| Layout | Vertical puts the info under the card, for vertical canvases and narrow corners. | `horizontal` |
| Where the card shows |  | `bottom-right` |
| Size on screen |  | `medium` |
| Show square numbers | Helps moderators type !bingo mark 7. | On |
| Show how many are playing |  | On |
| Show the latest ticked squares |  | On |
| Seconds the winner shows |  | 12 |
| Marked square color |  | `#7ff5cc` |
| How to join (on the card) | Token: {command}. | `Type !{command} to play` |
| Word under the player count |  | `playing` |
| Free square text |  | `FREE` |
| Winner banner word |  | `BINGO!` |
| Full card banner word |  | `FULL CARD!` |
| Banner when nobody joined |  | `Nobody joined this card` |
| Pattern names | How messages and the winner banner name each pattern, in this order: any line, two lines, four corners, an X, full card. | `a line`, `two lines`, `the four corners`, `an X`, `a full card` |
| Time zone for monthly stats | Monthly wins reset on the 1st in this time zone. Leave empty to use this PC's time zone. Example: America/Chicago. | (blank) |
| Viewers can suggest squares | Viewers type !bingo suggest followed by an idea. Ideas wait in the Control Panel until you press Add; added ideas join Your squares and All three mixed. | Off |
| Thanks for an idea | Tokens: {name}, {command}. | `Thanks {name}! Your square idea was sent to the streamer.` |
| Discord webhook | A text channel webhook from Discord webhooks. Leave empty for no Discord posts. | (blank) |
| Post each bingo |  | On |
| Post a monthly recap on the 1st |  | On |
| Monthly recap | Tokens: {month}, {cards}, {wins}, {top}. | `Stream Bingo in {month}: {cards} cards, {wins} bingos. Top players: {top}` |
| Streamer.bot action on bingo | Runs after each bingo, for confetti, a sound or a scene. It gets bingoWinner, bingoPlatform, bingoPattern, bingoPoints, bingoBonus, bingoPlayers and bingoCard. Approve the same action below. | (blank) |

## Health checks

- **thsv.stream-bingo.runtime:** Confirms squares tick from stream events and moderators, viewers can join, wins are drawn fairly and paid once, and monthly stats reset on the 1st.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`, `discord.post`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.stream-bingo/`, `data/addons/.state/thsv.stream-bingo/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Disable the extension and remove its browser source. Monthly and all-time wins are kept until you delete its data.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
