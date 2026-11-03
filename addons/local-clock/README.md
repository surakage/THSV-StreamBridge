# Local Clock

Shows your local time and date on stream, so viewers know what time it is where you are. Pick one of three styles:

- **Text line**: `SUN 19 OCT 2025 10:44:01 AM`
- **Digital clock**: large time with the date underneath
- **Analog clock**: a round clock face with hour, minute and second hands

## Set it up

1. Turn on **Enable Local Clock** and pick a style.
2. Leave **Time zone** empty to use this PC's time, or type a zone such as `America/Chicago`.
3. Choose 12 or 24 hours, seconds, the date, an optional label, colours and size.
4. Add `http://127.0.0.1:8787/overlay/addons/thsv.local-clock` as a 1920x1080 browser source in the scenes where the clock should show, then crop or move it into place.
5. Restart StreamBridge.

No Streamer.bot import is needed.

## Good to know

- The clock ticks by itself inside OBS, so it keeps exact time even while StreamBridge is busy.
- Optional: set a chat command such as `time` so viewers can type `!time` to see your local time. The reply uses the same time zone as the clock.
- Style changes from the Control Panel show on stream right away.
