# Prize Wheel setup

Prize Wheel gives two through ten creator-authored choices equal-size slices. StreamBridge chooses one index before publishing the animation, so OBS timing, dropped frames, reconnects, or browser-source cropping cannot change the winner.

## Install

1. Install `thsv.prize-wheel` from the add-on page.
2. Open its settings and enter one choice per line. Pressing Enter creates a new choice; visual wrapping inside the box does not.
3. Select the chats that should receive the result and edit each platform-bounded message.
4. Save settings, restart StreamBridge, then enable the add-on.
5. Add `http://127.0.0.1:8787/overlay/addons/thsv.prize-wheel` as a browser source.

## Streamer.bot

Use Command Sync's **Prize Wheel control** template to create the default `!spinwheel` command. It is multi-platform, moderator-gated, and deliberately generates no direct response. The existing Twitch, YouTube, Kick, and TikTok intakes normalize the command; the add-on publishes one wheel animation and sends the result through the bridge's existing Streamer.bot connection.

No separate Prize Wheel `.sb` import or trigger is required.

## Offline test

1. Keep OBS or a normal browser open on the hosted source.
2. Press **Send preview** in the add-on page.
3. Confirm that every slice is the same size, the fixed pointer remains at the top, the wheel slows naturally, and the winner card matches the slice under the pointer.
4. Crop or resize the browser source and repeat the preview.
5. Run a Streamer.bot Test trigger for a moderator command. A simulated event must animate but must not post to public chat or update the last live spin.

## Data and permissions

Prize Wheel receives normalized command events, stores only the last spin time, last winning choice, and a bounded sequence number, uses one bounded delayed task for the winner announcement, sends only creator-authored result templates, and publishes only to its own hosted overlay topic. It stores no viewer profile, command text history, OAuth token, or raw provider payload.

This is a casual entertainment tool. Do not use it for regulated gambling, legal drawings, or high-value prize selection.
