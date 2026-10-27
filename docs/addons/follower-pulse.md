# Follower Pulse

**Module:** `thsv.follower-pulse` · **Version:** `4.0.54` · **Built in (extension)**

Privately detects delayed Twitch unfollows through complete, bounded, two-scan follower reconciliation.

Follower Pulse quietly spots Twitch unfollows. Twitch sends an event when someone follows, but not when someone unfollows, so this add-on compares full follower lists over time. Only you see the results, in a private history panel in the Setup Wizard. Names are never posted to chat, Discord or overlays.

## What you need
- Twitch connected in Streamer.bot as the broadcaster, with the `moderator:read:followers` permission.
- The Follower Pulse Streamer.bot import. It contains **THSV Addon - Follower Pulse - Snapshot Page** (keep it triggerless and approve it for this add-on) and **THSV Addon - Follower Pulse - Reconcile Now** (optional manual check).
- Nothing else. No overlay or rewards are needed.

## Set it up
1. In Streamer.bot, import the Follower Pulse package. Leave **Snapshot Page** with no triggers.
2. Optional: attach **Reconcile Now** to a hotkey or deck button that only you can use.
3. If your Twitch broadcaster login in Streamer.bot does not have `moderator:read:followers`, reconnect the broadcaster account.
4. Open Setup Wizard > Extensions > Community Insights > Follower Pulse. Approve **Snapshot Page** for this add-on.
5. Leave the recommended safety settings (check every 12 hours, 2 complete scans before confirming an unfollow), or adjust them.
6. Turn on **Enable Follower Pulse**, save, and restart StreamBridge if the wizard asks.
7. The first complete scan only creates a silent starting list. Unfollows can show up after later scans. Use **Reconcile Now** to run a check on demand.

## Good to know
- An unfollow is only confirmed after it is missing from 2 complete scans in a row (you can raise this to 3). With the default 12-hour check, expect about a day of delay.
- Failed, partial or unauthorized scans never count as unfollows. The last good list is kept, and failures retry automatically (a missing permission is rechecked every 30 minutes).
- Follower Pulse tracks up to 500 followers. If Twitch reports more than your limit, it stops instead of guessing.
- The wizard panel shows the last attempt, last complete scan, next check and any errors.
- Only Twitch IDs, current names, follow times and recent changes are kept locally, for 90 days by default. Twitch credentials stay inside Streamer.bot.
- Streamer.bot trigger tests and simulated controls are ignored.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Community Insights** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Follower Pulse`

- `THSV Addon - Follower Pulse - Snapshot Page` in `THSV Addon - Follower Pulse`
- `THSV Addon - Follower Pulse - Reconcile Now` in `THSV Addon - Follower Pulse`

Snapshot Page must remain triggerless and is dispatched only through Follower Pulse's creator-approved stable action ID. Reconcile Now contains no Twitch credential access.

Creator-selected triggers:

- **reconcile-now:** Attach only to a creator-controlled hotkey, deck button, or operator command.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.follower-pulse` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Follower Pulse |  | Off |
| Check every (hours) |  | 12 |
| Complete scans before confirming an unfollow |  | 2 |
| Maximum followers to track | Follower Pulse fails closed when Twitch reports more than this bounded local limit. | 500 |
| Recent changes retained |  | 50 |
| Change-history retention (days) |  | 90 |

## Health checks

- **thsv.follower-pulse.runtime:** Confirms bounded Twitch follower reconciliation is scheduled and fail-closed.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.follower-pulse/`, `data/addons/.state/thsv.follower-pulse/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its private bounded follower history remains preserved until the creator deletes it.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
