# Polls & Predictions

**Module:** `thsv.polls-predictions` · **Version:** `4.0.64` · **Separate download**

Live cards for Twitch polls, Twitch predictions and YouTube polls with vote bars, a countdown and the winner highlighted.

Shows your Twitch polls, Twitch predictions and YouTube polls on stream as live cards. Each card has vote bars that move as votes come in, a countdown, and the winner highlighted when it ends. A poll and a prediction running together each get their own card.

## What you need

- StreamBridge connected to Streamer.bot, with your Twitch and YouTube accounts linked in Streamer.bot. No Streamer.bot import or extra trigger is needed.
- A browser source in the scenes where the cards should show.

## Set it up

1. Install and enable Polls & Predictions.
2. Pick what to show, how long results stay, and the look in the Wizard.
3. Copy the browser-source URL from the overlay step into your scenes at 1920 x 1080.
4. Click **Show exact template** to see example cards.
5. Start a poll or prediction from Twitch or YouTube as usual. Its card appears on its own.

## Good to know

- Predictions show the channel points on each side and how many people picked it. A cancelled prediction says the points were refunded.
- Turn on **Play a sound** for a short chime when a card opens and when the result is in.
- Streamer.bot test polls and predictions show too, so you can try the cards before going live. Nothing is saved.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Polls-Predictions-4.0.64.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Polls-Predictions-4.0.64.thsv-addon` and review its permissions.
3. Return to the wizard, configure the extension, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.polls-predictions` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Polls & Predictions |  | On |
| What to show |  | `twitch-polls`, `twitch-predictions`, `youtube-polls` |
| Most cards at once | When a poll and a prediction run together, each gets its own card. | 2 |
| Hide a card after its result |  | On |
| Show the result for (seconds) |  | 15 |
| Show percentages |  | On |
| Show vote and point counts |  | On |
| Show the countdown |  | On |
| Word for votes |  | `votes` |
| Word for channel points |  | `points` |
| Play a sound when a card opens and when the result is in |  | Off |
| Sound volume |  | 40 |
| Card position |  | `top-right` |

## Health checks

- **thsv.polls-predictions.runtime:** Confirms poll and prediction cards, results and hiding after the result.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`.

Private storage: `data/addons/thsv.polls-predictions/`, `data/addons/.state/thsv.polls-predictions/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
