# Accessibility Captions

**Module:** `thsv.accessibility-captions` · **Version:** `4.0.60` · **Optional add-on**

Renders ephemeral high-contrast captions without retaining message bodies.

Accessibility Captions shows short, easy-to-read captions on your stream overlay. It can caption stream events (follows, subs, memberships, raids, Super Chats and donations) and, if you turn it on, public chat messages. Viewers see each caption for a few seconds, then it disappears. Caption text is never saved to disk.

## What you need
- An OBS browser source for the captions overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.accessibility-captions`).
- Optional, for microphone captions only: the Streamer.bot action **THSV Closed Captions - Relay Dictation** (group **THSV Addon - Accessibility Captions**). Import and approve it only if your spoken words do not show up as live captions on their own. Attach only the **Voice Control > Dictation** and/or **Voice Control > Log** triggers to it.
- Nothing else. This add-on does not read messages aloud. For text-to-speech, use the separate Voice Relay add-on.

## Set it up
1. Open the Setup Wizard and go to **Add-ons > Accessibility Captions**.
2. Under **Caption sources**, choose what to caption:
   - **Show supported stream events** is on by default.
   - **Show public chat as captions** is off by default. Turn it on only if you are happy to show viewer messages on stream.
   - **Include bot chat** appears once chat captions are on. Leave it off to hide bot messages.
3. Under **Readability**, set the maximum caption length, how long each caption stays up, the font size, and high contrast.
4. Under **Appearance**, pick a background style (solid, glass or none) and the background and text colors.
5. Copy the overlay URL from the wizard. In OBS, add a **Browser** source with that URL to the scenes where you want captions.
6. Turn on **Enable captions** and save.
7. Test it: open **Open overlay & test** in the wizard and click **Show exact template** to check size and colors in OBS. To test real captions, turn on chat captions and type a message in your own chat. Simulated test events are ignored by this add-on.

## Good to know
- The add-on does nothing until you tick **Enable captions**.
- Captions are 40-500 characters long (default 220) and stay up for 3-30 seconds (default 8). Captions that arrive less than a quarter of a second apart are skipped so the screen does not flood.
- System messages are never captioned. Bot messages are hidden unless you turn on **Include bot chat**.
- Nothing is stored. No caption history is kept, so there is nothing to clean up if you remove the add-on.
- If the overlay is not open in OBS, captions are simply dropped. Nothing queues up.
- The microphone relay action writes no audio or transcript files. Keep it outside your speech playback queue.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Accessibility-Captions-4.0.60.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Accessibility-Captions-4.0.60.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Accessibility-Captions-4.0.60.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Accessibility Captions`

- `THSV Closed Captions - Relay Dictation` in `THSV Addon - Accessibility Captions`

Attach only Voice Control > Dictation and/or Voice Control > Log. Keep it outside the speech playback queue. The relay writes no audio or transcript files.

Creator-selected triggers:

- Voice Control > Dictation
- Voice Control > Log

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.accessibility-captions` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable captions |  | Off |
| Show public chat as captions |  | Off |
| Show supported stream events |  | On |
| Include bot chat |  | Off |
| Maximum caption characters |  | 220 |
| Caption duration (seconds) |  | 8 |
| Font size |  | 36 |
| High contrast |  | On |
| Background |  | `solid` |
| Background color |  | `#000000` |
| Text color |  | `#ffffff` |

## Health checks

- **thsv.accessibility-captions.runtime:** Confirms ephemeral accessible captions are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`.

Private storage: `data/addons/thsv.accessibility-captions/`.

Dependencies: none.

## Remove or repair

1. No caption text history is retained.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
