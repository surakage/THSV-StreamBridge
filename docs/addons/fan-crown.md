# Fan Crown

**Module:** `thsv.fan-crown` · **Version:** `4.0.48` · **Built in (extension)**

Runs a cross-platform Fan Crown using Twitch/Kick rewards and Viewer Foundation points on YouTube/TikTok, with bounded eligibility and a private monthly leaderboard.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Fan Crown`

- `THSV Addon - Fan Crown - Controller` in `THSV Addon - Fan Crown`
- `THSV Addon - Fan Crown - Reset Crown` in `THSV Addon - Fan Crown`
- `THSV Addon - Fan Crown - Reset Month` in `THSV Addon - Fan Crown`

Controller must remain triggerless and is dispatched only through Fan Crown's approved stable action ID. Reset actions emit exact, bounded local control envelopes and never mutate Twitch directly.

Creator-selected triggers:

- **resetCrown:** Optional: attach only to a creator-controlled hotkey or deck button.
- **resetMonth:** Optional and destructive: attach only to a creator-controlled hotkey or deck button after reviewing its purpose.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.fan-crown` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Fan Crown |  | On |
| Streamer.bot-owned Twitch Reward ID | Right-click the reward in Streamer.bot and copy its stable Reward ID. | (blank) |
| Kick Fan Crown Reward ID | Kick reward used for native captures. Streamer.bot does not currently document Kick reward title, price, fulfill, or refund methods. | (blank) |
| YouTube and TikTok Fan Crown command |  | `fancrown` |
| Available reward title | Used when a season or crown is reset. Twitch permits at most 45 characters. | `Fan Crown` |
| Crown-holder reward title | Token: {name}. The rendered result is safely limited to 45 characters. | `{name} holds the Fan Crown` |
| Price increase mode |  | `fixed` |
| Base Channel Points cost |  | 500 |
| Points added after each capture |  | 250 |
| Multiplier after each capture |  | 1.25 |
| Maximum Channel Points cost |  | 10000 |
| Round the next price up to |  | 50 |
| Reset the crown and price when Twitch goes live | Monthly leaderboard totals remain intact. Leave disabled to let the crown persist across streams. | Off |
| Require another viewer to challenge the current holder |  | On |
| Per-viewer capture cooldown (minutes) | Zero disables the additional cooldown. The current-holder rule is applied separately. | 0 |
| Allow the broadcaster to capture the crown |  | On |
| Allow moderators to capture the crown |  | On |
| Announce successful captures in Twitch chat |  | On |
| Capture message | Tokens: {name}, {cost}, {nextCost}, {captures}. | `{name} captured the Fan Crown for {cost} points! Next challenge: {nextCost}.` |
| Explain refunded redemptions in chat |  | Off |
| Refund message | Tokens: {name}, {reason}. Leave disabled above to reduce chat noise. | `{name}, that Fan Crown redemption was refunded: {reason}.` |
| Announce the completed monthly season winner |  | On |
| Monthly winner message | Tokens: {name}, {points}, {captures}, {longestReignMinutes}, {month}. | `{name} won the {month} Fan Crown season with {points} points and {captures} captures!` |
| Monthly season time zone | Leave blank to use this PC's time zone, or enter an IANA time zone such as America/New_York. Invalid values fall back to this PC's time zone. | (blank) |
| Show the hosted Fan Crown overlay card |  | On |
| Overlay card duration (seconds) |  | 20 |
| Overlay background |  | `glass` |
| Overlay background color |  | `#201335` |
| Overlay background opacity |  | 0.94 |
| Overlay accent color |  | `#f4cc63` |
| Overlay text color |  | `#ffffff` |
| Overlay font |  | `display` |

## Health checks

- **thsv.fan-crown.runtime:** Confirms serialized crown captures, result-correlated reward administration, bounded pricing, and private monthly ranking state.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.fan-crown/`, `data/addons/.state/thsv.fan-crown/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its compact private season state remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
