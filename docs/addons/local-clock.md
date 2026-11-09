# Local Clock

**Module:** `thsv.local-clock` · **Version:** `4.1.67` · **Built in (extension)**

Shows the creator's local time and date on stream as a text line, a digital clock, or a round analog clock, with an optional chat command.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. Configure it from the **Extensions > Community Insights** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.local-clock` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Local Clock |  | Off |
| Clock style | Text line (SUN 19 OCT 2025 10:44:01 AM), a digital clock, or a round analog clock. | `text` |
| Time zone (optional) | Leave empty to use this PC's time. Or type a zone such as America/Chicago, Europe/London or Asia/Tokyo. | (blank) |
| Hours |  | `12` |
| Show seconds |  | On |
| Show the date |  | On |
| Label (optional) | A small line above the clock, for example My local time. | (blank) |
| Capital letters for the day and month |  | On |
| Size |  | `medium` |
| Text colour |  | `#ffffff` |
| Accent colour | Used for the analog clock's second hand and the label. | `#f5c56b` |
| Background |  | `none` |
| Background colour |  | `#140d1f` |
| Chat command (optional) | For example time, so viewers type !time to see your local time. Leave empty for no command. | (blank) |
| Chats that can use the command |  | `twitch`, `youtube`, `kick`, `tiktok`, `facebook` |
| Command cooldown (seconds) |  | 10 |
| Command reply | Placeholders: {time}, {date}, {zone}. | `🕰️ It is {time} on {date} in the village.` |

## Health checks

- **thsv.local-clock.runtime:** Confirms the clock settings, time zone check, overlay update and the optional time command.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.local-clock/`, `data/addons/.state/thsv.local-clock/`.

Dependencies: none.

## Remove or repair

1. Disable the extension and remove its browser source.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
