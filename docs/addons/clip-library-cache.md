# Clip Library Cache

**Module:** `thsv.clip-library-cache` · **Version:** `4.0.53` · **Built in (extension)**

Clip Engine library that performs one bounded Twitch clip metadata refresh for Random Clip Player, Clip Courier, Raid Scout, and other approved clip consumers.

Clip Library Cache keeps one shared list of your recent public Twitch clips for other clip add-ons, such as Random Clip Player, Clip Courier and Raid Scout. They reuse this one list instead of each asking Twitch separately. On its own it shows nothing on stream. It does not play, post or download clips.

## What you need
- **Twitch** connected in Streamer.bot.
- The Clip Library Cache Streamer.bot package. Import it, keep the action enabled and without a trigger, and approve it in the wizard:
  - **THSV Addon - Clip Library Cache - Refresh**
- Do not add a timer or other trigger to it. StreamBridge runs it on schedule.

## Set it up
1. Install this add-on once, when another add-on you use lists it as a dependency.
2. Import the `.sb` file into Streamer.bot.
3. Open the Setup Wizard and go to **Extensions > Clip Engine > Clip Library Cache**.
4. Check that **Enable the shared clip list** is on (it is by default).
5. Approve **THSV Addon - Clip Library Cache - Refresh**.
6. Save and restart StreamBridge.
7. Go back to the add-on that needs it (for example Random Clip Player or Clip Courier) and finish setting that up. That add-on is where you test clips.

## Good to know
- The list refreshes every 15 minutes by default (at least every 5). While you are not live it refreshes at most once an hour, and it refreshes right away when you go live.
- Each refresh asks Twitch for 40 recent clips by default (up to 100). Up to 60 clip records are kept (up to 100).
- Only public clip details are stored: ID, link, title, creator name, thumbnail, length and date. No video files or temporary playback links are kept.
- Leave it enabled while any clip add-on needs it.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Clip Engine** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Clip Library Cache`

- `THSV Addon - Clip Library Cache - Refresh` in `THSV Addon - Clip Library Cache`

Refresh remains triggerless and is dispatched only through its creator-approved stable ID. Do not attach a timer or platform trigger.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.clip-library-cache` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable the shared clip list | Keep enabled while Random Clip Player, Clip Courier, or another clip add-on needs it. | On |
| Refresh the Twitch clip list every (minutes) | One refresh is shared by every clip consumer. The minimum is five minutes. While you are not live it refreshes at most once an hour, and it refreshes right away when you go live. | 15 |
| Recent clips requested from Twitch | How many public clip records the approved Streamer.bot action requests per refresh. | 40 |
| Maximum clip records kept locally | Only bounded metadata is kept; this is not a video download limit. | 60 |

## Health checks

- **thsv.clip-library-cache.runtime:** Confirms bounded shared clip metadata refresh is available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `schedule.bounded`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.clip-library-cache/`, `data/addons/.state/thsv.clip-library-cache/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves only bounded clip metadata; no video files or signed playback URLs are stored.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
