# Stream Break & End Guard

Stream Break & End Guard helps you take regular breaks and stop on time. While you are live, it plans breaks from your stream length, warns you (and optionally chat) before each break, switches to your break scene, and brings you back afterward. When you reach your maximum stream length, it gives a five-minute warning and then switches to your ending scene. It never starts or stops your broadcast.

## What you need
- The Stream Break & End Guard Streamer.bot import. **THSV Extension - Stream Break & End Guard - Scene Controller** must stay triggerless and be approved for this extension. The optional **Pause Automation**, **Resume Automation** and **Toggle Pause** actions can go on a hotkey or deck button.
- A break scene and an ending scene in OBS, Meld or Streamlabs. The defaults use the Break and Ending scenes you chose under Extensions > Scene roles.
- Optional: a browser source for the countdown reminder. Copy the URL from the wizard and add it to the scenes where you want to see the warning. Its sounds also play from this source.

## Set it up
1. In Streamer.bot, import the package. Open **Scene Controller**, click Save and Compile, and leave it with no triggers.
2. Open Setup Wizard > Extensions > Broadcast Director > Stream Break & End Guard.
3. Choose your broadcast app (OBS, Meld or Streamlabs) and connection number (0 for the first connection).
4. Refresh the scene list and pick your break scene, ending scene and, if you like, a five-minute warning scene. Picking from the detected list avoids typing mistakes.
5. Set the maximum stream length (default 240 minutes) and choose whether the ending scene switches automatically at zero or waits for you.
6. Set up breaks: automatic schedule (default) or a manual interval, break length (default 5 minutes), and whether to return to the previous scene or a chosen one.
7. Optional: limit breaks to certain platforms or scenes, and edit the chat messages and sounds.
8. Approve **Scene Controller**, turn on **Enable Stream Break & End Guard**, save, and restart StreamBridge if asked.
9. Run the overlay preview offline, then try one short private test stream before relying on automatic scene changes. Test events never switch real scenes.

## Good to know
- Automatic breaks: a one-hour stream breaks at 30 minutes; streams of two hours or longer break every hour.
- The guard only runs after a real go-live signal. The end limit always wins, so a break that would overlap the end warning is skipped.
- With **Scenes that allow breaks** set, reminders are hidden and due breaks are skipped on other scenes. An empty list allows every scene.
- Chat gets one message when a break warning or the end warning starts (on by default). A sound plays then and again 10 seconds before.
- Pausing automation freezes all timers, so resuming never forces an instant scene switch.
- Opening your ending scene yourself also hands off to the ending sequence. The broadcast keeps running for your raid or manual ending.
