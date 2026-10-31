# Accessibility Captions

Accessibility Captions shows short, easy-to-read captions on your stream overlay. It can caption stream events (follows, subs, memberships, raids, Super Chats and donations) and, if you turn it on, public chat messages. Viewers see each caption for a few seconds, then it disappears. Caption text is never saved to disk.

## What you need
- An OBS browser source for the captions overlay. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.accessibility-captions`).
- Optional, for microphone captions only: the Streamer.bot action **THSV Closed Captions - Relay Dictation** (group **THSV Addon - Accessibility Captions**). Import and approve it only if your spoken words do not show up as live captions on their own. Attach only the **Voice Control > Dictation** and/or **Voice Control > Log** triggers to it.
- Nothing else. This add-on does not read messages aloud. For text-to-speech, use the separate Voice Relay add-on.

## Set it up
1. Open the Setup Wizard and go to **Extensions > Accessibility Captions**.
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
