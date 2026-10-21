# Clip Library Cache

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
