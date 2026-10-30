# Village Roll Call

**Module:** `thsv.village-roll-call` · **Version:** `4.0.64` · **Built in (extension)**

Runs cross-platform daily check-ins using Twitch/Kick rewards and YouTube/TikTok Viewer Foundation points.

Village Roll Call is a daily check-in for your community. Viewers check in once per day, using a channel point reward on Twitch and Kick or a `!checkin` command on YouTube, TikTok and Facebook. Check-ins build a monthly leaderboard, and the top viewer of each month is announced as the winner.

## What you need
- The **Viewer Foundation** extension, enabled. YouTube, TikTok and Facebook check-ins cost StreamBridge points.
- A Twitch check-in channel point reward, created inside Streamer.bot with Skip Reward Queue on, and a matching Kick reward. Paste both reward IDs into the wizard.
- Reward Redemption triggers attached to your main Twitch and Kick intake actions in Streamer.bot (usually already the case).
- Optional: a browser source for the leaderboard card. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-roll-call`).
- No separate Streamer.bot import is needed.

## Set it up
1. Create the Twitch and Kick check-in rewards and copy their reward IDs.
2. Check that Reward Redemption is attached to your Twitch and Kick intake actions in Streamer.bot.
3. Open Setup Wizard > Add-ons > Village Roll Call and paste the reward IDs.
4. Choose the check-in command name (`checkin` by default) and the points cost (25 by default).
5. Optional: set your calendar time zone (for example `America/New_York`); leave it blank to use this PC's time zone.
6. Check the chat messages and the leaderboard card settings.
7. Turn on "Enable Village Roll Call", save and restart StreamBridge.
8. Optional: add the overlay URL to an OBS browser source and press **Send preview card** in the wizard.
9. Test by checking in once from a viewer account; a second check-in the same day should get the "already checked in" reply.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!checkin` | Viewers on YouTube, TikTok and Facebook | Spends points and checks the viewer in for today. |

## Good to know
- Each viewer can check in once per calendar day, counted per platform. A repeat check-in on YouTube, TikTok or Facebook costs no points.
- Kick reward claims cannot be refunded automatically, so a duplicate Kick claim is not given back.
- The monthly winner has the most check-ins; ties go to whoever checked in first. The new month starts at the first stream or check-in in that month.
- After each check-in, a leaderboard card shows the top 5 for 20 seconds (you can change both).
- StreamBridge stores only platform IDs, current display names and check-in counts for this add-on.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Rewards** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-roll-call` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Village Roll Call |  | Off |
| Twitch check-in Reward ID | Create this reward inside Streamer.bot, enable Skip Reward Queue, then paste its stable Reward ID. | (blank) |
| Kick check-in Reward ID | Use Kick Channel Reward > Reward Redemption. Duplicate Kick claims cannot be automatically refunded. | (blank) |
| YouTube and TikTok check-in command |  | `checkin` |
| YouTube and TikTok check-in cost |  | 25 |
| Calendar time zone | Leave blank to use this PC's time zone, or enter an IANA time zone such as America/New_York. Used for each new day and month. | (blank) |
| Successful check-in message | Tokens: {name}, {count}, {rank}, {month}. | `{name} checked in! You have {count} check-ins for {month} and rank #{rank}.` |
| Tell viewers they already checked in today |  | On |
| Already checked-in message | Token: {name}. | `{name}, you already checked in today.` |
| Announce the previous monthly winner |  | On |
| Monthly winner message | Tokens: {name}, {count}, {month}. Sent on the first stream-online or check-in event in the new month. | `{name} won the {month} Village Roll Call with {count} check-ins!` |
| Show an OBS leaderboard card after check-ins |  | On |
| Names shown on the card |  | 5 |
| Card duration (seconds) |  | 20 |

## Health checks

- **thsv.village-roll-call.runtime:** Confirms daily uniqueness, monthly rollover, bounded state, and overlay cards.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `viewer.foundation.read`, `viewer.foundation.mutate`, `schedule.bounded`.

Private storage: `data/addons/thsv.village-roll-call/`, `data/addons/.state/thsv.village-roll-call/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its bounded private leaderboard remains preserved for a later reinstall.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
