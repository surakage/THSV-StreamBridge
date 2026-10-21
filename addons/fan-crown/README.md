# Fan Crown

Fan Crown is a "king of the hill" crown your viewers compete for. On Twitch and Kick they claim it with a channel point reward. On YouTube, TikTok and Facebook they claim it with a chat command that spends Viewer Foundation points. Each capture raises the price, an optional card shows the new holder on your overlay, and a private monthly leaderboard picks a season winner.

## What you need
- **Viewer Foundation**, installed and enabled.
- The Fan Crown Streamer.bot package (group **THSV Addon - Fan Crown**):
  - **THSV Addon - Fan Crown - Controller**: approve it in the wizard and leave it without a trigger.
  - **THSV Addon - Fan Crown - Reset Crown**: optional. Attach only to your own hotkey or deck button.
  - **THSV Addon - Fan Crown - Reset Month**: optional and destructive. It clears the monthly leaderboard. Attach only to your own hotkey or deck button.
- A Twitch channel point reward created in Streamer.bot (so Streamer.bot owns it). Paste its reward ID into the wizard. In Streamer.bot, right-click the reward and copy its Reward ID.
- Optional: a Kick reward with a fixed cost equal to your base cost. Paste its reward ID into the wizard.
- Twitch and Kick **Reward Redemption** triggers stay on your existing platform intake actions. Do not add them to Fan Crown.
- Optional: a browser source for the crown card. Copy one of the URLs from the wizard. There are compact and regular sizes, each in landscape or vertical (for example compact landscape is 700 x 410).

## Set it up
1. Install and enable Viewer Foundation.
2. Import the `.sb` file into Streamer.bot.
3. Create the Twitch reward. A good start: title **Fan Crown**, the base cost from the wizard, and **Skip Reward Queue** turned off.
4. Open the Setup Wizard and go to **Extensions > Community Rewards > Fan Crown**.
5. **Connect each platform**: paste the Twitch and Kick reward IDs. Choose the chat command name for YouTube, TikTok and Facebook (default `fancrown`).
6. **Price progression**: choose a fixed increase (default +250) or a multiplier, the base cost (default 500) and the maximum (default 10,000). Make the Twitch reward's title and cost match the wizard.
7. **Viewer rules and resets**: decide whether the holder must wait for someone else to take it (on by default), any per-viewer cooldown, and whether the crown resets each time Twitch goes live.
8. **Platform chat messages** and **Crown overlay**: edit the messages and the card colors and font.
9. Approve **Controller**, save and restart StreamBridge so the command registers.
10. Copy the overlay URL into OBS and use **Show exact template** to check the card. Test a real claim with a harmless Streamer.bot-owned reward first. Test events never change the real reward.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!fancrown` | Everyone on YouTube, TikTok and Facebook | Claims the crown by spending the current cost in Viewer Foundation points. |

## Good to know
- Each capture adds the cost paid to the viewer's monthly score. Rankings use total points, then captures, then longest reign.
- When the month rolls over, the reign closes, one winner is saved, the crown and price reset, and the winner can be announced in chat.
- Twitch refunds: keep **Skip Reward Queue** off if you want rejected claims refunded. Twitch cannot refund a redemption it already auto-fulfilled.
- Kick limits: Kick captures count, but Streamer.bot cannot change the Kick reward's title or cost, or refund a rejected Kick claim.
- On YouTube, TikTok and Facebook, the points are given back if saving the capture fails.
- Fan Crown stores only stable user IDs, display names, optional avatars, scores, capture counts and times. No chat text or tokens are kept.
