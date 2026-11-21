# Dress rehearsal

**Start here > Ready to go live? > Dress rehearsal** runs once, off air, and tries what your stream uses. It then lists each item, grouped by area:

| Label | Meaning |
| --- | --- |
| Passed | It worked. |
| Problem | It did not work. The line says why and what to do; **Open** goes to the page that fixes it. |
| Check this | It may be fine, but look (for example an overlay page that is closed right now). |
| Watch | StreamBridge cannot tell by itself. Watch your streaming app while it runs (test alerts, the Emote Wall). |
| Skipped | Nothing to try (for example no scene roles set). |

## What it tries

Only what you switched on, so a new setup gets a short list. It works with OBS, SprigCast, Streamlabs Desktop and Meld Studio.

- **Streaming app**: the app you picked is connected.
- **Go Live** (SprigCast): on SprigCast builds that offer a read-only Stream doctor check, it says what would hold a go-live sent from a Stream Deck key.
- **Pre-stream check**: the same read-only check as **Check now** (Streamer.bot, actions, scenes, overlays, imports).
- **Scenes**: each scene role exists in your app. Tick **Switch through my scenes** to also switch to each one and back. That tick is off at first, because a scene change also runs that scene's own actions, such as lights or a mic.
- **Screen effects**: each Streamer Punishments effect is checked in your app.
- **Overlays**: every overlay extension gets a test, and its page answers when it drew it. So the list shows which overlays are in your app (and whether their scene is showing), which are closed right now, and which were never added.
- **Critter Catch**: a miss, then a catch. The page reports whether the critter kept its colours after breaking free of the Jar. It also warns when Twitch viewers can only throw with Jar rewards that switch on only while a critter visits Twitch.
- **Clips**: Random Clip Player plays one clip and the page reports it, then clips stop again.

## Safety

- It refuses to start while a platform is live or your streaming app streams or records, and stops by itself if that changes.
- Nothing is sent to chat or your platforms. Nothing starts streaming, recording or a raid. No points, rewards or counters change.
- The last result stays on Start here until the next run (saved in `data/state/dress-rehearsal-last.json`).

## For extension authors

Overlay pages served by StreamBridge's add-on host answer by themselves: a publish whose payload has a `rehearsalId` gets an `addon.rehearsal` message back (`phase: "shown"`, whether the page is in the streaming app and visible). Nothing to add to your extension.
