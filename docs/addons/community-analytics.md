# Community Analytics

**Module:** `thsv.community-analytics` · **Version:** `4.0.58` · **Built in (integration)**

Maintains private local cross-platform attendance, message, command, and optional participation-score counters using Viewer Foundation identities.

Community Analytics keeps a private, local count of who showed up to each stream and how your community took part: attendance, chat messages, commands and other activity across Twitch, YouTube, Kick, TikTok and Facebook. You see the results in the wizard. Viewers see nothing unless another feature, such as Viewer Spotlight, uses the counts. It is built into StreamBridge, so there is nothing separate to install.

## What you need
- **Viewer Foundation**, set up and working. It tells Community Analytics which accounts belong to the same viewer.
- Your main THSV platform intake actions in Streamer.bot, already working. There is no Community Analytics `.sb` import and no trigger to add.
- Nothing extra.

## Set it up
1. Make sure Viewer Foundation is ready.
2. Open the Setup Wizard and go to the **Community Analytics** page.
3. **Count community activity**: keep it turned on and select the platforms to count. Leave **Count simulated events** off.
4. **Optional participation score**: leave it off unless Viewer Spotlight (or another feature) should show a monthly score or rank.
5. **Advanced: exclusions and storage**: common service bots are already excluded. Add any other accounts to skip, using stable IDs where you can.
6. Save and restart StreamBridge.
7. Check it: chat once in your own stream, then open **Community snapshot**. It shows the current stream, key totals and recent streams. Open **All activity counters** for the full breakdown.

## Good to know
- These are StreamBridge's own local counts, not official platform analytics, and not revenue or payout records.
- No chat text, display names, avatars, money amounts or raw platform data are stored. Bots, system accounts, ignored accounts and test events are skipped.
- A stream session starts with the first Stream Online event and ends when every platform is offline. Activity seen without those events is marked as an approximate session.
- The monthly score uses only sessions, messages and commands, each with a monthly cap. Subs, gifts, Bits, donations and other support never count. Exact rank stays hidden until at least 5 viewers (by default) have a score.
- Privacy tools in the wizard let you export or delete one viewer's data. Deleting removes their record. Finished session totals hold no viewer IDs, so they stay.
- By default it keeps up to 500 viewer records and the last 30 finished sessions. Older records are removed automatically. If the snapshot stays empty, check that Viewer Foundation and the platform intake are healthy.

## Where to find it

1. This integration ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from its dedicated **Community Analytics** wizard page, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

Community Analytics has no browser source. Its private reports remain in the authenticated local wizard.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Track private community activity | Counts normalized activity locally through Viewer Foundation and the existing platform intakes. | On |
| Count simulated events | Keep disabled outside deliberate testing. | Off |
| Platforms included in local counts | Only normalized events from selected platform intakes are counted. | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Ignored platform accounts | Preloaded with common service bots. Name rules use platform\|name:login; stable-ID rules use platform\|stable-user-id. | `twitch\|name:nightbot`, `twitch\|name:streamelements`, `youtube\|name:streamelements`, `kick\|name:streamelements`, `twitch\|name:fossabot`, `twitch\|name:moobot`, `twitch\|name:sery_bot`, `twitch\|name:soundalerts`, `twitch\|name:wizebot`, `twitch\|name:kofistreambot`, `twitch\|name:streamlabs`, `twitch\|name:botrix`, `youtube\|name:botrix`, `kick\|name:botrix`, `tiktok\|name:botrix` |
| Ignored Viewer Foundation IDs |  | (none) |
| Maximum viewer records |  | 500 |
| Completed sessions retained |  | 30 |
| Replay identities retained |  | 500 |
| Show a monthly participation score | Optional. Uses only capped sessions, messages, and commands; it never uses money or provider support. | Off |
| Points per observed message |  | 1 |
| Maximum scored messages per month |  | 200 |
| Points per observed command |  | 2 |
| Maximum scored commands per month |  | 50 |
| Points per observed stream session |  | 10 |
| Maximum scored sessions per month |  | 20 |
| Minimum viewers before showing exact rank |  | 5 |
| Monthly score season time zone | Leave blank to use this PC's time zone, or enter an IANA time zone such as America/New_York. Invalid values fall back to this PC's time zone. | (blank) |

## Health checks

- **thsv.community-analytics.runtime:** Confirms Viewer Foundation identity resolution and bounded private session counters.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `viewer.foundation.read`, `community.analytics.provide`, `schedule.bounded`.

Private storage: `data/addons/thsv.community-analytics/`, `data/addons/.state/thsv.community-analytics/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Community Analytics is a built-in Bridge integration and cannot be uninstalled separately. Its bounded private counters remain preserved across updates.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
