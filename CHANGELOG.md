# Changelog

## [Unreleased]

## [4.1.165] - 2026-11-25

- Fixed: features kept acting live after the stream ended. When the streaming app stops, StreamBridge now ends the live session on every platform, even one that never reports going offline, so every extension stops: break and end timers, rotations, chat reminders and scene switches. Seen on SprigCast on 2026-11-25: the TikTok live was ended by hand, so LIVE Studio refused StreamBridge's End LIVE and TikTok never reported offline. Stream Break & End Guard kept counting, posted a break warning to TikTok chat and switched to the break scene three minutes after the stream ended. Stream Break & End Guard also stops on its own as soon as the streaming app stops. A platform that reports offline later is ignored as a repeat.

## [4.1.164] - 2026-11-24

- Added: an overlay can be shown in a small browser source that only covers the part it draws. Add `sbCanvas=1920x1080&sbAt=X,Y` to the overlay's URL and size the source to the part you crop: the page lays out exactly as it does full-screen (text sizes, card spots and screen-size rules all follow 1920x1080) and shows the area whose top-left corner is X,Y. Nothing changes on stream, and a small page costs the streaming app much less memory and graphics work than a full-screen one. Works for alerts, captions, the Emote Wall page and every add-on overlay; a vertical canvas uses `sbCanvas=1080x1920`.

## [4.1.163] - 2026-11-23

- Fixed: Raid Scout could leave the stream running after the ending flow. When Twitch never confirmed the raid and the ending ad had already finished, the stream end was due at once; StreamBridge's timer refuses a wait shorter than one second, so the stop step was never scheduled and the stream stayed live (seen on SprigCast on 2026-11-23, where the stream had to be ended by hand). Raid Scout now waits at least one second for any step, and a new stream clears an ending left unfinished by the last one.

## [4.1.162] - 2026-11-22

- Fixed: StreamBridge sent OBS's saved WebSocket password to SprigCast. When OBS isn't running, SprigCast takes OBS's usual port (4455), so StreamBridge's built-in OBS connection reached SprigCast instead and was turned away again and again (six refused sign-ins in two minutes in SprigCast's log). StreamBridge now reads where SprigCast listens and leaves that port alone for OBS, saying "SprigCast is using this port" under Scene connections.
- Changed: when a streaming app turns down the saved password or key, StreamBridge stops trying. The connection waits, paused, with what to do (pair again for SprigCast, the current password for OBS), and tries once more only after the app restarts or you pair or edit the connection. Before, it kept trying every 30 seconds.
- Changed: StreamBridge names itself ("StreamBridge") when it connects to OBS-style apps, so their logs say which app connected.
- Changed: chat overlays keep the last 60 messages instead of 200 (the Wizard's chat dock still keeps 200). An overlay only shows what fits in its crop, so a long stream now uses less memory in your streaming app.

## [4.1.161] - 2026-11-22

- Fixed: in Critter Catch, a Jar throw could still leave the critter looking pale or washed out, as if its colours had changed. The swirl into the Jar no longer brightens the critter at all (it fades a little instead), so nothing can stay on it after a catch or a miss.

## [4.1.160] - 2026-11-21

- Changed: wording viewers and Discord see no longer assumes a village. Live Beacon says "See you in chat! 🌿", Local Clock says "It is {time} on {date} here.", the Magic 8-Ball answers with "The stars say yes" and similar, Roll Call and Fun Commands use plain words, and Discord webhook names and footers drop "THSV". Settings you already saved keep your own wording; only empty settings use the new defaults.
- Changed: extensions with Village names now have plain names: Lurk Tracker, Hydration Station, Fun Commands, Giveaway Draw, Jukebox, Chat Polls, Roll Call and Voice Relay. Their ids, commands and Streamer.bot actions stay the same.
- Added: **Connect OBS for me** under Scene connections. StreamBridge reads OBS's own WebSocket port and password from this PC, so you don't copy them. If OBS's WebSocket server is switched off, it says where to switch it on.
- Fixed: a wrong OBS password said "OBS WebSocket closed before the scene query completed". It now says OBS turned down the password and how to fix it. The messages no longer mention an environment variable.
- Added: **Let Meld show overlays** on the Overlays page. Meld Studio shows browser overlays blank until Windows lets it open pages on this PC; the button asks Windows for that (one Yes on the Windows prompt), then restart Meld.
- Added: **Add all** and **Make starter scenes** now work with Streamlabs Desktop too, through its Remote Control token.
- Added: extensions that need a platform you have not turned on (for example Raid Scout and Random Clip Player need Twitch) show "Needs Twitch" and are hidden from the suggested list, with a count of how many.
- Changed: the TikTok switch says "Go LIVE and End LIVE together with your streaming app" instead of OBS.
- Fixed: the guides pointed to buttons and sections that no longer exist ("Run pre-stream check", "Browser-source checklist") and never said to connect your streaming app. Quick start now has a step for it, and a test checks that every page and section a guide names exists in the Wizard.

## [4.1.159] - 2026-11-21

- New: on SprigCast, the "stream output keeps dropping" warning now works too. When a platform (a SprigCast place such as Kick or TikTok) keeps dropping and reconnecting while the rest of the stream is fine, the tray warns you, as it already did for OBS. StreamBridge reads SprigCast's place.changed news (from the SprigCast build that has it) over its one connection, and on older builds the place states in stream status, without opening any extra connection.
- Changed: StreamBridge's one connection to SprigCast now sends a WebSocket ping every 30 seconds and reconnects only when the connection really closes or stops answering, waiting 1, 2, 5, 10 and then 30 seconds between tries (for every streaming app). Because SprigCast sends scene changes by itself, StreamBridge now re-reads the scene list only every 2 minutes as a backup instead of every 15 seconds.
- Checked, nothing to change: StreamBridge and the Streamer.bot actions never find SprigCast places by the old "sprigcast:" output names and never build SprigCast source ids from the kind, so SprigCast's new place names and source ids need nothing.

## [4.1.158] - 2026-11-21

- Added: **Dress rehearsal**, one button under "Ready to go live?" on Start here (it replaces Stream rehearsal). Press it off air and it tries what your stream uses, then lists each item as Passed, Problem, Check this, Watch or Skipped, grouped by area, with what to do and an Open button to the page that fixes it. It shows a test on every overlay you switched on and the page answers when it drew it, so you see which overlays are really in your streaming app, which are closed right now and which were never added. Critter Catch plays a miss and a catch, and the page reports whether the critter kept its colours after breaking free of the Jar. Random Clip Player plays one clip and reports it. Test alerts come from the platforms you switched on. Streamer Punishments' screen effects are checked in your streaming app. It also runs the pre-stream check, checks that each scene role exists in your app, and warns when Critter Catch's Twitch Jars can only be used while a critter visits Twitch on a stream sent to several platforms. With SprigCast it asks the Stream doctor what would hold Go Live (on SprigCast builds that offer it). Everything comes from what you switched on, so a new setup gets a short list, and it works with OBS, SprigCast, Streamlabs Desktop and Meld Studio.
- Safe by design: it refuses to start while you are live or your streaming app streams or records, and stops by itself if that changes. Nothing is sent to chat or your platforms, nothing starts streaming, recording or a raid, and no points, rewards or counters change. Switching through your scenes is a separate tick box (off at first), because scene changes also run their own actions, such as lights. The last result stays on Start here until the next run. In all nine languages.

## [4.1.157] - 2026-11-21

- Fixed: in Critter Catch, a critter that broke free of a Jar came back looking washed out, as if its colours had changed, and stayed that way for the rest of its visit. The swirl into the Jar brightens the critter, and that brightness stayed on after it popped back out. The critter now keeps its own colours after a miss.

## [4.1.156] - 2026-11-21

- Fixed: with SprigCast, the Go Live step (the Starting Soon Stream Deck key and other go-live buttons) sometimes only changed the scene. SprigCast's Stream doctor holds a go-live that comes from another app whenever it has a serious warning, even a passing one such as "the preview runs at 42 of 60 fps", and then nothing starts. Go Live now asks once, waits 3 seconds, and if SprigCast still isn't live it asks again with SprigCast's "Go live anyway". It also logs that the Stream doctor held it, so you can look in SprigCast for why. A missing stream key, or no place switched on, still stops it.

## [4.1.155] - 2026-11-21

- Fixed: StreamBridge held two connections to SprigCast instead of one: the scene connection and the kept-open request connection from 4.1.151. Requests now always use the scene connection when it is open (also after SprigCast moved to another port), and the request connection closes as soon as the scene connection is up and its last answer is in.
- Changed: StreamBridge's connections to SprigCast now also carry the name "StreamBridge" as their User-Agent, so SprigCast's "app connected" log line names it too (the name in the greeting names it in the lines after that, from SprigCast's next build).

## [4.1.154] - 2026-11-21

- Fixed: updating StreamBridge while SprigCast was open could fail with "StreamBridge did not stop within 15 seconds", and the update was cancelled. StreamBridge stopped, but its kept-open connection to SprigCast held the program open for up to 5 more minutes. StreamBridge now closes that connection when it stops, so it exits straight away and the update goes through.

## [4.1.153] - 2026-11-21

- Fixed: Critter Catch's overlay said "Type !catch or redeem a Jar" to everyone, even when the critter was visiting only one platform. Everyone sees the same critter on stream, so Twitch viewers looked for the Jar rewards, which stay switched off while the critter visits another chat. A visit to one platform now names it, for example "TikTok chat: Type !catch". Tip for one stream sent to several platforms: set "Where critters visit" to "Every platform at once" so every critter turns the Twitch Jar rewards on and every chat can catch it.
- Fixed: the pre-stream check listed OBS-only problems (an empty "Aitum Vertical" canvas, Aitum pointing at a missing canvas) even when you stream with SprigCast, Meld or Streamlabs, so it never said "ready to stream". OBS's canvas checks now run only when OBS is your streaming app.

## [4.1.152] - 2026-11-21

- Fixed: the TikTok LIVE reminder said "OBS is streaming" or "OBS stopped streaming" even when you stream with SprigCast (or Meld or Streamlabs). It now names the app you actually stream with.
- Fixed: the TikTok LIVE reminders showed even when TikTok wasn't part of the stream, for example "End your TikTok LIVE" after a Twitch-only test stream with TikTok LIVE Studio closed. StreamBridge now asks LIVE Studio first. "Go LIVE on TikTok" only shows while LIVE Studio is open and not live yet, and "End your TikTok LIVE" only shows while it is live (or paused). If LIVE Studio can't be asked, the reminder shows as before, so a running LIVE is never forgotten.
- Fixed: StreamBridge's Windows notifications showed "NotifyIconGeneratedAumid_..." as their name, with a small, blurry picture and Windows' generic blue info icon. They now show "THSV StreamBridge" and a sharp Village badge.
- Changed: tray notifications say plainly what happened and what to do. For example, "Streaming app is slow to answer" names the slow app, how long it took and your limit, and "Streaming app connection changed" says which app StreamBridge is linked to now.

## [4.1.151] - 2026-11-21

- Changed: on a SprigCast build whose Web pages play H.264 (SprigCast lists the feature `browser.h264`, from build 44907167825), **every** clip now plays right in its page: Random Clip Player in the Clips page and the raid clip in the Raid Scout page, on the graphics card. Before, Random Clip Player clips still went to the "StreamBridge Clip Video" source, which SprigCast decoded on the CPU and which slowed last night's stream. StreamBridge reads the feature each time it checks SprigCast (every 30 seconds). With the feature it no longer touches "StreamBridge Clip Video", "StreamBridge Raid Clip Video" or "StreamBridge Raid Clip Sound" at all: no file, no mute or unmute, no placeholder. They stay exactly as they are. On older builds nothing changes. Which copy of a page is heard is still SprigCast's setting: keep the vertical copies muted (not sent to the mixer) so each clip is heard once.
- Changed: with that feature, **Check in SprigCast** and **Set it up for me** for clips change nothing in SprigCast and say the page plays the clips. The two "Play clips in a SprigCast video source" settings now say they are only for older SprigCast builds, in all languages.
- Changed: StreamBridge now holds one connection to SprigCast for its requests instead of connecting and leaving for every few requests, closes it only after 5 minutes without a request, and names itself "StreamBridge" when it connects so SprigCast's log can show who it is. The "is SprigCast there?" check reuses an open connection instead of opening another.
- Note: the Raid Scout page still opens as `localhost`, not `127.0.0.1`, on purpose. Twitch's clip player only plays inside a page whose address is a name; it refuses an IP address such as `127.0.0.1`. The connection to SprigCast itself already uses `127.0.0.1`.

## [4.1.150] - 2026-11-21

- Changed: on a SprigCast build whose Web pages play H.264 (SprigCast lists the feature `browser.h264`), Raid Scout's **Set it up for me** no longer makes the Edge window capture and Edge sound row, and no longer opens Edge to measure it. It says instead that other channels' clips play with Twitch's player right in the Raid Scout page. Playing the raid target's clip in the page itself already happens since 4.1.136 whenever SprigCast lists that feature. On older SprigCast builds nothing changes: the Edge window and its sound row are made and used as before. An Edge window source and sound row you already have stay in your garden, hidden and muted; you can remove them in SprigCast once the new build is in use.
- Changed: the Raid Scout setting **Play raid clips in a SprigCast video source** now explains both cases (Twitch's player in the page on newer SprigCast builds, the Edge window on older ones), in all languages.

## [4.1.149] - 2026-11-21

- Fixed: the Fan Crown card showed "â™>" instead of its crown symbol (since 4.1.137). The symbol is now written in a way that can't be garbled when the page is saved.

## [4.1.148] - 2026-11-21

- Fixed: the combined **Redemption cards** and **Sounds** pages (new in 4.1.146) showed a solid dark box instead of a see-through page, so no card could be seen. The browser paints a frame solid when its colour scheme differs from the page around it; the combined page now uses the same scheme as the cards.
- Fixed: custom CSS you set on a combined page in OBS or SprigCast now reaches the cards inside it. Before, it only styled the empty outer page, so cards lost a custom look (like the Village Post frames). Each card gets a copy of that CSS, kept up to date when you change it. Use the custom CSS of one of your current card sources (for example Fan Crown) on the combined page.

## [4.1.147] - 2026-11-21

- Changed: SprigCast now closes web pages that have been off screen for a few minutes, unless their **Keep running when hidden** is on. Some StreamBridge pages must not be closed: Alerts (the alert queue and sounds live in the page), Chat (the history lives in the page), Clips and Raid Scout (they report clip playback back to StreamBridge), Soundboard, Random Sound and the combined Sounds page (sound only), and Stream Break Countdown and Starting Soon Countdown (their sound cue). Each time StreamBridge connects to SprigCast it now switches Keep running when hidden **on** for those pages. It never switches it off and never touches any other page, so your own choices stay as they are. Every other StreamBridge page can close safely, because StreamBridge sends it its current state again when SprigCast reopens it.

## [4.1.146] - 2026-11-21

- New: **combined pages**, so your streaming app keeps fewer web pages open. Every browser source is a separate page with its own share of graphics memory, which adds up on a weaker PC. The five redemption cards (Fan Crown, Village Roll Call, Chat Play Pack, Viewer Spotlight and First Five) sit in one spot and only show one at a time, so they can now share one **Redemption cards** page (`/overlay/combined/redemption-cards`). Soundboard and Random Sound draw nothing, so they can share one **Sounds** page (`/overlay/combined/sounds`). Each extension still runs inside the combined page, keeps its own settings and Preview button, and its own link still works. Each of these extensions' **Open overlay & test** step in the Wizard explains this and has the combined link to copy. Use a combined page in place of the single pages, not as well. Nothing in your scenes changes until you swap them.
- Changed: SprigCast now sends its events in groups while you're live (about 10 a second), so a quick run of scene or stream changes can arrive together. StreamBridge reads every event in a group in order, whether SprigCast sends them as separate messages, as one list, or wrapped as `events` or `batch`, and still answers its own requests in between. A group with several scene changes makes StreamBridge read the scene once (the last one wins), and a group with stream and recording changes makes it check the stream state once instead of once per event.

## [4.1.145] - 2026-11-21

- Fixed: a Random Clip Player clip that started silent on Starting Soon (or that started just before a scene change reached StreamBridge) stayed silent after you switched to Be Right Back or another scene with clip sound. The clip that is playing now follows the scene: it unmutes when you leave a muted scene and mutes when you enter one, without restarting. This works in SprigCast's clip video source, the Raid Scout window sound and the clip pages in OBS.
- Fixed: in SprigCast, Streamer Punishments' Pixelate, Blackout and Barrel Roll only hit the main (horizontal) canvas when the vertical canvas has its own copy of the camera, as a setup imported from OBS does. When a source named "<name> (Vertical)" exists (for a sprig: for each source inside it), it now gets the same effect for the same time, so both streams see it.

## [4.1.144] - 2026-11-21

- Fixed: if you ended the stream and went live again on the same scene (for example Starting Soon), Random Clip Player didn't start, and nothing else that waits for "stream started" or "stream stopped" heard it either. StreamBridge mistook the second start for a repeat of the first, because both looked the same, and dropped it. Each start and stop now counts as its own.
- Fixed: Critter Catch told a Twitch viewer to redeem a Jar channel point reward while the critter was visiting another platform's chat (for example TikTok). The Jar rewards are only switched on for Twitch visits, so the viewer couldn't find them. Now that viewer is told which chat the critter is visiting, and that the next one may come to theirs.

## [4.1.143] - 2026-11-21

- Fixed: with SprigCast as your streaming app, TikTok LIVE automation never pressed Go LIVE in TikTok LIVE Studio. Before going live on TikTok, StreamBridge makes sure the virtual camera TikTok shows is on, and it always asked OBS, so with OBS closed it gave up and showed the reminder instead. It now asks your streaming app: SprigCast turns on SprigCast Camera, and OBS turns on OBS Virtual Camera as before. Meld, Streamlabs, or no streaming app picked still use OBS.
- Fixed: **Random Clip Player** didn't start when you went live while already on a clip scene (for example Starting Soon), if that scene was picked before StreamBridge last started. StreamBridge only learns the scene from a scene change, so it didn't know which scene was on air. The go-live signal now names the scene on air for every streaming app (OBS, SprigCast, Meld and Streamlabs), and clips start from it.
- Fixed: the **Ad Break Companion** countdown stayed on screen after the stream ended in the middle of an ad break (or with one coming up). It now clears as soon as your streaming app stops streaming or Twitch goes offline. Previews you run while offline are not affected.

## [4.1.142] - 2026-11-21

- Fixed: SprigCast's Stream doctor could refuse Go Live because the **StreamBridge Clip Video** or **StreamBridge Raid Clip Video** source had no video file while no clip was playing. StreamBridge now ships a tiny blank placeholder video (one see-through frame) and keeps it in those sources whenever no clip plays: "Set it up for me" makes them with it, and they go back to it after each clip ends, fails or is stopped, so the source never sits empty or on a clip the cache has since removed. Sources made by an earlier version are filled once when StreamBridge connects to SprigCast (never in the middle of a clip). Nothing in the layout changes.

## [4.1.141] - 2026-11-21

- Changed: **Random Clip Player** and **Raid Scout** only start from a scene change while your streaming app is streaming. This works the same in OBS, SprigCast, Streamlabs and Meld. While the app is offline, closed or not answering, switching to a clip scene (or the ending scene) does nothing: no clips, no SprigCast Clip Video or Raid Clip Video, and no Edge raid clip window. If you go live while already on a clip scene, clips start then. When the stream stops, clips stop as before.
- Unchanged on purpose: your own presses still work offline, so you can test. That is Start clips in the Control Panel (and the Streamer.bot Enable action) for clips, and Suggest, Finish Stream and Cancel for Raid Scout.
- Changed: StreamBridge's go-live and stream-stopped detection now follows the streaming app you picked (it used to ask OBS only). SprigCast, Meld and Streamlabs are checked every 10 seconds; OBS still reports right away. Anything that waits for "stream started" or "stream stopped" (for example TikTok LIVE automation and live recovery) now follows SprigCast, Meld and Streamlabs too. If the app is closed for 30 seconds mid-stream, the stream counts as ended.
- New for extension makers: `context.streaming.live` (no permission needed) is true while the streaming app is streaming, false when not, and undefined before StreamBridge has asked it once.

## [4.1.140] - 2026-11-21

- New: a compact Village Multichat dock for small panels such as SprigCast's Chat panel. When the dock is narrower than 441 px or shorter than 481 px, it switches by itself to a slim header, one reply bar (destination, message box and Send on a single line) and no help text, so chat messages get most of the space. The message box starts as one line and grows to about four lines while you type, the character count only shows when you are close to the platform's limit, and a "Sent to ..." note clears itself after 5 seconds. Wider OBS and browser docks look the same as before.
- New: in the compact dock, chat messages are plain lines too: the viewer's name in their platform's colour (Twitch yellow, YouTube blue, Kick purple, TikTok pink, Facebook light blue), then the message. No cards, profile pictures, platform labels or badges, so about three times as many messages fit. Long messages still wrap so nothing is cut off. The on-stream chat pages keep the layout you picked.
- New: add `?compact=1` to the dock link (`http://127.0.0.1:8787/overlay/chat/dock?compact=1`) to always use the compact dock, or `?compact=0` to never use it.
- Changed: the dock's own wording (Reply to, Send, the destination list, status and error lines) now follows your StreamBridge language in all nine languages.

## [4.1.139] - 2026-11-21

- Added: **Soundboard**, a new extension (free, off until you turn it on, and empty until you add sounds). Add sounds from your PC with Choose file (MP3, WAV or OGG), press Test to hear one, and set each sound's volume. Each sound gets a button in the Control Panel, and can also have a chat command such as `!airhorn` (on Twitch, YouTube, Kick, TikTok and Facebook) and a Twitch or Kick channel point reward. Chat commands have cooldowns (for everyone, per viewer and per sound) and a "who can play sounds" choice; rewards always play, and you and your moderators skip the cooldowns. Optional `!sounds`-style list command and a moderator-only stop command.
- Added: **Random Sound**, a new extension (free, off and empty until you set it up). Point it at a folder of sounds on your PC (MP3, WAV, OGG, OPUS, FLAC, M4A or WEBM); each chat command, channel point reward or Control Panel press plays one of them at random. By default every sound in the folder plays once before any repeats, and never the same sound twice in a row. Up to 20 folders, each with its own command, reward and volume. Sounds you drop into a folder later are picked up by themselves, and the Control Panel shows how many sounds each folder has, or what is wrong with its path. StreamBridge only reads the list of files; it never changes your folders, and the sound page can only play files from that list.
- Both play through one small browser page that shows nothing (`/overlay/addons/thsv.soundboard` and `/overlay/addons/thsv.random-sound`), so they work in OBS, SprigCast, Streamlabs and Meld. Add the page on one canvas only (your horizontal one) so each sound is heard once. SprigCast's pages can't play MP3 (or M4A) files, so use WAV or OGG sounds there; the extensions are marked "partly" for SprigCast with that note.
- Added: a new extension permission, `audio.folder` ("reads the list of sound files in folders you name"), used only by Random Sound.
## [4.1.138] - 2026-11-21

- New: variant alerts. In Alerts, pick an alert (for example Twitch · Bits / Cheer) and use "Add a variant" to play your own video instead of the normal card for chosen amounts: exactly an amount (a cheer of exactly 69 bits), that amount or more, or between two amounts. Works for every alert with an amount: bits, tips and Super Chats (the money amount), gifted subscriptions, gifts, raids (raiders), milestones and subscriptions (months). Follows have no amount, so they have no variants. Nothing ships set up: every streamer adds their own.
- New: a variant shows the video with the alert's title under it, an optional line of your own text, and the viewer's message (can be turned off). StreamBridge reads the video's length when you add it and keeps the alert up for that long plus a 2-second fade-out (the fade-out and an optional fixed length can be changed). The page measures the video again when it really starts, so a video that loads slowly still plays to the end. A picture can be used instead of a video, with an optional sound that sets the length.
- New: "Test variant" sends a test alert with the variant's amount to the alert pages, so you can see and hear it before saving. A variant alert plays at once and is never combined with other cheers or gifts.
- Changed: videos for variant alerts can be up to 60 MB (card background videos stay at 5 MB), and the local alert media folder holds up to 500 MB.
- Changed: alert pages load each variant video once while idle, so SprigCast (which turns MP4 into WebM the first time a page plays it) has it ready before the alert fires.

## [4.1.137] - 2026-11-20

- Fixed: with OBS open next to SprigCast, StreamBridge thought SprigCast was closed and paused its SprigCast link. Both apps can listen on port 4455 at once (OBS on every address, SprigCast on 127.0.0.1), and StreamBridge only looked at the first listener it found. It now checks every program listening on the port and picks the one you saved, for SprigCast, OBS, Meld, Streamlabs and Streamer.bot.
- Fixed: Raid Scout's Set it up for me failed with "SprigCast: the action failed" when it had to add the "StreamBridge Raid Clip Sound" row. SprigCast refuses muting a sound made earlier in the same change, so the row is created muted and the mute is sent again right after the change is applied.
- Changed: the Punishments tracker heading has real spaces between "PUNISHMENTS", "OWED" and the month, so tools that read the page's text no longer see "PUNISHMENTSOWED". The panel looks the same.

## [4.1.136] - 2026-11-20

- Fixed: on SprigCast builds that can catch one program's sound (feature `app_audio.pids`), the raid clip's "StreamBridge Raid Clip Sound" row now catches only the Edge window StreamBridge opened. Sound from your own Edge tabs is no longer heard on stream while a raid target's clip plays. Older SprigCast builds keep the 4.1.135 behaviour.
- Changed: when a raid clip ends or is stopped, the window capture is hidden before the Edge window closes, so its last picture is never left showing.
- Changed: Set it up for me sizes the SprigCast clip sources to the whole clip window (the media frame, 1600x900 on a 1920x1080 page) instead of 5 px inside it. They now line up with the window in the scene art, including pages styled to fill the window edge to edge. Press Set it up for me again to resize sources placed by 4.1.134 or 4.1.135.
- New: once SprigCast's Web pages can play H.264 (feature `browser.h264`), Raid Scout plays the raid target's clip with Twitch's player right in its page, and the Edge window and still picture are no longer used. Nothing to change on your side when that SprigCast build arrives.

## [4.1.135] - 2026-11-20

- New: on SprigCast, Raid Scout plays the raid target's clip again instead of showing its still picture. Twitch gives no video file for another channel's clip, only its own player, and SprigCast's Web pages can't play it yet. Until they can, StreamBridge opens the clip in a small Microsoft Edge window (its own private profile, titled "StreamBridge Raid Clip") for the length of the clip, and SprigCast shows that window through a window capture placed under the Raid Scout page. The window closes when the clip ends. This is a stopgap and goes away once SprigCast's Web pages can play Twitch's player.
- New: Raid Scout's Set it up for me (in "Video source in SprigCast", refused while live or recording) also adds "StreamBridge Raid Clip Window", a window capture kept hidden under each Raid Scout page and cropped to leave out the Edge title bar (measured by opening the window once), and "StreamBridge Raid Clip Sound", Edge's sound in the mixer, kept muted except during the clip. The capture only matches a window with that exact title, never your own Edge windows.
- Known limits: the Edge window opens on your screen (top left) during the raid clip and can take focus. While the clip plays, sound from your own Edge windows is heard on stream too. Without Edge, or until Set it up for me has run, the still picture shows as before.

## [4.1.134] - 2026-11-20

- New: Random Clip Player and Raid Scout can play clips in a SprigCast video source. SprigCast's Web pages can't play Twitch clips (H.264), so the clip page showed an empty player there. With "Play clips in a SprigCast video source" on (the default) and SprigCast as your streaming app, the clip plays in a SprigCast video source placed just under the clips page, and the page still draws its frame, title and fades around a see-through video area. Everything goes through SprigCast's own API.
- New: a "Video source in SprigCast" panel in both extensions' settings. Check shows whether the video source sits under each clips page; Set it up for me (refused while live or recording) makes the source and places it under every page, sized to the clip area, as one step SprigCast's Undo can take back. It needs the SprigCast build with the layout tools.
- New: Raid Scout uses the SprigCast video source for clips from your own channel. Other channels' clips play through Twitch's own player, which SprigCast's Web pages can't play, so while SprigCast is your streaming app the raid target's clip shows its still picture and title for the clip's length instead of a blank player.

## [4.1.133] - 2026-11-20

- Fixed: in a narrow Streamer Punishments tracker panel the heading and the first column label ran together ("PUNISHMENTSOWED"). The column labels now drop below the heading when there isn't room, and the panel no longer has a 300 px minimum that made it crowded on small pages.
- Fixed: on a narrow Scoreboard the stat names were cut down to a letter or two ("F…", "Tip…"). The platform chips and record now move to a second line so the name shows in full.
- Fixed: on a short Village Polls page the answers were squeezed into two columns and cut off ("Comm…"). Two columns are only used when the page is wide enough.
- Fixed: on a short page, Village Roll Call, First Five, Fan Crown, Village Polls, Village Draw, the Play Lobby card and Critter Catch were cut off at the bottom. They now shrink as a whole to fit the page. Redemption pages that use `cardSize=` are unchanged.

## [4.1.132] - 2026-11-20

- Changed: Chat First on a vertical page (`overlayOrientation=vertical`) wraps its names into as many columns as the page is wide, instead of one tall column. Five names now fit a short, wide vertical box at full size instead of being shrunk; a narrow page still stacks them in one column.

## [4.1.131] - 2026-11-20

- Fixed: on a vertical Punishment Countdown page (`overlayOrientation=vertical`), the compact countdown kept its saved corner offset, so on a page sized to the card it was pushed partly off the page. It now fills the page like the other vertical timers.

## [4.1.130] - 2026-11-20

- Fixed: a Streamer Punishments page with `?tracker=only` stretched the tracker panel over the whole page, so a full-canvas page showed a huge, mostly empty panel. The panel now keeps its normal size in its saved corner.

## [4.1.129] - 2026-11-20

- Fixed: the Streamer Punishments tracker stayed on screen after its Preview button or overlay test step ended. Hiding a preview now hides the tracker too, and any real tracker, timer or labels come straight back.
- New: a preview of the punishment grace countdown (Preview mode "countdown", and the overlay test step `addon:thsv.streamer-punishments:countdown`), so a Punishment Countdown page set to `tracker=off` can be checked without a real punishment.

## [4.1.128] - 2026-11-20

- Fixed: in the overlay test sequence, test cheers and gift subscriptions now show at once. Before, they waited 5 seconds to be combined like real ones, so they appeared late and pushed the next test alert back. Real cheers and gift subscriptions still combine.
- New: each overlay test step reports `visibleMs`, about how long it stays on screen, so a screenshot can be timed while it shows. Emote Wall explosions and fireworks are over in 2 to 4 seconds.

## [4.1.127] - 2026-11-20

- Fixed: in every extension's scene list picker (for example "Only on these scenes"), picking a detected scene jumped straight back to "Choose a detected scene…", so Add scene did nothing. The pick now stays, and Add scene adds it.
- Changed: the Scene roles group in scene pickers is clearer. It is headed "Scene roles: follow what you set in Features > Scene roles", and each entry reads like "Main live scene (follows Scene roles, now 🔴 Gameplay)". Picking a role keeps working when you rename or swap scenes, which is why it is listed apart from your scenes.

## [4.1.126] - 2026-11-20

- New: an overlay test sequence for checking a layout without an audience. It fires a list of test events (alerts, a chat sample, a caption, Emote Wall effects and extension previews) on the overlay pages a fixed gap apart, and records when each one was sent. It only draws on the overlay pages and refuses to run while you are live. See "Overlay test sequence" in the browser overlay guide.
- Fixed: a Preview button on a timer or panel extension (for example the Stream Launch Countdown, Reward Timers or the Streamer Punishments tracker) replaced the real timer that a reloaded page gets back, so a refresh could show the sample again. Previews no longer replace it.

## [4.1.125] - 2026-11-20

- Changed: scene pickers list SprigCast's blooms tidily. Your main blooms come first, then each of your sections (the ones you mark with separator blooms such as "🎚 Capture Scenes 🎚") from A to Z, then everything else. Blooms are A to Z inside each group, ignoring the emoji at the start. Separator blooms and sprigs are no longer listed. Scene roles keep their own group at the end.
- Changed: a scene picker without its own app setting now lists the scenes of the streaming app you picked on Start here, and SprigCast can be picked in the scene list pickers.
- Fixed: separator scenes such as "🎚 Main Scenes 🎚" are hidden from the OBS scene pickers too, and scenes sort by name instead of by their emoji.

## [4.1.124] - 2026-11-20

- Fixed: in SprigCast, Blackout, Pixelate and Barrel roll now show on the horizontal and the vertical canvas together. A source is changed everywhere it shows. A sprig is changed in the bloom on air (Barrel roll spins it everywhere).
- Fixed: Blackout and Pixelate now work on a sprig in SprigCast, not only on a source.
- Changed: SprigCast's Blackout no longer falls back to a Color Correction filter when the Hide it plugin is missing, because a filter only changes one canvas. The check and the effect ask you to add Hide it under Tools › Plugin store instead.

## [4.1.123] - 2026-11-20

- Fixed: the Stream Launch Countdown showed an empty box after its browser source reloaded (a scene collection switch, a SprigCast garden switch, or a refresh) while it was waiting for live. StreamBridge now keeps the last countdown and shows it again at once, until the countdown is hidden. The same goes for the other on-screen timers, such as Ad Break Companion, Stream Break & End Guard and Streamer Punishments.

## [4.1.122] - 2026-11-20

- New: Start here has a "Your streaming app" picker (OBS, SprigCast, Streamlabs or Meld). Your pick stays until you change it, and it sets the app everywhere at once: extensions, the Overlays page, Start all streaming tools, and the Streamer.bot actions.
- Fixed: the streaming app could switch back to OBS by itself. With "Pick for me", StreamBridge used whichever app was connected first, so OBS took over whenever SprigCast wasn't connected yet. Start here now says when nothing is picked and which app is in use for now.
- Changed: picking an app also points Raid Scout's go-live and end-of-stream app and Stream Session Guard's app at your pick, if they still named another app. They follow it after StreamBridge restarts.
- Changed: the Overlays page and Extensions pickers save through the same step, so all three pickers always agree.

## [4.1.121] - 2026-11-19

- New: every Streamer.bot action StreamBridge runs is told which streaming app you picked (OBS, SprigCast, Streamlabs or Meld) as `thsvStreamingApp`, so its C# uses the right connection instead of assuming OBS.
- Changed: Streamer Punishments' Switch Scene helper follows your streaming app: OBS and SprigCast through Streamer.bot's OBS connection, Streamlabs and Meld through their own. Set Filter says plainly that Streamlabs and Meld filters are done by StreamBridge itself.
- Changed: Stream Break & End Guard's scene helper accepts SprigCast and switches its scene through Streamer.bot's OBS connection (SprigCast's OBS door).
- Changed: Raid Scout's Go Live and Stop All helpers notice when Streamer.bot's OBS connection is really SprigCast. They start or end SprigCast's stream (every place switched on in SprigCast) and skip the Aitum plug-in steps that only exist in OBS.
- Changed: the Bridge Launcher's connection checks say "SprigCast" when Streamer.bot's OBS connection reaches SprigCast, instead of "OBS".

## [4.1.120] - 2026-11-19

- Fixed: on the readiness check, "On-stream overlays" now reads the overlays straight from your streaming app when it can (SprigCast and OBS), and lists any that are missing. Before, it could show an old count on SprigCast.
- Fixed: the overlay link check (wrong port, feature turned off or not installed) now checks SprigCast's own sources too, not only OBS's scene collection.
- Changed: picking your streaming app now also changes which app "Start all streaming tools" opens: the picked app starts and the other streaming apps no longer do. Nothing changes if no streaming app was set to start.

## [4.1.119] - 2026-11-19

- Changed: StreamBridge looks for SprigCast on every port SprigCast may move to (4455 to 4460) when it can't read SprigCast's connection file.
- New: when SprigCast closes or restarts its connection, StreamBridge lets go right away and reconnects by itself when SprigCast is back.
- Changed: a paused SprigCast recording counts as recording, so automatic updates keep waiting.
- Changed: when a SprigCast effect needs a plugin (Hide it or Barrel Roll), StreamBridge says which one and that it's under Tools › Plugin store in SprigCast. When SprigCast stops knowing StreamBridge, the message says the device may have been removed under Settings › Connections and how to pair again.
- Fixed: a few Wizard translations that read wrong on one of their screens. Stream Bingo's setting is now "Bingo card size" (the feature-card "Card size" no longer uses bingo wording in Spanish, Portuguese and Italian), Local Clock's 12/24 setting is now "Hour format" (the countdown's "Hours" no longer says "hour format" in Chinese, Japanese and Korean), Goal Bars "Target" now means the goal number in every language, and "Type" reads naturally in Chinese and is translated in French.

## [4.1.118] - 2026-11-17

- Fixed: under Bridge updates, the line below "Install updates by themselves" now shows the version you're running and when it was installed, whether it updated by itself, through the installer or by hand. Before, it kept showing the last automatic update, even when a newer version had been installed another way.
- Changed: automatic updates now wait while your own streaming app streams or records (OBS, SprigCast, Meld Studio or Streamlabs Desktop, as picked under Scene connections), and the line names that app instead of always saying OBS.
- Fixed: Facebook is in the "Where do you stream?" list on Get ready to stream, matching the Main platform list. Ticking it turns on your saved Facebook Page connection; if no Page is connected yet, it says to connect one first.
- Fixed: Facebook now counts towards the free plan's two platforms like the others, once the free plan is enforced at 5.0. Nothing changes before then.
- Translated: the new update and Facebook lines, in all nine Wizard languages.

## [4.1.117] - 2026-11-17

- Changed: the free and Pro split for 5.0. Pro is for extensions that are big or complicated, need an outside service or key, or work across several platforms at once: Category Pilot, Chat Play Pack, Clip Courier, Clip Library Cache, Community Analytics, Creator Controls, Discord Chat Archive, Face Filters, Follower Pulse, Free Game Check, Raid Scout, Random Clip Player, Snap, Stream Bingo, Translate, Village Jukebox and Village Voice. Prize Wheel, Streamer Punishments, Viewer Spotlight, Village Draw, Live Beacon, End Credits, Scoreboard, Subathon Timer, Viewer Lobby and Village Roll Call are free. Nothing is locked before 5.0.
- Changed: Face Filters, Village Voice and Ko-fi Donations now walk you through connecting your own Streamfog Remote Key, Speaker.bot and Ko-fi verification token step by step, in all nine Wizard languages.

## [4.1.116] - 2026-11-17

- New: the creator's own PCs always run StreamBridge Pro, with no licence key, no online check and no end date. The Licence card shows StreamBridge Pro as active on those PCs.

## [4.1.115] - 2026-11-17

- Changed: when a streaming app doesn't answer, Scene connections says which app and where to turn its connection on (OBS: Tools › WebSocket Server Settings; Streamlabs Desktop: Settings › Remote Control; Meld Studio: open the app; SprigCast: Settings › Connections), instead of "connect ECONNREFUSED".
- Fixed: a saved SprigCast connection keeps working when SprigCast moves between 4455 and 4456 (for example when OBS is opened or closed), even if StreamBridge can't read SprigCast's connection file.
- Fixed: the Discord screenshot page and its messages now say that SprigCast can take the picture too, saved in the first folder like OBS.
- Fixed: anything the Wizard hides now really stays hidden, so a row meant for one app can't show for another.
- Changed: Streamer Punishments, Face Filters and Reward Timers start empty, so a new setup is a blank canvas. Each list has an **Add examples** button that fills in a few ideas (Blackout, Pixelate and Barrel roll; Pushups and Squats; the BeanBoozled beans; two lenses; two timers) to change or delete. Settings you already saved are never touched.
- Translated: the SprigCast, Meld Studio and Streamlabs Desktop setup notes, the new connection messages, and about 25 more labels that were still in English, in all nine Wizard languages.

## [4.1.114] - 2026-11-17

- Changed: StreamBridge licences now come from Polar instead of Lemon Squeezy, which stops taking payments on March 31, 2027. Paste a Polar licence key into the Licence card to activate it; one key works on two PCs. Nothing is locked before 5.0. A test licence saved from Lemon Squeezy during the beta is set aside.
- Changed: Get a licence on the Licence card opens the Polar checkout with all three plans, and Manage my licence opens the SlothBloom customer portal on Polar.

## [4.1.113] - 2026-11-17

- Fixed: StreamBridge now finds SprigCast on its real port even when it can't read SprigCast's connection file. Picking SprigCast under Scene connections fills in the address SprigCast answers on (for example ws://127.0.0.1:4456/sprigcast), and saving or pairing tries 4455, 4456 and 4457 before giving up.
- Fixed: SprigCast's connection file is read even when it was saved with a byte-order mark, and from the Slothbloom and Local AppData folders too.
- Changed: when SprigCast doesn't answer, the message says so in plain words and where to check, instead of "connect ECONNREFUSED".
- New text is translated into the nine Wizard languages.

## [4.1.112] - 2026-11-16

- Fixed: the Scene connections form now follows the app you pick. The name example, the password hint and the address change with the app, and switching app clears a password you typed for the last one.
- Changed: for SprigCast the form hides the password box and asks only for the pairing code, since StreamBridge never needs SprigCast's password. A password typed earlier is ignored when pairing.
- Fixed: a SprigCast connection is saved with the address SprigCast really uses (for example ws://127.0.0.1:4456/sprigcast when OBS is open), so the saved list shows the right port. After saving, the form stays on the same app.
- Fixed: the pairing code can be typed the way SprigCast shows it, with a space (262 275).
- New text is translated into the nine Wizard languages.

## [4.1.111] - 2026-11-16

- Added: pair StreamBridge with SprigCast instead of typing its password. Under Scene connections, pick SprigCast and type the 6-digit code from SprigCast's Settings › Connections › Pair a device. StreamBridge saves the pairing key protected on this PC and never asks for SprigCast's password. If SprigCast forgets the pairing, the message says how to pair again.
- Added: StreamBridge finds SprigCast's port by itself from SprigCast's connection file, so it keeps working when SprigCast moves to 4456 because OBS is open. A file left behind after a crash is ignored.
- Added: Streamer Punishments blackout works in SprigCast without the Hide it plugin. Set it up for me adds a black Color Correction filter to the source, and the effect turns it on for its seconds, then off again.
- Added: overlays show "Seen in SprigCast" on the Overlays page, like they do in OBS.
- Changed: Add all and starter blooms use the canvas sizes SprigCast reports and stretch full-screen overlays to fill each canvas (needs SprigCast 0.2.0; older SprigCast keeps working as before).
- New text is translated into the nine Wizard languages.

## [4.1.110] - 2026-11-16

- Added: Add all, Make starter scenes, Remove starter scenes and Save power on the Overlays page now work in SprigCast too. They make SprigCast blooms with Web page sources, placed the same way as in OBS, and never change a source or bloom you already have. The buttons and messages talk about blooms when SprigCast is your app.
- Added: Snap and Discord screenshots can picture one source (such as your camera) or one bloom in SprigCast, not just the screen on air. Snap is now marked as working fully in SprigCast. An older SprigCast that can only picture the whole screen gets a clear "update SprigCast" message instead of a wrong picture.
- Changed: the scene and source pickers for Snap and Discord screenshots list SprigCast's blooms and sources when OBS isn't connected.
- Changed: the SprigCast effects check says "Add the plugin" for a store plugin that isn't added yet, now that SprigCast lists every store plugin.
- Changed: the launcher starts SprigCast.exe when SprigCast has it (newer versions), so it shows as SprigCast in Task Manager. Picking pythonw.exe still works.
- Changed: Streamer Punishments, Prize Wheel and Stream Labels descriptions no longer say OBS only.
- All new text is translated into the nine Wizard languages.

## [4.1.109] - 2026-11-16

- Changed: one streaming app choice for the whole Wizard. The app picked under Extensions and the Streaming app on the Overlays and widgets pages are now the same setting, so changing one changes the other.
- Changed: the Overlays, Stream widgets, Chat overlay, Alerts and Live captions pages use your app's words too (for example "browser layer" in Meld, "web page source" in SprigCast). Sentences that compare apps stay as written. "Not seen in OBS yet" only shows when you use OBS, since only OBS reports the overlays it loads.
- Changed: app wording now works in all nine Wizard languages, not just English, and the streaming-app picker, the Check panel, its how-tos and its results are translated.
- Changed: Raid Scout, Random Clip Player and Face Filters show the setup step for your app (for example Keep running when hidden in SprigCast, or Shutdown source when not visible in Streamlabs) instead of the OBS one.
- Fixed: the translated setup steps added in 4.1.108 now appear in the Wizard (they were saved but not built into the language files).

## [4.1.108] - 2026-11-16

- Added: extension setup follows your streaming app. Pick OBS Studio, SprigCast, Meld Studio or Streamlabs Desktop at the top of Extensions and every extension's steps, box names and help talk about that app: steps that only apply to another app are hidden, "OBS, Meld, or Streamlabs" becomes your app's name, a browser source is a browser layer in Meld and a web page source in SprigCast, and OBS-only tips (like Shutdown source when not visible) become the matching setting in your app.
- Added: Streamer Punishments checks each screen effect in your app. Press Check to see Ready, Needs setup, or Not available (for example Barrel roll in Meld) for every effect, with how to make each one in your app (a Meld effect on a layer, SprigCast's Hide it and Barrel Roll plugins, OBS and Streamlabs filters). In OBS and Streamlabs, Set it up for me adds the Blackout filter to the source for you. The effect boxes are named for your app too (Meld layer and Meld effect, SprigCast source, Streamlabs filter).
- Changed: Snap, Raid Scout, Live Beacon and Scene Actions show the setup steps for your app only. In SprigCast, Raid Scout ends the stream by itself, and Streamer.bot triggers use SprigCast's OBS door.

## [4.1.107] - 2026-11-16

- Added: "Your streaming app" at the top of Extensions. Pick OBS Studio, SprigCast, Meld Studio or Streamlabs Desktop (or let StreamBridge pick the one that is connected). Extensions that change your scenes or screen now work through that app, and switching apps needs no other change.
- Added: Streamer Punishments works in all four apps. Blackout and pixelate are a filter in OBS and Streamlabs, an effect on a layer in Meld, and SprigCast's own Hide it effects. Barrel roll is the Move filter in OBS, SprigCast's Barrel Roll plugin, and a full turn of the source in Streamlabs. Meld can't rotate a layer, so there a barrel roll needs a Meld effect that spins. The safe scene for exercises switches in every app. OBS keeps using its Streamer.bot actions.
- Added: Stream Break & End Guard and Raid Scout have a new "Same as my streaming app" choice (now the default for new setups). It switches scenes and ends the stream through StreamBridge's own connection to your app, so no Streamer.bot helper or Stop Streaming action is needed. Your saved choice is kept.
- Added: extensions show "Partly in" or "Not in" your app, and ones that can't work in it are hidden unless you tick Show every extension. Today that is Snap (OBS, and the screen on air in SprigCast) and the Meld barrel roll.
- Added: StreamBridge can turn Streamlabs Desktop filters on and off and switch its scenes directly, like Streamer.bot does.
- Changed: Snap takes the picture of the screen on air in SprigCast too; a single source still needs OBS.
- For extension makers: a new broadcast.control permission gives context.broadcast (app, switchScene, setFilter, spinSource, stopStreaming, runEffect) for the creator's streaming app.

## [4.1.106] - 2026-11-16

- Added: SprigCast support. Add SprigCast under Setup Wizard > Scene connections (Find apps finds it on port 4455 or 4456). StreamBridge talks to SprigCast through SprigCast's own API (the address ending in /sprigcast), never its OBS-compatible door, and it reads your blooms as scenes, so scene lists, scene-based automations, live and recording state, screenshots (Snap, Discord screenshots) and Save power all work with SprigCast. Turn the API on in SprigCast under Settings > Connections and copy its password into the connection.
- Added: SprigCast in the programs that open with one button. Pick pythonw.exe in SprigCast's python folder; StreamBridge starts SprigCast with it and only counts that Python as SprigCast.
- Changed: Add overlays explains how to add them by hand in SprigCast (+ > Web page), since SprigCast can't create sources for other apps yet.

## [4.1.105] - 2026-11-15

- Added: Snap (Pro), an instant photo on stream. A reward, an alert such as a raid, `!snap` from you or a moderator, or Take a snap in the Control Panel drops a village camera onto your stream. The flash fires, OBS takes the picture of the source you pick (usually your camera), and the photo prints out of the camera with the viewer's message written along the bottom. Every snap is saved in your folder named with the date, time and viewer, and can be posted to one of your Discord webhooks. One snap plays at a time, with cooldowns, a short queue, scenes where the camera stays away, and rewards given back when no snap is taken. Set it up in Setup Wizard > Extensions > Snap.

## [4.1.104] - 2026-11-14

- Added: The Control Panel on your phone card shows a QR code for the address, so you can scan it with the phone camera instead of typing it.

## [4.1.103] - 2026-11-14

- Fixed: The Control Panel on a phone stayed on the Unlock screen and its button did nothing. Phones open it over plain http, where the browser leaves out a feature the page needed at start-up, so none of its scripts ran. It now works without it.
- Changed: The phone card's tips now say what to do when Chrome on Android shows ERR_TOO_MANY_RETRIES: open the address in Samsung Internet or Firefox, which reach the PC normally.

## [4.1.102] - 2026-11-14

- Fixed: On the Control Panel on your phone card, the address and the pairing code now sit on their own lines in boxes, instead of running into the text around them.
- Changed: The phone card says home network instead of Wi-Fi, since the PC can be on a cable. It now says when a phone last reached the PC (so you can tell whether the phone gets through at all), and it has tips for when the phone says the site can't be reached: type http://, turn off mobile data, avoid guest Wi-Fi, and turn off client isolation on the router.
- Added: When Windows Firewall is blocking phones, the card shows an Allow phones through Windows Firewall button. It opens only the phone port, only to your home network, after you choose Yes on the Windows prompt.

## [4.1.101] - 2026-11-14

- Added: Control Panel on your phone. Turn it on under Start here, press Pair a phone, then open the address it shows on a phone on the same Wi-Fi and type the 6-digit code. The phone gets the Control Panel only (never the Setup Wizard or your password), works only from your home network, and can be added to the home screen like an app. It is off by default, and Remove this phone stops a phone at once. Windows may ask once whether StreamBridge can use private networks: allow it.

## [4.1.100] - 2026-11-13

- Added: Under Bridge updates, with Install updates by themselves turned on, StreamBridge says when an update is ready and waiting for your stream to end, and when the last automatic update happened.
- Added: What's new links to the full release notes for the version you just installed.
- Added: A Performance setting for the Emote Wall (Low, Normal, High). Low keeps fewer emotes on screen and turns off animated GIF emotes, for weaker PCs.
- Added: Help on the Licence card for moving to a new PC, and a Manage my licence link to the store's customer page, where you can find a lost key or change or cancel your plan.

## [4.1.99] - 2026-11-13

- Changed: Make starter scenes lays the overlays out properly instead of stacking them in the top-left corner: chat on the right, alerts and full-screen overlays filling the canvas, labels and goal bars along the edges, the countdown and clip player in the middle. It scales to your canvas size, and it shows the full list of what it will make before it starts.
- Added: Remove starter scenes, which takes the four StreamBridge starter scenes out of OBS again. Your own scenes, and overlays they also show, are never touched.
- Added: Keep them running again, next to Save power in OBS, undoes Save power. Both buttons now name the overlays they changed.
- Added: Stream rehearsal on Start here. One click plays a test follow, sub, raid, cheer, Super Chat and gift on the alerts overlay, a burst on the Emote Wall, then a safe preview on every overlay extension, a few seconds apart, so you can check OBS before going live. Nothing is sent to chat or your platforms, and it refuses while you are live.
- Changed: Start all streaming tools shows each app as it starts (Streamer.bot, StreamBridge, OBS and any extra apps you turned on in the launcher), with a tick or the reason it failed.
- Added: Each overlay on the Overlays page says when OBS last showed it ("Seen in OBS 5 minutes ago"), so a missing or broken source is easy to spot.
- Added: Last stream lists any overlay that was on screen in OBS and disconnected for more than a minute during the stream.
- Changed: When the tray restarts StreamBridge by itself, its notice says what time it happened, the restart is recorded, and Start here mentions it for a day.

## [4.1.98] - 2026-11-13

- Added: Make starter scenes on the Overlays page. One click makes four ready-made OBS scenes (StreamBridge Starting Soon, Live, Be Right Back and Ending), each holding the overlays that suit it from the extensions you have turned on. Overlays that are already in OBS are shared into the new scenes, not copied, so their settings stay in one place. Your own scenes are never changed, and it refuses while you are live.
- Added: A Start all streaming tools button on Start here, next to Ready to go live?, so Streamer.bot, StreamBridge and your broadcast app start with one click from the first page.

## [4.1.97] - 2026-11-13

- Added: A Save power in OBS button on the Overlays page. It turns on OBS's "Shutdown source when not visible" for the StreamBridge overlays that only show a standing picture (Local Clock, Chat First, First Five, Fan Crown, Roll Call, Viewer Spotlight). Alerts, chat, captions, the Emote Wall, countdowns, timers, clips and games keep running. It refuses while you are live.
- Changed: Clips use far less memory. A clip is written to disk while it downloads instead of being held in memory, two requests for the same clip share one download, and the clip player's video requests are streamed from disk piece by piece instead of reading the whole clip each time.
- Changed: The tray icon hands unused memory back to Windows every ten minutes, so it no longer slowly grows during a long session.
- Added: What's new. The first time you open the Wizard after an update, it lists what changed in that version. It shows once per version, never on a fresh install and never while you are live.
- Changed: The overlay checklist ticks itself. Any overlay that OBS has loaded in the last 30 days counts as added, so Test & finish no longer shows "0 of 39 sources checked" when your sources are already in place. You can still tick the rest by hand.
- Added: An optional switch under Bridge updates: Install updates by themselves when I'm not live. Off by default. When on, a verified new version installs by itself once nothing has been live for 20 minutes and OBS is neither streaming nor recording.

## [4.1.96] - 2026-11-13

- Fixed: Test & finish no longer warns that an overlay has no browser source when OBS has only shut that source down while its scene is hidden. An overlay that connected in the last 30 days counts as set up.

## [4.1.95] - 2026-11-13

- Changed: Reward Timers redraw half as often and only re-measure their panel when a timer starts or ends, with the bar still sliding smoothly.
- Changed: Goal Bars show each goal's percentage, a row of coloured dots with each platform's share when more than one platform helped, and a soft glow once a goal is reached.

## [4.1.94] - 2026-11-13

- Changed: Every extension is lighter during a stream. StreamBridge now remembers each extension's saved data instead of opening and re-checking its file on every chat message, and it skips saves that change nothing. Reading that data is about four times faster and an unchanged save about twice as fast.
- Fixed: Emote Wall effects (rain, fireworks, explosion) no longer show coloured sample faces on stream. They use the emotes chat sent, which are now remembered when OBS or StreamBridge restarts, and otherwise your channel's own emotes. If no real emote is known yet the effect is skipped. The sample faces remain only in the Wizard preview and its test buttons.
- Changed: Plain message cards on stream (Magic 8-Ball, Raid Scout suggestions, Category Pilot, Voice Relay and similar) have an accent edge, a soft sheen, a gentle slide-in, and no empty gap when there is only a title.
- Changed: Chat emote lists refresh once an hour instead of every half hour.
- Changed: The log writes about half as many lines for each event and extension action.
- Changed: Countdown and subathon timer overlays only redraw when the shown second changes.

## [4.1.93] - 2026-11-13

- Added: The licence card lets you pick which two platforms stay connected on the free plan. The choice applies the next time StreamBridge starts, so nothing changes during a stream. Free plan limits stay switched off during the beta.

## [4.1.92] - 2026-11-13

- Fixed: More of the Wizard now follows your language: the unlock help, step headings such as "2. Choose when it runs", the trigger notes on the Streamer.bot import page, and status lines that contain numbers (119 more texts in all eight languages).

## [4.1.91] - 2026-11-13

- Added: The licence card now explains what the free plan leaves off and when a new or ended Pro licence takes effect (the plan is read once when StreamBridge starts, so nothing switches off mid-stream). The free plan limits stay switched off during the beta.
- Changed: Extension source, update and revocation links now point at the public releases page.
- Changed: The download no longer includes source maps or type files, which makes it a little smaller.

## [4.1.90] - 2026-11-13

- Added: The Licence card now has a **Get a licence** button that opens the StreamBridge Pro checkout, plus links to the terms and the privacy notice.
- Changed: StreamBridge now accepts only licence keys for StreamBridge Pro from the SlothBloom store. Keys from any other store are refused. Everything stays free during the beta; a licence still turns nothing on or off.

## [4.1.89] - 2026-11-13

- Added: Control Panel tabs of Pro extensions now carry the same small "Pro" label as in the Wizard. Nothing is locked during the beta.

## [4.1.88] - 2026-11-13

- Added: The Wizard now shows a small "Pro" label on the extensions that will be part of StreamBridge Pro after the beta, and the licence card says what Pro will cover (a third platform and the Pro extensions). Nothing is locked: every feature keeps working for everyone during the beta.
- Added: The free and Pro list lives in one place in the app (`bridge/services/licence-plan.ts`), with the rules for later: two platforms on the free plan, safety and accessibility extensions always free, and no change in the middle of a stream.

## [4.1.87] - 2026-11-12

- Added: in other languages, the setup guide sentences on the extension cards that contain bold names, commands or links (for example the YouTube key steps for Village Jukebox and the Xbox and PlayStation sign-in steps for Category Pilot) are now translated in all eight languages, about 160 pieces of text per language. Action names, commands and product names stay in English so they match Streamer.bot.


## [4.1.86] - 2026-11-12

- Added: in other languages, messages that include a changing value are now translated in all eight languages. That covers counts ("3 viewers updated"), names ("Settings saved for Chat Guard"), times ("5 min ago"), confirmation questions and most error messages, about 340 texts per language.
- Fixed: translated texts with an optional ending (for example "Download & prepare" with or without a file size) now match in both forms.
- Changed: very short translated patterns such as "Add …" only apply to a short name or number, so they can no longer change the start of an English sentence that has no translation yet.

## [4.1.85] - 2026-11-12

- Added: about 470 status messages, confirmation questions and small labels in the Wizard and on the extension cards (for example "Restart StreamBridge to apply saved settings.", copy and save messages, position names and overlay appearance labels) are now translated into Spanish, German, French, Italian, Brazilian Portuguese, Japanese, Korean and Simplified Chinese.

## [4.1.84] - 2026-11-12

- Added: the labels, buttons and explanations on the extension cards (setup summaries, the moderation dashboard, quote library, jukebox controls, follower history, action approvals and overlay previews) are now translated into Spanish, German, French, Italian, Brazilian Portuguese, Japanese, Korean and Simplified Chinese. That is about 500 more pieces of text per language.

## [4.1.83] - 2026-11-12

- Added: the setup steps, removal steps and health check descriptions of every extension (the "Before you begin" guide) are now translated into Spanish, German, French, Italian, Brazilian Portuguese, Japanese, Korean and Simplified Chinese. That is about 295 more pieces of text per language.
- Changed: each release page now lists what is new, changed and fixed, taken from this changelog, instead of only the version number.

## [4.1.82] - 2026-11-12

- Changed: when StreamBridge takes too long to shut down, the log now names the part that was still running, and any extension that needs more than half a second to stop. This is to find what slows down restarts and updates.

## [4.1.81] - 2026-11-12

- Added: the text inside every extension's settings page (section names, explanations, notes and hints) is now translated into Spanish, German, French, Italian, Brazilian Portuguese, Japanese, Korean and Simplified Chinese. Before, most of it stayed in English.
- Added: translations for the remaining English text on the Wizard pages, such as the theme switch, widget previews and the Add all to OBS explanation.
- Changed: during an internet outage the log now notes once that the public command list could not be updated and once when it works again, instead of a warning on every attempt.
- Changed: when a message from a Streamer.bot extension is rejected, the log now names the extension and the event.

## [4.1.80] - 2026-11-11

- Added: the tray now starts StreamBridge again when it stops unexpectedly, such as after a crash or when its process is ended from outside. It waits half a minute, tries at most once every 15 minutes, and never brings back a StreamBridge you stopped with Stop Bridge.
- Added: a Start with Windows switch on Start here. When you turn it on, the tray icon opens and StreamBridge starts each time you sign in to Windows. It is off until you turn it on.
- Fixed: the guide links in the Wizard (platform guides and the quick start) now open from the public releases page, and the Known limits guide lists the nine Wizard languages instead of saying English only.

## [4.1.79] - 2026-11-11

- On the SlothBloom app pages, overlay links for OBS and overlay previews now point at StreamBridge on your PC. Before, the copied links used the website's address, which OBS cannot open, and previews did not play.

## [4.1.78] - 2026-11-11

- Changed: StreamBridge only accepts its pages from **app.slothbloom.com**, not from the main SlothBloom site, so nothing else on the main site can ever use a paired browser. The Control Panel, Stream info and Jukebox remote pop-outs on the site now use the same pairing.

- Added: **StreamBridge pages for app.slothbloom.com.** `npm run site:bundle` builds the Wizard and its pop-outs as plain files for the site. Opened from there, they ask for the pairing code from this PC and then work with StreamBridge here. `/health` now also reports the version so the site can warn when the PC is on a different one.

- Added: **Open StreamBridge from slothbloom.com (groundwork).** A new card on Start here lets the SlothBloom pages connect to StreamBridge on this PC. You pair a browser with a short code shown on this PC and can unpair it any time. Your password never leaves the PC. It is off until you turn it on, and the pages on the site arrive in a later update.

## [4.1.77] - 2026-11-10

- Fixed: **Update check could miss a new version.** When the SlothBloom download page was behind, StreamBridge trusted it and reported no update. It now asks GitHub whenever the page does not offer something newer than what is installed.
- Added: **Stream info and Jukebox remote in your language.** Both pop-out windows now follow the Wizard's language in all 8 languages.

## [4.1.76] - 2026-11-10

- Changed: **Streamer.bot 1.1.0-alpha.17 is on the compatibility list.** It passed the trigger self-check against alpha.15 on a live setup with nothing to repair.
- Added: **Scene lights.** Scene connections has a new optional card that sets your Elgato Key Lights when the scene changes. Find my lights looks for them on your home network, or add one by its address, test it, then choose on or off, brightness and warmth for each scene. It is off until you turn it on, and scenes you do not list leave the lights alone.
- Added: **Last stream recap on Start here.** After each stream the Wizard shows how long it ran, chat messages and chatters per platform, follows, subs, gifts and tips, raids, rewards, commands, ad breaks, and any warnings or errors logged while live. During a stream it shows the numbers so far. Only counts are kept: no names and no message text.
- Added: **Extension descriptions in your language.** The description under each extension, and the last Control Panel tab summaries, are now translated into all 8 languages. The Prize Wheel's starter choices follow the language too.
- Changed: **Quieter start when OBS opens later.** If your streaming app is not open when StreamBridge starts, that is no longer logged as a warning. StreamBridge reads the scenes by itself once the app opens.
- Changed: **Tray reminders about test tracking stay off** unless Show developer pages is ticked in Troubleshooting.
- Fixed: **Old half-written save files are cleared at start.** A save that was interrupted could leave a `.tmp` file behind for good. StreamBridge now removes those when they are more than an hour old.
- Changed: the startup history file is kept smaller, and the browser tests remove their temporary folder when they finish.

## [4.1.75] - 2026-11-10

- Added: **TikTok live status.** When TikTok LIVE Studio confirms it went live or ended with OBS, StreamBridge now reports TikTok as online or offline like the other platforms, so extensions that wait for a platform to go live count TikTok too. This needs the TikTok LIVE Studio automation turned on.
- Changed: the log records how long each extension action and chat message took to hand over, which makes slow spots easier to find.
## [4.1.74] - 2026-11-10

- Fixed: **Random Clip Player** stops when the broadcast ends, even if OBS stays on a clip scene such as Ending Soon. It no longer keeps fetching a clip every few seconds after you go offline. Clips start again on the next change to a clip scene.
- Changed: while Streamer.bot is closed the log has one "Streamer.bot is not running" warning and quiet reminders, instead of a connection error warning again and again.
## [4.1.73] - 2026-11-10

- Changed: an old Streamer.bot compatibility file that no longer verifies is removed once instead of warning on every start, and the log says when no compatibility update is published yet.
- Changed: new **moss and ember** colours for the Setup Wizard, Control Panel, Stream info and Jukebox remote. Dark is a warm charcoal with moss green buttons, a lime highlight and ember orange labels; light is warm parchment with the same colours. Ready and success badges are moss green instead of mint. Overlays on stream keep their own theme.
## [4.1.72] - 2026-11-10

- Added: **Ready to go live?** on Start here. One button runs the same read-only check as Stream checks and shows how many checks passed, with a link to the details.
- Added: groundwork for selling licences. The Licence card can show a **Get a licence** button and licence terms and privacy links once the store is live; they stay hidden until then. Store setup steps are in docs/release/licence-store-setup.md.
- Fixed: Streamer.bot compatibility updates are accepted again. StreamBridge now trusts the compatibility list published by the new releases repository, so it no longer falls back to the built-in list with a warning on every start.
- Changed: developer pages (Release Readiness, Live acceptance and Ownership) are hidden from the sidebar. Turn them on in **Troubleshooting > Developer pages**. The Wizard no longer reopens on one of them once they are hidden.
- Changed: refreshing scenes while Streamer.bot is closed now says to start Streamer.bot first instead of logging an error.
- Changed: a long Facebook outage logs one warning instead of one every poll, and a note when it reconnects.
- Changed: **Start here** is tidier. The status tiles no longer repeat the connection check, the Licence card uses the full width, and settings backups and extension data now sit together under one **Keep a copy of everything** heading.
- Changed: the **Control Panel**, Stream info and Jukebox remote follow the Wizard's light or dark choice instead of always being dark.
- Changed: the Control Panel lists running extensions under their group (Broadcast Director, Community Play and so on).
- Changed: neutral status badges are grey, so green (ready) and amber (needs attention) stand out.
- Changed: more of the Wizard follows your language. Dates, times and numbers use your language's format, platform features show friendly names (Bits, Gifted subs, Live status), and about 110 more sentences and labels are translated.

## [4.1.71] - 2026-11-10

- Added: Village Jukebox setup now walks you through getting a free YouTube key, with direct links to the right Google Cloud pages, and a **Test the YouTube key** button. It looks up one public video through Streamer.bot and tells you whether the key works, without queueing or playing anything.
- Added: a **Licence** card on Start here. Paste the key from your purchase email and press Activate; the key is stored encrypted on this PC and only its last four characters are shown. It is checked once a day and keeps working through two weeks offline. Remove from this PC frees the activation for another PC. StreamBridge stays free during the beta, so nothing turns off without a licence.
- Added: **Add all to OBS** on the Overlays page. One click puts every overlay and widget into a new OBS scene called StreamBridge Overlays, at the right sizes, through your saved OBS connection. Add that scene to your own scenes and move things where you want them. Existing scenes and sources are never changed, and running it again only adds what is missing.
- Added: **Rewards bought with points** in Viewer Foundation. Each row is a reward with a chat command, a points price, an optional Twitch reward ID and a cooldown. Viewers on Twitch, YouTube, Kick, TikTok and Facebook type the command and pay with points instead of channel points. With the Twitch reward ID filled in, Hydration, Reward Timers, Face Filters, Magic 8-Ball, Streamer Punishments, Critter Catch, Stream Bingo and other reward extensions react as if the Twitch reward was redeemed. Critter Catch gives the points back when nothing can be caught. Extensions that already have their own points commands (Jukebox, Viewer Spotlight, Free Game Check, Village Voice, Roll Call) and Twitch-only rewards (Fan Crown, First Five, Raid Scout suggestions) ignore these purchases.
- Changed: the Advanced pages (Blockers, Ownership, Troubleshooting, Release Readiness) are folded under **Advanced** in the sidebar until you open it. The Wizard remembers your choice.

## [4.1.69] - 2026-11-10

- Changed: the **Control Panel** now follows your language. Tab descriptions, buttons, setting names, list columns, confirmation boxes and messages are translated into all eight languages, about 190 lines. Extension names stay as they are.
- Changed: more overlay text on stream follows your language: timer and Stream Bingo badges (LIVE, PREVIEW, RUNNING, COMPLETE, LOCKED), "playing", poll and prediction titles, fallback names such as Viewer and Someone, and the sub details on alerts (months, streak, gifted by).

## [4.1.68] - 2026-11-09

- Changed: updates now come from the new public releases page, THSV-StreamBridge-Releases. Older installs still find updates at the old address, so nothing breaks. Bug reports and feedback now open there too.
- Changed: **every extension setting is now translated** into Spanish, German, French, Italian, Portuguese (Brazil), Japanese, Korean and Chinese (Simplified). That is about 1,770 setting names and help lines that were still English when another language was picked. Extension names, chat commands and {placeholders} stay as they are.
- Changed: more starting text now follows your language when you have not changed it yet: the 20 trivia questions and 20 word-scramble words in Chat Play Pack, the Live Beacon welcome posts for Discord, Creator Controls stream titles, First Five reward names, Discord archive titles, the Free Game thread name, Reward Timers labels and Streamer Punishments exercises. Text you already saved is never replaced.
- Changed: THSV StreamBridge is now **proprietary software**. You can still use it for free on your own streams, but copying, redistributing, modifying or reselling it is no longer allowed. Versions up to 4.1.67 keep their MIT licence.

## [4.1.67] - 2026-11-09

- Fixed: Facebook timed comments **no longer fail when your Page isn't live**. Between streams they are skipped quietly instead of being logged as errors and retried. When more than one Page broadcast is live (for example a forgotten test stream), the comment goes to the broadcast whose chat StreamBridge is reading, or the newest one, instead of failing.
- Changed: the Facebook timed-comment output only receives timed messages. Before, every add-on event was queued for it and then thrown away, which cluttered the logs and the delivery queue.
- Fixed: the one-button launcher now **starts Speaker.bot before Streamer.bot**, so Streamer.bot's Speaker.bot connection works on its first try instead of failing again and again at startup.
- Developer: each test run now uses its own temp folder and deletes it afterwards. Tests had left tens of thousands of `thsv-*` folders in the Windows temp folder.

## [4.1.66] - 2026-11-09

- Changed: Raid Scout now **tells viewers why a raid suggestion was refused** instead of only saying it "could not be added": they already suggested a raid this stream, the channel is already on tonight's list, the list is full, or no Twitch channel name was found in what they typed. Blocked channels still get the generic reply so your blocked list stays private. All suggestion replies now live in their own **Viewer suggestion replies** step and can be edited there.

## [4.1.65] - 2026-11-09

- Changed: Critter Catch now **tells viewers why a throw did nothing**, in the chat they typed in: the critter is visiting another platform's chat, they already caught it this visit, they threw again before the cooldown ended, or `!catch info` named a critter that does not exist. The "no critter right now" reply now goes to each viewer instead of once for the whole chat. Each reply is sent at most once every 30 seconds per viewer, and the new lines can be edited under Command replies.

## [4.1.64] - 2026-11-08

- Added: Critter Catch visits **one active platform at a time**. A critter goes to a platform whose chat has at least 2 real chatters in the last 10 minutes (you, your own accounts, the streamer role and bots never count). When several chats are active they take turns, oldest visit first, spaced by the usual wait. Only that platform's chat is told and can throw, the plate shows the platform, a Twitch reward redeemed for another platform's critter is refunded, and the Twitch Jar rewards only switch on for Twitch visits. Only Twitch reward IDs are switched; Kick IDs are matched but left on. **Every platform at once** keeps the old shared visit.
- Changed: the Critter Catch reward guide now says to create the Twitch Jar rewards in Streamer.bot. Twitch only lets the app that created a reward switch it on and off or refund it, so rewards made on the Twitch dashboard still throw Jars but stay on.

## [4.1.63] - 2026-11-08

- Added: Critter Catch **channel point rewards by ID**. Each reward row takes a Twitch or Kick reward ID (or its name). The Twitch Jar rewards switch on only while a critter is on screen and off when it is caught or leaves, and a Twitch redemption that cannot throw is refunded (needs the Reward Administration action). Kick rewards stay on because Streamer.bot has no Kick reward controls yet. Suggested reward names, costs and prompts are in the settings and the guide.
- Added: **Where typing !catch throws a Jar**. Untick Twitch and Kick to use only channel point rewards there while YouTube, TikTok and Facebook type `!catch`. Those platforms get their own visit message, typing `!catch` there explains the reward, and the on-screen hint reads "Type !catch or redeem a Jar".
- Added: after the first catch of each visit, chat gets the critter's **Field Journal entry** with its number (for example "Field Journal #106 Pinecub: ..."), as its own line so YouTube and TikTok do not cut it short.
- Added: add-ons can ask for the new **rewards.administer** permission to turn their own Twitch rewards on and off and refund redemptions through Reward Administration.

## [4.1.62] - 2026-11-08

- Added: **Critter Catch**, a new extension (off until you turn it on). Wild Village Critters (151 hand-drawn critters, or your own list) wander onto your stream now and then. Viewers on any platform throw a Jar with `!catch`, a Honey Jar with `!catch honey` or a Moon Jar with `!catch moon`, paid with Viewer Foundation points, a channel point reward or a TikTok gift. Every throw is rolled fairly and animated on stream: the Jar flies, wobbles, and the critter is caught, breaks free or runs off. Each Keeper who catches it adds it to their own **Field Journal** (`!catch journal`, `!catch info Pinecub`), with a rare shiny **Glimmer** about once in 200 visits. Monthly top Keepers (`!catch top`) reset on the 1st with a hall of fame. Moderators can send or end a visit with `!catch spawn` and `!catch end`, and the Control Panel has buttons to send a critter now. Catch rates, visit times, costs and every chat line can be changed.

## [4.1.61] - 2026-11-08

- Fixed: the **Viewer Foundation points list** showed scrambled IDs (such as `tiktok-a885e0c5…`) and "Unknown platform" for viewers saved before names were kept. Every row now shows its platform. Older viewers get their name back from names other extensions saved for them (Lurk Tracker, Stream Bingo and others) when the list opens, or the next time they chat or do anything on stream. Until then the row reads "TikTok viewer (name shows after their next chat)".
- Changed: the points list is simpler. Each viewer has one **Change** button that opens Add, Take away, Set to and Delete viewer, and the sections have plain names ("Find a viewer", "Save or load a points file").
- Added: **Delete everyone** at the bottom of the points list clears every viewer and their points at once, after a confirmation. A daily backup under Your data can bring the list back.

## [4.1.60] - 2026-11-08

- Added: a **Vertical (1080 × 1920)** layout for the Emote & GIF wall, for your vertical canvas. Emotes that travel top to bottom (and emote rain) keep the same speed on the tall screen, and fireworks use more of its height.
- Changed: the Emote Wall now asks each emote site for its largest copy of an emote (falling back to the original if there is none), so big emotes stay sharp. Emotes are still sized by height only, so they always keep their own shape.

## [4.1.59] - 2026-11-08

- Fixed: the **Viewer Lobby** overlay showed every player run together on one line. It is now a proper panel: the player up next on top, then everyone waiting, each on their own row with a coloured platform badge, in the shared overlay theme. Suggested sizes: 760 x 340, or 410 x 370 for a vertical layout.
- Fixed: **Show exact template** for Goal Bars, Streamer Punishments, Magic 8-Ball and Translate showed a placeholder card instead of the real overlay. Each now previews its real panel with your saved goals, exercises, answers or a two-language caption.
- Fixed: vertical layouts. **Chat First** stacks its spots in a column in a vertical source instead of shrinking to a thin row, **Polls & Predictions** no longer split words in half, the **Punishments** tracker no longer cuts exercise names to one letter, and a **Shoutout** in a short vertical source no longer puts the link on top of the game.
- Changed: suggested vertical sizes for **Subathon Timer** and **Stream Break & End Guard** are now 410 x 180 (the timer card was small in a big empty 410 x 700 box), and **Goal Bars** is 700 x 220 (horizontal) and fills its source.
- Fixed: Village Polls options with long names shorten with "..." instead of pushing the vote count into the next option, and multi-line card text (such as a Magic 8-Ball question and answer) keeps its line break.
- Added: **Control Panel** tabs for the nine extensions that had none: Automated Shoutouts, Chatter Greeting, End Credits, Polls & Predictions, Stream Labels, Translate, Viewer Spotlight, Village Roll Call and Accessibility Captions. Change their look, wording and what they show while you are live; changes apply straight away. Every extension with an overlay now has a tab.
- Changed: colour settings in the Control Panel are colour pickers instead of text boxes.
- Added: overlay headings, badges and empty-state lines now follow your StreamBridge language in all 9 languages (for example PUNISHMENTS and OWED, THE VILLAGE DRAW, Play Lobby, UP NEXT, VOTING OPEN, BINGO!, Sip break!, "42 votes", "Next reminder in 45 min"). Text you set in an extension's settings is never changed.
- Added: translated default chat messages for Clip Courier, Live Beacon, the Prize Wheel's Facebook message, Streamer Punishments' exercise limit messages and Translate's automatic translation line.

## [4.1.58] - 2026-11-08

- Added: Emote Wall **event effects**. Stream moments now set off an **emote explosion**, **emote rain** or **emote fireworks** on the Emote & GIF wall. Pick an effect (or Off or Random) for follows, subs and members, gifted subs, Bits, raids, Super Chats/tips/Kicks, TikTok gifts, channel point rewards and TikTok likes. Bigger raids, Bits and gift bombs throw more emotes, Bits can need a minimum, rewards can be limited to the ones you name, and effects use your own emote image links or the emotes chat used recently. Try each effect in the Wizard preview or send a test to OBS. Effects work even when those events are hidden from chat or their alert is off. Existing Emote Wall sources get the default effects (follows rain, subs/gifts/tips fireworks, Bits/raids explosion) with no change needed.

## [4.1.57] - 2026-11-08

- Added: Stream Bingo extras. A **full card bonus** keeps the card going after the bingo and draws a second winner when every square is marked. **Hype mode** makes a quiet card glow and nudges chat once with how close the nearest bingo is. Viewers can send **square ideas** with `!bingo suggest`, which only reach the card after you press Add in the Control Panel. New **command squares** tick from chat commands such as `!lurk` or a death counter's `!death`. Bingos and a monthly recap can post to a **Discord** channel, and your own **Streamer.bot action** can run after each bingo with the winner's details.

## [4.1.56] - 2026-11-08

- Added: **Stream Bingo**, a new extension (off until you turn it on). One shared bingo card (3 x 3, 4 x 4 or 5 x 5) sits on stream; squares tick by themselves from follows, subs, gifted subs, Bits, TikTok and YouTube gifts, tips, raids, channel point rewards and words chat says, or a moderator marks them with `!bingo mark 7`, the Control Panel or a Stream Deck button. Viewers on any platform type `!bingo` to join, and each bingo (any line, two lines, four corners, an X or a full card) draws one fair winner, posts it in every chat and can add Viewer Foundation points. Wins are counted per month (reset on the 1st in your time zone, with a hall of fame) and all time; viewers check theirs with `!bingo stats` and `!bingo top`. Three square packs (your squares, Gaming, Just Chatting), horizontal and vertical layouts that follow the overlay theme, and chat messages and squares in all nine languages.

## [4.1.55] - 2026-11-08

- Changed: Prize Wheel and Bean Boozled wheel names now run along the middle of their own slice, from the hub out to the rim, and turn with the wheel. Long names shrink or wrap to stay inside their slice, names on the left half are turned so none reads upside down, and names stay clear of the pointer.
- Fixed: wheel slice colours could sit half a slice away from their names, so with 5, 6, 7, 9 or 10 choices (including the 10 Bean Boozled beans) the pointer stopped on a colour edge.

## [4.1.54] - 2026-11-08

- Fixed: Restart Bridge (and other Setup Wizard buttons) could keep loading forever when another Wizard tab was asleep or stuck. A change now waits at most 15 seconds for other tabs, and a request that gets no answer shows a message instead of loading forever.

## [4.1.53] - 2026-11-08

- Fixed: Prize Wheel (and Raid Scout) settings could not be saved ("the form is incomplete") because the layout hides a few settings. Hidden settings now keep their saved value.

## [4.1.52] - 2026-11-07

- Facebook viewers can now use giveaways, quotes, polls, the prize wheel, the viewer lobby, counters, Local Clock and Magic 8-Ball commands, End Credits, Stream Labels, the Subathon timer and Chat Guard, the same as the other platforms.
- Every extension viewers use from chat now has a "Platforms it works on" choice, so you can run it on just one platform (for example only Twitch, or only TikTok).
- If you stream on only some platforms, extension announcements skip the platforms you have not turned on, and platform tick boxes show "not turned on" for them.
- The viewer counter builder now shows live status for each platform: the current count, whether the TikFinity desktop app is connected for TikTok, and whether your Facebook Page is connected.

- Polish for the new screens: the points list buttons say Add, Remove and Set instead of extra + and − buttons; nothing is cut off or squeezed on narrow windows in the points list, quote files and Your data; the restore choices line up and use normal-size tick boxes.
- Control Panel giveaway buttons stay on one line, and platform names show as Twitch, YouTube, Kick and TikTok.

## [4.1.51] - 2026-11-06

- New **Your data** section on Start here: download one backup file with everything your extensions remember (points, quotes, giveaway history, counters and more) plus their settings and your wizard settings, without passwords or tokens. Export a single extension, or restore from a file. You pick what to bring back, a safety backup is saved first, and the restore applies when StreamBridge restarts.
- StreamBridge now saves a copy of all your data every day and keeps the last 14, listed under Your data with Download and Restore buttons.
- Quote Vault: export your quotes as CSV or JSON, and import quotes from a CSV or JSON file (up to 300 at a time, duplicates skipped).
- New **Points list** on the Viewer Foundation page: everyone's name and points, with search, sorting and pages. Add, remove or set points, or delete a viewer, right from the list. Viewer names are now stored with their points.
- Give points to everyone, or to everyone seen in the last 3 hours, in one go.
- Export the points list as CSV or JSON, and import a CSV or JSON file (from StreamBridge, StreamElements, Streamlabs or a spreadsheet) with a preview first and an undo. Imported names that have not chatted yet get their points the first time they chat.
- Optional moderator chat commands: `!addpoints name 50`, `!removepoints name 50` and `!points name`.
- The points list keeps up to 2,000 viewers by default (was 250), up to 3,000.

## [4.1.50] - 2026-11-06

- Giveaways (Village Draw) are easier to run: set one up in three short steps, then run it from the Control Panel, which lists everyone who joined (with a remove button that refunds points), the winners and their claim timers, and past giveaways.
- Giveaways can close entries by themselves after a set time, post a reminder every few minutes and a last call 1 minute before closing, and announce when entries close.
- A drawn winner gets a set time to answer in chat (or with `!claim`). If they do not, you can draw again with one click, or have someone else drawn right away. The overlay shows the claim countdown.
- Up to 10 winners per giveaway, extra luck for subs and VIPs, who can enter (everyone, subs, VIPs, moderators), and skipping recent winners.
- New **End giveaway** button saves the giveaway to the history. New `!winners` and `!tickets max` commands, and `!mytickets` shows your chance.
- Up to 1,000 entrants (was 80).

## [4.1.49] - 2026-11-06

- Startup no longer waits minutes on TikTok LIVE Studio's Windows permission prompt, and leaving it unanswered is a reminder instead of a failed startup.
- Raid Scout's Twitch player no longer logs a keyboard permission error in OBS.


## [4.1.48] - 2026-11-06

- Countdown numbers keep the timer's own font under the overlay theme, so sources cropped tightly around them no longer cut off the digits.


## [4.1.47] - 2026-11-06

- Chat First, Local Clock, Goal Bars, Streamer Punishments, Scoreboard, Polls & Predictions and Closed Captions shrink to fit their browser source instead of being cut off, whichever layout you pick.


## [4.1.46] - 2026-11-06

- All overlays now share one universal theme, with one set of colors and fonts across chat, alerts, captions and every extension overlay. Change it under Overlays > Overlay theme and open overlays update straight away. Turn it off there to go back to each overlay's own colors. Platform colors, wheel slices and the water color stay as they are.
- Overlays and widgets now have separate pages. Widgets stay on screen the whole time they are on: chat, Emote & GIF wall, viewer counter, Chat First, Custom Counter, Goal Bars, Local Clock, Reward Timers, Scoreboard, Stream Labels, Streamer Punishments, Subathon Timer and Village Hydration Station. Everything that pops up when something happens stays on Overlays.
- Spin the Wheel shows only the wheel on a transparent background, with no panel or heading, and the wheel fills its browser source. The winner pops up over the middle of the wheel.


## [4.1.45] - 2026-11-06

- Viewer Spotlight names and stats, such as a long achievement, shrink to fit and wrap onto a second line instead of being cut off with "…".
- The Wizard header has room on both sides, and the language picker shows each language as its country's flag.


## [4.1.44] - 2026-11-06

- Overlay card buttons center their text.
- The Facebook page has a step-by-step setup guide for creating your Meta app and getting your Page ID and token. The Platforms page explains TikTok is powered by TikFinity and Streamer.bot, with setup steps, and the Wizard header links to Streamer.bot.
- When you open the Wizard and a new StreamBridge version is ready, a small pop-up asks if you want to update now or later. Update now downloads, checks and installs it, then StreamBridge restarts and reopens the Wizard. Later hides it until you next open the Wizard, and it never pops up while you are live.
- Viewer Spotlight is now one short card that no longer flips: the viewer's profile picture, name, the platform they redeemed from and their stats all show on one side. The recommended browser source is now 760 × 250 (or 410 × 350 vertical) instead of 640 × 880.


## [4.1.43] - 2026-11-06

- Reward Timers, Chatter Greeting and Village Hydration Station shrink to fit inside their browser source instead of running past its edges, and reward timer bars no longer flicker every quarter second.
- Overlay gallery previews retry if a preview did not load the first time.


## [4.1.42] - 2026-11-06

- Overlays & widgets now shows every overlay as a same-size card in an even grid, with a live preview of how it looks, plus Copy URL, Test and Customize buttons on each card.


## [4.1.41] - 2026-11-05

- Bot accounts (Sery_Bot, names ending in _bot, Nightbot and others, plus the chat overlay ignore list) count as bots everywhere. Their commands are blocked for every feature, and they no longer appear in End Credits or trigger greetings, points, draws, polls, follow and reward alerts, or Chat First.


## [4.1.40] - 2026-11-05

- Chat First skips your own channels on every platform, Streamer.bot connected accounts, and bot accounts such as sery_bot.
- Chat First layout choices now read Horizontal and Vertical.


## [4.1.39] - 2026-11-05

- Overlays and widgets: the streaming app tip is one line.
- Test and finish counts wrong-port overlay links as one item.


## [4.1.38] - 2026-11-05

- Test & finish is simpler: one big status with a count of passed checks, a short list of what to fix (one button each), and passed checks folded by area.
- Reports and history moved into one closed fold. History shows the newest three reports as one-line rows, with older ones under Show older.
- The overlay overlap check and expected OBS sources moved to Overlays & widgets.
- Overlays & widgets is now a three-step setup for every overlay: pick your app, add each overlay, check for overlaps.
- Guided setup has a new Add overlays step, and its Overlays page opens these steps instead of the chat design page.
- Overlay links that point at the wrong port are grouped into one line per port.


## [4.1.37] - 2026-11-05

- Control Panel in nine languages: it follows the language picked in the Wizard. Feature names stay in English.


## [4.1.36] - 2026-11-05

- With another language picked, on-stream text and default chat messages (157 lines) follow that language. Text you changed stays as it is.


## [4.1.35] - 2026-11-05

- Translate, Quote Vault and Viewer Lobby now also answer to translated command names when another language is picked (for example !traducir, !cita and !unirse in Spanish, or !翻訳, !名言 and !参戦 in Japanese). English names keep working, a renamed command keeps only your name, and each message is still handled once.
- No Streamer.bot re-import is needed.


## [4.1.34] - 2026-11-05

- Wizard languages: Korean and Chinese descriptions are finished, and text with numbers or times plus input placeholders now translate too.


## [4.1.33] - 2026-11-05

- Picking a Wizard language while signed in also sets the StreamBridge language, so chat commands and Translate follow it after Save with backup.


## [4.1.32] - 2026-11-05

- Wizard: Facebook has its own page, and a language picker in the Wizard header switches the interface into 8 more languages. English stays the default.


## [4.1.31] - 2026-11-05

- New language setting (in the config file for now, a Wizard picker comes later) with English, Spanish, German, French, Japanese, Portuguese (Brazil), Italian, Chinese (Simplified) and Korean. English stays the default and nothing changes for English setups.
- With another language picked, built-in chat commands also answer to a translated name (for example !moneda next to !coinflip, or !コマンド next to !commands). English names keep working. A command you renamed keeps only your name, and a translated name already in use is left out.
- Translate add-on: with another language picked, its starting values follow that language (the language you speak, chat translated into your language, and English under bilingual captions). Values you already saved stay as they are.


## [4.1.30] - 2026-11-05

- Streamer.bot import: each of the 46 packages now has a one-line description and a short trigger note (trigger names unchanged).
- Chat commands work in any language: the full-width ！ (and full-width letters) used by Japanese, Chinese and Korean keyboards works like !, command names can use letters from any language (!café, !ようこそ, !환영), accents are optional (!cafe reaches !café), and text such as "!!!" or "!lurk," is treated as normal chat. English commands work exactly as before.

- No Streamer.bot re-import is needed.

## [4.1.29] - 2026-11-05

- Wizard: about 220 long explanations across every sidebar page (Setup checklist through Live confidence) are now one short line each, so pages are quicker to read and simpler to translate.

- No Streamer.bot re-import is needed.

## [4.1.28] - 2026-11-04

- Wizard Overview: long sentences replaced with short lines (intro, guided setup, connection check, save controls) so the page is quicker to read and simpler to translate.

- No Streamer.bot re-import is needed.

## [4.1.27] - 2026-11-04

- Wizard unlock card: two clear option tiles (Password protected, No password on this PC) and the recovery key in its own column, with proper spacing. Backup and restore is now three short tiles (Save a copy, Restore from a copy, Go back to an earlier save) with the raw backup text folded away.

- No Streamer.bot re-import is needed.

## [4.1.26] - 2026-11-04

- Wizard Platforms: each platform card now has one clear switch with a plain status line; the receive switch moved under Advanced and the unused Output switch is hidden.

- No Streamer.bot re-import is needed.

## [4.1.25] - 2026-11-04

- Wizard: Start here now reads top to bottom (updates, first-time setup, connection check, Your StreamBridge cards, Backup and restore), and Test & finish lists readiness problems with a count and "Show more" instead of one long paragraph.

- No Streamer.bot re-import is needed.

## [4.1.24] - 2026-11-04

- Reward Timers now run one at a time by default: a timer redeemed while another is running waits in line and starts when the current one ends, so timers never overlap on stream. The viewer gets a chat message saying how many are ahead, and the Control Panel shows the line. Choose Together in the settings to run them side by side as before.

- No Streamer.bot re-import is needed.

## [4.1.23] - 2026-11-04

- Reward Timers now links each timer to its Twitch and Kick reward IDs (copied from Streamer.bot), so renaming a reward no longer breaks its timer. Timers without an ID still fall back to the reward title.

- No Streamer.bot re-import is needed.

## [4.1.22] - 2026-11-04

- New Reward Timers extension: viewers start named countdowns such as Streamer muted 5:00 with a channel point reward, shown on stream with their picture and a bar that empties, with a moderator !timer command and optional start and end messages.
- New Chat First extension: the first person to chat on each platform each stream gets a spot on a small on-stream card (podium, row or column) with how many times they have been first, plus an optional chat message.

- No Streamer.bot re-import is needed.

## [4.1.21] - 2026-11-04

- Chatter Greeting: viewers can type !nogreet to stop their greeting pop-up and !greetme to turn it back on, remembered between streams. Greetings now fit who the viewer is (first time, back again, a regular, or back after a long break) and rotate between versions, with {visits}, {away}, {platform} and {community} placeholders.

- No Streamer.bot re-import is needed.

## [4.1.20] - 2026-11-04

- Viewer Foundation, Community Analytics and other add-ons can now save up to 1 MB of data (was 64 KB), so growing communities no longer hit a silent save failure; the log warns once if an add-on nears the limit.
- The release-readiness cache keeps only what it needs and removes copies left by older versions.
- No Streamer.bot re-import is needed.

## [4.1.19] - 2026-11-03

- Overlays: always-on panels (Local Clock, Goal Bars, Scoreboard, the Streamer Punishments tracker) now appear right away in a newly added or reloaded OBS browser source instead of staying blank until they next change.
- No Streamer.bot re-import is needed.

## [4.1.18] - 2026-11-03

- Smaller installed folder: the clip cache now cleans itself at start-up and every hour (clips older than a day are removed, total cap 150 MB), and each update also removes rollback copies an earlier update could not delete.
- New Local Clock extension: show your local time and date on stream as a text line, a digital clock or a round analog clock, with time zone, 12/24-hour, seconds, date, label, colour, size and background options, a Control Panel tab, and an optional !time chat reply.
- No Streamer.bot re-import is needed.

## [4.1.17] - 2026-11-03

- Raid Scout: the ending sequence no longer stalls before the raid when its saved history grows large (history now keeps only who and when, and the Bridge reads indented state files correctly).
- Streamer Punishments: setup steps say to keep a Move filter shorter than its screen effect, so a barrel roll cannot leave the scene slanted.
- No Streamer.bot re-import is needed.

## [4.1.16] - 2026-11-03

- Village Hydration Station: the card now fades and slides away when a sip break ends instead of cutting off.
- No Streamer.bot re-import is needed.

## [4.1.15] - 2026-11-03

- Village Hydration Station: reminders play a sip-break animation (a glass fills, then two sips through a straw) and can speak "Hydration break! Take a break, it's time to take a sip. You thirsty?" through Speaker.bot. New Spoken reminders and Sip-break animation switches on the Control Panel Hydration tab.
- Shipped in 4.1.14 but missing from its notes: First Five allows one place per viewer across all five rewards (a second claim is refused and refunded); the setup checklist warns about rewards with Skip Queue on; Fan Crown and Viewer Spotlight reply in chat when a redemption is refused.
- No Streamer.bot re-import is needed.

## [4.1.14] - 2026-11-03

- The Setup Checklist no longer asks for Raid Scout's Kick reward ID, or any other setting a feature hides.
- No Streamer.bot re-import is needed.

## [4.1.13] - 2026-11-03

- Raid Scout viewer suggestions are now Twitch only. Kick reward redemptions and the YouTube/TikTok `!raidsuggest` points command are ignored, and their settings are hidden.
- No Streamer.bot re-import is needed.

## [4.1.12] - 2026-11-03

- Added quick controls to the Control Panel's Raid Scout tab for Viewer raid suggestions, the Twitch suggestion reward ID and Suggestions per stream. They apply live, with no Streamer.bot re-import needed.

## [4.1.11] - 2026-11-02

- Control Panel redesign: every tab now works as a controller. A "Now" strip of read-outs with one even pad of main buttons, live lists (queue, owed, entries) folded with a count, quick controls that save the moment they change (switches, − / + steppers, one-tap choices, pills, short text that saves on Enter), and list editors (exercises, effects, beans, wheel choices, trivia, Unscramble words) folded with their own Save and Discard. Each list row shows one equal box per part instead of one long `a | b | c` line, with colour pickers for colours.
- Control Panel: each tab shows only what is worth changing mid-stream, with short labels and the full explanation on hover. Everything else stays in the Setup Wizard.
- Control Panel: the extension list has a search box, folds turned-off extensions away, and scrolls separately from the open tab, so nothing clips or needs a whole-page scroll.
- No Streamer.bot re-import is needed.

## [4.1.10] - 2026-11-02

- Chat overlay: Twitch chat GIFs now play in the chat card instead of showing as `[... GIF by ...]` text (the caption shows if a GIF cannot load). Only GIPHY media links are accepted. The Emote & GIF wall shows chat GIFs too when animated images are on.
- Chat overlay: at most three badges are shown under a name, only the channel's main ones (host, VIP, founder or subscriber, gifter, Bits, hype train and similar), most important first. Global and game-promotion badges are left out so the row no longer clips.
- No Streamer.bot re-import is needed.

## [4.1.9] - 2026-11-02

- New **Control Panel**: one pop-out window with a tab for each of 25 extensions (Streamer Punishments, Prize Wheel, Village Jukebox, Scoreboard, Goal Bars, Village Draw, Polls, Counter, Subathon, Starting Soon, Break & End Guard, Lobby, Hydration, Village Voice, Quote Vault, Raid Scout, Chat Play Pack and more). Extensions that are off are greyed out, and opening it again replaces the old window. Mark exercises **Done**, spin the wheel or Bean Boozle, change scores and goals, run draws and polls, and edit exercises, flavours, wheel choices, trivia, words and similar lists. Those edits take effect straight away, with no restart. Open it from the Wizard header, the tray, the Streamer.bot action **THSV StreamBridge - Open Control Panel**, or as an OBS dock at `/wizard/panel`. See docs/guide/control-panel.md.
- Village Jukebox is now a YouTube video player. It plays requested videos and Shorts in order, shows each title before it plays, and holds new requests until you approve them (switch this off with "Review each video before it plays"). Videos can be up to 60 minutes if you raise "Maximum video length". The new **Jukebox remote** window has Play/Pause, Stop, Skip, Play now, Next, Remove (refunds), Block/Unblock, Play again, volume and the request history with **Copy all links**. Mods get `!pausesong`, `!resumesong` and `!blocksong`.
- New Streamer.bot actions: **Open Control Panel** (Bridge Launcher) and Open Remote, Play Pause, Skip, Stop, Approve Next and Approve All (Village Jukebox). Re-import **Bridge Launcher** and **Village Jukebox** after updating, then put your triggers back.

## [4.1.8] - 2026-11-02

- Fixed: the break timer could freeze at 00:00 and never switch to your Be Right Back scene or start the break countdown. When a chat warning took more than 5 seconds to reach all your platforms, StreamBridge switched the Break & End Guard off for the rest of the stream, which also stopped the end-of-stream warning and Ending scene. A slow extension now only logs a warning and keeps running (one that actually crashes is still switched off), and the guard saves its progress and plans its next step before it sends chat.

## [4.1.7] - 2026-11-01

- Beta testers: a **Report a bug** button in the Wizard header prepares your support bundle and opens a filled-in GitHub issue (with **Copy report** if the link is blocked). A short **Beta tester quick start** guide is at `docs/guide/beta-quick-start.md`.
- Stream Doctor: the pre-stream check now says which Streamer.bot imports are out of date and which `.sb` file to re-import. Actions you edited yourself are never flagged, and a notice names them so you can copy your changes first. It also reads your OBS scene collection and flags overlays with a missing file, a Bridge link on the wrong port, or an extension that is off. Both checks only read, and never block going live.
- Clearer first run: new installs start with the Mock platform off, Release Readiness moves under Advanced, the Overview counts streaming platforms only, the setup checklist starts with "Turn on the platforms you stream to", and platform cards use proper names with their capabilities tucked away.
- Tray: notifications open the page they are about, **Stop Bridge** asks first while you are live, there is an **Open logs folder** item, and "Exit tray shell" is now "Close tray icon (Bridge keeps running)".
- Plain words everywhere: extension cards, descriptions, health checks, settings help and Streamer.bot import notes no longer use developer wording. The Stream info pop-out uses the forest-green colours with example placeholders. Advanced pages keep their technical wording on purpose.

## [4.1.6] - 2026-10-31

- Discord webhooks page: saved webhooks are picked from one **Saved webhooks** dropdown, and only the chosen webhook's name, switch and Remove show underneath, so a long list no longer crowds the page. Switched-off webhooks show "(off)", a newly added one is selected for you, and the On/Off word sits right beside its switch and changes to **Off** when switched off.

## [4.1.5] - 2026-10-31

- Console sign-ins (Category Pilot) are laid out as tidy stacked cards, the fold arrow sits in the centre of its circle, and settings grids use at most two columns so fields no longer squeeze together (Ko-fi Alerts included).
- Discord webhooks page: the saved list loads again when you open **Automation > Discord**. Since the page moved off Platforms it showed "No webhooks yet" even though your webhooks were still saved and working. Saving can no longer erase the saved list by accident: the page refuses to save before the list has loaded, and removing every webhook now asks first.
- StreamElements tips: received through Streamer.bot's own StreamElements connection (`StreamElements.Tip`) and treated like Ko-fi and Streamlabs donations, with their own alert, chat activity line, colours, and platform tick box in End Credits, Stream Labels and Subathon Timer. Saved lists that had every platform ticked include it automatically. Live tips need a StreamElements tip ID; see docs/streamelements-tips.md.
- Setup checklist: extensions that are turned off, or whose own Enable switch is off, are no longer listed. Only turned-on extensions that still need setup get a card; ready ones are named on one short "Ready" line.

## [4.1.4] - 2026-10-31

- Webhook, action, scene and other data pickers stay dropdowns that scroll, instead of turning into rows of pills that crowd the page.
- Choice tiles are all the same size, with shorter names across the extensions (End Credits, Stream Labels, Goal Bars, Scoreboard, Live Beacon, Shoutouts, Village Voice and more). Tile lists with more than 8 choices scroll inside their own box.
- Scene roles have their own page under Features instead of sitting inside Extensions.
- Removed the add-on package tools (Install an add-on, guided recovery, third-party publishers, Discovered packages, Download for review) and their Wizard requests, since every feature is now built in. Official updates, settings and built-in extensions work as before, and old files are left untouched. The empty "More extensions" box is hidden.
- Stream info pop-out: a small window where you pick a Creator Controls profile, edit the title, categories and platforms, and press **Update all platforms**. It applies right away through the Provider Controller, with no Streamer.bot trigger, and shows **updated** or **failed** for each platform. Open it with **Open pop-out** under Creator Controls or Category Pilot, or **Open Stream info** in the tray. It unlocks like the Wizard and says so when Streamer.bot is not connected, Creator Controls is off or Provider Controller is not approved.
- Category Pilot console games: it can ask Xbox (through OpenXBL, with your API key) and PlayStation (with your NPSSO) which game you are playing, and suggest or apply the profile you chose for up to five console games, like PC games. Both sign-ins are stored protected with Windows and are never shown again. Checks run only while live (by default), never faster than every 30 seconds, and slow down after errors. The PlayStation method is unofficial and may stop working. Nintendo Switch cannot be detected. PC detection is unchanged.

## [4.1.3] - 2026-10-31

- Discord screenshots from your streaming app: StreamBridge can ask OBS Studio or Meld Studio to take the screenshot itself (no desktop or other windows) and post it to Discord.
  - **What to capture:** the scene on screen now, a specific OBS scene, one OBS source such as your camera (picked from a list filled from OBS), or Meld's vertical canvas.
  - **When:** on a viewer's reward or !command as before, and automatically on the events you tick: raid, follow, sub, gifted subs, YouTube membership, bits, Super Chat, tip, TikTok or Kick gift, stream start. Set an optional wait before the shot and a cooldown so a follow train doesn't flood Discord.
  - The new **[event]** word names what happened, for example "📸 [event] by [user]" posts "📸 Raid by CozySloth". **Take a test screenshot** checks it right away.
  - Meld saves into its own screenshot folder, so add that folder to the watched list. Streamlabs Desktop has no way for other apps to take a screenshot, and the Wizard says so.
- Chat overlay styles: the speech-bubble style is now called **Bubble**, and a new **Compact** style uses slim platform cards with the name and message on one line. Saved settings and `?layout=compact` links from before keep showing Bubble. Every style is tighter, and the chat now fills the whole browser source up to its top edge, so resizing the source never leaves an empty gap.
- Overlay sizes: the Chat page shows the recommended browser-source size for the chosen style, and every source on the Overlays page shows a measured horizontal and vertical size instead of 1920 × 1080 for everything. The Scoreboard no longer cuts off its labels on narrow sources.
- Viewer counter: TikTok (from the TikFinity desktop app, read-only) and Facebook (your Page's live video, checked every 30 seconds) join Twitch, YouTube and Kick, with a switch for each platform. If Facebook needs the `publish_video` permission for the count, the Facebook status line says so; comments keep working either way. The Facebook guide now explains how to go live on your Page.
- Fixed: section hint text no longer runs under the round open/close buttons on narrow windows, the Ko-fi panel on Alerts is no longer squashed into a thin column, and the "On this page" bar is solid so text can't show through it.

## [4.1.2] - 2026-10-31

- Restart Bridge: a **↻ Restart Bridge** button at the top of every Wizard page restarts StreamBridge in a few seconds. The same tab reconnects by itself with your saved settings active, with no second window and no unlocking again. It refuses while a platform is live. **Apply changes and verify** and the setup checklist use the same quick restart, and the tray menu has a **Restart Bridge** item too.
- New look: the Wizard drops purple for a forest-and-moss dark theme with amber section labels, and a warm parchment light theme in the same colours.
- Clearer pages: long pages open with an "On this page" bar and labelled parts. Busy areas now have their own pages:
  - **Streamer.bot** holds the launcher, with **Scene connections** and **Streamer.bot import** beside it.
  - **Discord** has its own page under Automation, with webhooks and screenshots.
  - **Overlays & widgets** is separate from the chat design.
  - **Diagnostics** is a short "Test & finish" page, and **Live confidence**, **Live acceptance** and **Troubleshooting** sit under a new **Stream checks** group.
  - Links from the tray and setup checklist go straight to the new places.
- Fixed: the − and + buttons on number settings did nothing in Firefox, because the number box was squeezed to nothing. Buttons that wait for an earlier step now say why when you hover over them.

## [4.1.1] - 2026-10-31

- New: Discord webhooks (Platforms → Discord webhooks). Save each Discord channel or forum webhook once, encrypted for your Windows account, and pick it by name in Discord screenshots, Live Beacon, Clip Courier, Discord Chat Archive, Viewer Spotlight and Free Game Check. You no longer paste webhook links into Streamer.bot actions. Your saved screenshot webhooks move over by themselves; in each of those add-ons, choose your webhook in its settings once after updating. Live Beacon can still use a different webhook per platform and ping one role. Their old Streamer.bot Discord helper actions are no longer used and can be deleted, and Discord Chat Archive no longer needs a Streamer.bot import at all.
- Live Beacon: the Twitch title, category and pictures now come from what Streamer.bot reports and from your other live platforms. The old Streamer.bot helper also looked them up on Twitch when they were missing; that extra lookup is gone.

## [4.1.0] - 2026-10-31

- Everything is built in: nothing needs downloading any more. The 14 features that used to be separate add-on downloads (Creator Controls, Category Pilot, Subathon Timer, End Credits, Village Polls, Polls & Predictions, Village Draw, Prize Wheel, Village Jukebox, Viewer Lobby, Lurk Tracker, Stream Labels, Free Game Check and Accessibility Captions) now ship inside StreamBridge in their Extension groups. Switch each one on or off on the Extensions page. Features you installed before keep their settings. The release no longer publishes separate add-on ZIPs.
- Wizard: the Add-ons page is now part of Extensions, and the Add-ons menu item is gone. Guides and setting hints say "Extensions > …". In the Streamer.bot import builder these features can be ticked straight away; only Ko-fi waits until you turn it on, under a group now called "Integrations".
- New overlay, Emote & GIF wall (`/overlay/emote-wall`): every emote posted in chat (Twitch, YouTube, Kick, BTTV, FFZ and 7TV) floats across the screen. Chat Overlay has a builder card with a live preview to pick how many emotes show, their size, speed and movement, and which chats feed it.
- New overlay, viewer counter (`/overlay/viewers`): your live viewer count from Twitch, Kick and YouTube, read from Streamer.bot. A platform drops off when it goes offline.
- New extension, Chatter Greeting: the first time someone chats in a stream, a bubble pops up with their picture, name, platform and a welcome line. Viewers who chatted in an earlier stream get a welcome-back line instead.
- New extension, Scoreboard: this stream's follows, subs and members, gifted subs, Bits, tips and Super Chats, raids, chatters and messages, added up across platforms next to your best stream on record. A row lights up when it beats the record.
- Goal Bars: YouTube Super Chats now count toward your goals.
- New: Discord screenshots (Platforms → Discord screenshots). Every new picture saved in your screenshot folders is posted to your Discord webhooks, with a message that can use `[user]`, `[platform]` and `[fileName]`. A channel point reward or chat command can name who asked, so the post appears as that viewer with their name and picture, and OBS can take the screenshot for them. Webhook links are stored encrypted for your Windows account, and **Send test** checks each one.
- New extension, Polls & Predictions: your Twitch polls, Twitch predictions and YouTube polls show on stream as live cards with vote bars, a countdown and the winner highlighted. A poll and a prediction running together each get a card. It reads Streamer.bot's own poll and prediction events, so no import or extra trigger is needed. Optional sounds when a card opens and when the result is in; cards hide a few seconds after the result.
- New extension, End Credits: rolls this stream's followers, subscribers, gifters (with gift counts), supporters, raiders and moderators from every platform as movie-style credits. Add it to your ending scene and it rolls each time the scene is shown, stopping with your closing line in the middle. Moderators can type `!credits`, `!credits stop` or `!credits reset`. The list starts fresh when you go live and saves names only.

## [4.0.64] - 2026-10-30

- Chat overlay emotes: Twitch, YouTube and Kick emotes show again. Streamer.bot 1.1 reports where an emote sits in a message one character differently, so StreamBridge threw away any emote at the end of a message and misplaced the next one; it now finds each emote by name and works with old and new Streamer.bot.
- Kick emotes: Streamer.bot sends Kick emotes as plain words, so StreamBridge now loads the channel's Kick emote list (channel, global and emoji sets, animated included) and shows the pictures.
- Quote Vault: with Streamer.bot quote sync on, an empty Quote Vault now copies in your Streamer.bot quotes by itself shortly after start, trying again if Streamer.bot is still opening. On Oct 30 an empty Quote Vault made existing Streamer.bot quotes look lost.
- Program updates: the first check after StreamBridge starts waits 2 minutes, so it no longer reports "not ready" before OBS has opened.

## [4.0.63] - 2026-10-30

- Wizard: opening the Wizard or running a slow check no longer shows a false red "Another Wizard change is finishing" error. Status reads have their own allowance, so the Wizard and tray checking status never block a save, and pages load faster.
- Wizard layout: optional add-on cards show their full name and description, reward ID boxes are wide enough to read the whole ID, Punishments, Scene Gates and Face Filters rows no longer squeeze their fields, scene roles and Overview status boxes line up without gaps, long names wrap instead of being cut off, section arrows line up with their titles, and Remove buttons are readable in the light theme. Overview reads "Configuration management" instead of the raw mode id.
- Add-on settings: message and template boxes (Village Voice, Translate, 8-Ball, Punishments, Fan Crown, Quote Vault and others) grow to show the whole message. They still save as one line: Enter does nothing and pasted line breaks become spaces. Every reward and action ID box has a Copy button.
- Add-on settings history: each save keeps the previous version (the last 10 per add-on) in a `settings-history` folder next to it, so an earlier version can be put back.
- Logs: when the whole internet drops, you get one outage warning instead of an extra warning per stream output.
- Fixed: the recovery bundle, move and tray launchers failed with "Illegal characters in path" because the install folder's trailing backslash swallowed the closing quote.

## [4.0.62] - 2026-10-30

- Program updates: StreamBridge now notices when a program it works with updates itself. That covers Streamer.bot, OBS and its add-on plugins (such as Aitum), TikTok LIVE Studio, Speaker.bot, TikFinity, Streamfog and Voicemod. It checks at startup and every 6 hours, and remembers versions between restarts. When something changes, the tray says what updated. StreamBridge then checks for a StreamBridge update that supports it and runs the pre-stream checks again, and the change stays listed there for two weeks without blocking going live. The first run after installing only records the current versions.
- Streamer.bot updates: after Streamer.bot updates to a version StreamBridge hasn't been tested with, StreamBridge checks your THSV actions against the newest tested version. If every action and trigger still matches, automatic trigger repair turns back on for the new version by itself. If something differs, repair stays off and the pre-stream check names the actions that differ, in plain words.
- Pre-stream checks: a new OBS canvas check warns about two canvases with the same name, an empty leftover canvas, or Aitum Stream Suite pointing at a canvas without your scenes. On Oct 29 that left the vertical canvas stuck on Stream Ending.
- Fixed: the versions of OBS, Speaker.bot, Streamfog and Voicemod were not being read, because a saved path with forward slashes never matched the path Windows reports.

## [4.0.61] - 2026-10-29

- Stream Doctor: StreamBridge checks every minute that Streamer.bot is still connected to Twitch, YouTube and Kick. If a platform you use drops on two checks in a row, the tray shows "Kick disconnected in Streamer.bot" (or Twitch or YouTube) with where to reconnect, and the warning is logged. It clears by itself once the platform is back. On Oct 29 Kick dropped in Streamer.bot for about an hour and a half before anyone noticed.
- Pre-stream checks: a new **OBS plugins** card warns when OBS loaded the same plugin twice (an old copy left in `C:\ProgramData\obs-studio\plugins` next to the current one), which can make the vertical canvas lag behind the first scene switch. It reads the newest OBS log and says which folder to clean up.

## [4.0.60] - 2026-10-29

- TikTok LIVE Studio: when OBS stops and LIVE Studio says it isn't live, StreamBridge asks again for a few seconds and ends the LIVE if it is still running. If it still can't tell and the automatic Go LIVE failed that stream (so you probably started TikTok by hand), the tray reminds you to end TikTok yourself instead of saying nothing. On Oct 28 TikTok stayed live after OBS stopped.
- Chat and alert delivery: a failed delivery always gets its retry. Before, a retry falling due at the exact moment it was scheduled could be skipped until something else woke the queue.
- Wizard: status badges, muted labels and the chat preview now have readable contrast in the light theme, and a new browser test checks every wizard page in both themes.
- Guides: new **Known limits** page (what Windows, Streamer.bot and each platform can't do, with workarounds), **Accessibility features** page, a draft public announcement, and a note that the Kick bot account is optional.

## [4.0.59] - 2026-10-28

- Feature overlays: each feature's **Overlay** tab has **Card position** (any corner, the top or bottom center, or the left or right middle) and **Card size** (small, regular or large) pickers, so its card stays off your webcam, chat and gameplay. The overlay URL updates as you pick; existing sources keep the centered card until you copy the new URL.
- Updates: while an update is installing, starting StreamBridge (from the tray, Stream Deck or Streamer.bot) is refused with a clear message instead of starting a second copy; the installer starts it again when it finishes.
- Streamer.bot import: after every import, the wizard now lists exactly which actions need their trigger added again and which to leave triggerless, without downloading the package first.
- Guides: Translate's Push to Talk button, what the tray does if StreamBridge freezes, and how to uninstall.

## [4.0.58] - 2026-10-28

- Raid Scout **Start/Stop All OBS Streaming Outputs**: the Aitum Stream Suite check reads OBS's output list instead of asking about each output by name, so Streamer.bot no longer logs "No output was found" when an output hasn't started yet or has already stopped. Re-import the Raid Scout Streamer.bot package after updating; approvals are kept.
- While Streamer.bot is closed for a long time, StreamBridge's connection warning backs off from once a minute to once every 15 minutes, so a closed night is about 30 lines instead of hundreds.
- Facebook Page comments: a single server error from Facebook is retried quietly and only warns if it happens again.
- Village Voice: when Speaker.bot holds a read-out (for example while its queue is paused as you talk), the log shows a warning that it is held instead of an error.

## [4.0.57] - 2026-10-28

- Tray: if StreamBridge is still running but stops answering for a minute while you are offline, the tray restarts it by itself and shows a notification (on Oct 27 it froze at 4:02 PM and stayed frozen until Windows closed it). It never restarts while a platform is live, while StreamBridge is starting, or after you used Stop Bridge, and at most once every 15 minutes. Each step is written to the tray log.
- Magic 8-Ball: the Twitch and Kick reward boxes are single lines that take one reward ID each, instead of lists.

## [4.0.56] - 2026-10-27

- Translate: **voice translation** for viewers, using your existing Streamer.bot speech-to-text. Each option has its own switch and is off by default. `!translateme <language>` follows along: what you say is collected for 30 seconds and posted as one message per language, only in that viewer's chat, for 15 minutes or until `!translateme off`. `!whatdidyousay <language>` translates your last 30 seconds once. `!captions <language>` shows your speech translated on the Translate overlay for 10 minutes. At most 3 languages at once, only from your list. Your speech is kept in memory for at most two minutes and never saved.
- Translate: **Stream Deck "Translate me" button**. Put the new Streamer.bot action **THSV Addon - Translate - Push to Talk** on a button: press once and talk; when you pause for 4 seconds (or press again) what you said is translated into your chosen languages (default Spanish) and posted once per language to every chat you pick. It stops by itself after 2 minutes. No approval needed; re-import the Translate Streamer.bot package after updating.
- Translate: each Stream Deck button can override where it sends (`pushToTalkOutput`: chat, captions or both), which chats (`pushToTalkPlatforms`, for example `youtube`) and which languages (`pushToTalkLanguages`, for example `es,ja`). Left empty, the wizard settings apply. A new **Button sends to** setting picks chat, on-screen captions or both.

## [4.0.55] - 2026-10-27

- New **Magic 8-Ball** extension (Community Play): viewers ask a question with a Twitch or Kick channel point reward (the reward's text box) or an optional chat command, and the answer goes only to the chat the question came from, with an optional on-screen card. Nothing to import into Streamer.bot.
- Translate: messages that look English are skipped on your PC before the translator is called (common English words, emotes, links, numbers), so automatic translation no longer sends every message out. A translation that comes back unchanged is not posted. Turn it off under Automatic translation > "Skip English messages without calling the translator".

## [4.0.54] - 2026-10-27

- Streamer Punishments: the exercise and bean countdown is now small and sits in a corner instead of a full-screen card over the gameplay. New **Countdown size** (small, medium, or large for the old full card) and **Countdown position** (top or bottom, left, center or right) settings. The default is small in the top right, away from the tracker in the bottom left.
- Raid Scout **Start/Stop All OBS Streaming Outputs**: Aitum Stream Suite can report its outputs as off while they are still streaming, so the end of stream left Kick, Facebook and YouTube Vertical running and go-live counted 0 of 3 extra streams. Both actions now also check OBS's own status for each Stream Suite output, and Stop All stops an output in OBS directly when Stream Suite leaves it running. Re-import the Raid Scout Streamer.bot package after updating; approvals are kept.
- Stream Break & End Guard: if a platform's "stream ended" signal never arrived (Kick on Oct 22 and Oct 27), the next stream had no breaks and no ending timer. Going live now starts a fresh session when the previous one was left open: its ending was due more than 30 minutes earlier, or it began more than 16 hours earlier. A platform reconnecting during a real ending still restarts nothing.

## [4.0.53] - 2026-10-22

- Stream Launch Countdown: the scene switch at zero works again when the countdown's own Start, Pause, Resume, Reset, Stop, Complete Now or Set & Start actions are also approved. Before, approving those (which the setup checklist asked for) meant the countdown found more than one approved action and ran none.
- Setup checklist and **Approve recommended**: no longer ask you to approve control actions that only send commands in, for Stream Launch Countdown, Scene Actions, Stream Break & End Guard (only Scene Controller) and Village Hydration Station (only Speak, and only when Speaker.bot reminders are on).

## [4.0.52] - 2026-10-22

- Bridge and feature updates: when **Download & prepare** or **Install verified update** fails, the wizard now shows the real reason (for example GitHub's hourly limit on your network, or a failed download or provenance check) instead of "Internal bridge error".

## [4.0.51] - 2026-10-22

- Streamer Punishments and Face Filters: new **Only on these scenes** setting (exact scene names or Scene roles such as `role:live`; empty means every scene). On any other scene, `!buy`, lens commands and Twitch or Kick channel point redemptions are turned away with a chat message before any points are spent, and channel point redeemers are told a mod can refund them. Bits, tips and TikTok gifts are never blocked. Until the first scene change after StreamBridge starts, nothing is blocked.

## [4.0.50] - 2026-10-22

- Setup checklist: every card is the same size in an even grid, each to-do is one short line, longer details are under **Show details**, and the button sits at the bottom of the card.
- New **Scene Gates** extension (Broadcast Director, off until you turn it on). Choose which scenes each Streamer.bot command or Twitch channel point reward may be used on, for example `!hydrate` only on Just Chatting or a reward only on `role:live`. On the wrong scene the command is turned off and the Twitch reward is hidden (disabled, not paused); when every platform goes offline everything is turned back on. Scenes can be exact names or Scene roles, nesting (🟠) scenes are ignored, and only the gates that change are sent to Streamer.bot. Pick commands by name in the wizard after refreshing the Streamer.bot list.
- Kick workaround: Streamer.bot cannot turn Kick rewards off, so Scene Gates also keeps a temporary Streamer.bot global per gate (`thsvGate.<gateId>`). Put **Set Argument gateId**, **Run Action THSV Scene Gate - Check** and an If/Else on `sceneGateAllowed` at the top of a Kick action, and on the wrong scene it replies in Kick chat with your message and stops. Works for Twitch and YouTube actions too. Kick channel points are not refunded automatically; reject the redemption from the Kick queue.
- Row-list settings in the wizard can now show dropdowns and a Streamer.bot command picker.
- Streamer Punishments: new **shared exercise limit**, 5 per stream by default (0 turns it off). Every exercise counts toward one total, whichever exercise it is and wherever it was bought: Twitch and Kick channel point rewards and `!buy` on every platform. After each exercise, chat on that platform says how many are left ("3 of 5 exercises left this stream."). At the limit the viewer is told "No exercises left this stream (5 of 5 used)." on their platform: `!buy` spends no points, and a refused Twitch or Kick redemption asks a mod to refund the channel points from the reward queue. The total resets when a new stream starts, and the per-exercise limits and cooldowns still apply alongside it. Both messages can be changed in the wizard.

## [4.0.49] - 2026-10-22

- Setup checklist: features whose Streamer.bot actions only send events into StreamBridge (such as Ad Break Companion, Custom Counter and Subathon Timer) no longer ask you to approve those actions. They have nothing to approve, so the item could never be cleared. The checklist still tells you when one of their actions is missing from Streamer.bot.

## [4.0.48] - 2026-10-21

- New **Setup checklist** page in the wizard, right under Overview. For every feature you turned on it lists what is still missing: actions to approve or import, empty Twitch or Kick reward IDs, scene roles to pick, unsaved changes or a needed restart, and platforms that are not connected. Each item has a button to the exact place to fix it, and finished features show **Ready**. The menu shows how many items are open.
- Approving or removing a feature's Streamer.bot actions now takes effect straight away, with no restart, even while you are live. The wizard only asks for a restart when the feature was just installed and is not running yet.
- Update checks no longer run into GitHub's 60-per-hour limit. Routine checks use GitHub's normal release pages and reuse the last answer for six hours, including after Streamer.bot reconnects. Only **Download & prepare** still uses GitHub's limited service to confirm where a release was built, and if that limit is hit StreamBridge shows when it will try again instead of an error.

## [4.0.47] - 2026-10-21

- New setup guide on GitHub: the README is now a short "start here" page, and [docs/guide](docs/guide/README.md) walks through install, the Streamer.bot import and action approval, each platform, OBS and overlays, scene roles, points and `!buy`, the tray and Stream Deck, and updates. It ends with a table of every feature.
- Every feature now has a full setup page in [docs/addons](docs/addons/README.md): what it does, what it needs (Streamer.bot actions, OBS sources, rewards), step-by-step setup, its chat commands, and a table of every setting with its default. Five features that had no instructions (Automated Shoutouts, Ko-fi Donations, Quote Vault, Random Clip Player, User Translate) now have them.
- Neutral defaults for new installs: Free Game Check no longer points chat at a built-in Discord invite (with no invite it lists the free games in chat), and the default alert, Village Voice and command texts (`!merch`, `!clip`, `!timezone`, `!bot`) no longer mention "the village". Text you already changed in the wizard stays as you set it.
- Wizard: a scene picker set to `role:chatting` now shows it as the Just Chatting scene role instead of a "refresh required" leftover.
- Cleanup: old planning and history docs moved to `docs/archive`, outdated facts in the older guides fixed (intake triggers now come with the import, Facebook Page is supported, Streamer.bot's default port is 8080), and four one-off maintenance scripts removed.

## [4.0.46] - 2026-10-21

- Streamer Punishments: the tracker panel now shows only while an exercise or bean is owed or in progress, and hides once everything is done ("Show the tracker only while something is owed", on by default). Turn that off to keep the panel up all the time, as in 4.0.43.

## [4.0.45] - 2026-10-21

- Random Clip Player can play clips without sound on chosen scenes ("Scenes that play clips without sound" in its Audio settings). It starts with your Starting scene from Scene roles, so clips on Starting Soon play muted under your background music while clips on Be Right Back and Ending keep their sound.

## [4.0.44] - 2026-10-21

- Fixed extensions losing saved progress when part of it was empty. StreamBridge used to refuse the whole save if any field was blank (the same problem 4.0.39 fixed for Streamer Punishments), so a counter, owed list or cooldown could quietly stop saving. StreamBridge now drops the blank fields and saves the rest, for every extension.

## [4.0.43] - 2026-10-21

- Bean Boozled: TikTok gifts can spin the wheel (500 coins per spin by default, "TikTok coins per spin" in the wheel settings, 0 turns it off). Small gifts from the same viewer add up toward a spin during the stream, and one gift gives at most the "most spins" limit.
- Streamer Punishments has an always-on tracker panel on its overlay: what is owed right now and this month's total for each exercise (and beans when the wheel is on). Pick its corner in the settings, or add `?tracker=only` to a second browser source to place it anywhere and `?tracker=off` to hide it in the main one. It comes back by itself when OBS reloads the source.
- Face Filters: Kick redemptions now follow the command cooldowns, because Kick rewards have no cooldown of their own. A refused Kick redemption tells the viewer a mod can refund their points.
- Chat overlay: usernames no longer clip at the bottom (letters like g, y and p), and long family names wrap instead of being cut.
- Wizard: header buttons such as "Check for updates" stay inside their cards on laptop screens, and the Live acceptance cards lay out their fields in rows so "Save acceptance" and the note box are no longer squeezed.

## [4.0.41] - 2026-10-21

- Face Filters lenses can each have a Voicemod voice. When a lens turns on, Voicemod switches to that voice and the voice changer turns on. When the lens ends, the stream goes offline or Face Filters stops, the voice changer turns off. Lenses without a voice leave your mic alone. Streamer.bot picks voices by ID, so pick the voice in Voicemod and have a mod type `!filter voice`: chat replies with its ID to paste into the lens row. Import the Face Filters Streamer.bot package again and approve Set Voice, Voice Off and Report Voice.
- Face Filters lens rows now have separate "Twitch reward ID" and "Kick reward ID" boxes, like Streamer Punishments. Existing rows keep their values.

## [4.0.40] - 2026-10-21

- Voicemod can now open automatically with Start THSV Streaming Tools, like TikTok LIVE Studio and Streamfog. Turn it on in the Wizard under Streamer.bot > Voicemod. It starts before Streamer.bot so the Voicemod connection finds it right away, and it is skipped when Voicemod is already open.
- Start THSV Streaming Tools never opens a second copy of an app that is already open, even when the open copy was installed in a different folder than the one saved in the Wizard.
- When Streamer.bot is already open but its WebSocket server has not started yet, StreamBridge now waits up to 25 seconds for it instead of closing and reopening Streamer.bot right away.

## [4.0.39] - 2026-10-21

- Streamer Punishments has a new Bean Boozled wheel (off until you turn on "Bean Boozled wheel"). Each 500 bits or $5 tip buys a spin, up to 3 spins from one cheer or tip. The wheel lands on a bean color, then a card reveals NICE or NASTY with the flavor (7th edition pairs, editable). The bean joins the owed list like an exercise: a 30-second countdown, a switch to Just Chatting, then `!done` switches back. `!punishments` also shows beans eaten this month, and mods can type `!punish bean` for a test spin.
- Fixed Streamer Punishments failing to save its owed list and counts whenever no exercise was in progress. Exercises bought with `!buy` or redeemed with Twitch or Kick channel points could go missing from the owed list.

## [4.0.38] - 2026-10-21

- Streamer Punishments now enforces limits on Kick channel point rewards, because Kick rewards have no limit or cooldown of their own. Kick exercise redemptions follow "Most purchases of each exercise per stream" (5) and the exercise cooldown (10 minutes), counted together with `!buy`. Kick screen effects get their own cooldown, "Cooldown for each screen effect from Kick rewards" (30 seconds by default). A blocked redemption gets a chat reply saying a mod can refund the Kick points. Leave Redemption Skips Queue off on Kick rewards so you can reject blocked ones from the Kick queue. Twitch rewards keep using their own limits.

## [4.0.37] - 2026-10-20

- Streamer Punishments effects and exercises now have separate "Twitch reward ID" and "Kick reward ID" boxes. Twitch IDs you already entered stay in the Twitch box, and a comma-separated pair in one box still works.
- Row editors in the wizard (Streamer Punishments, Face Filters) now line up each column title with its box. Titles such as Seconds, Points and Reward IDs used to sit to the right of their boxes.

## [4.0.36] - 2026-10-20

- New Streamer Punishments extension (Community Play, off until you turn it on). Viewers buy punishments: a screen effect turns on one of your OBS filters for a few seconds (Blackout, Pixelate and Barrel roll to start), and an exercise (Pushups, Situps and Squats to start) goes on an owed list. Twitch and Kick use channel point rewards matched by reward ID; YouTube, Facebook and TikTok use `!buy <name>` with StreamBridge points, refunded if an effect can't run. Before each exercise the overlay counts down a 30-second grace period, then StreamBridge switches to your Just Chatting scene; you or a mod type `!done` and it switches back. Exercises wait during Starting Soon, breaks and the ending. Each exercise is limited to 5 purchases per stream with a 10-minute cooldown. `!punishments` shows this month's reps and what is owed, and monthly totals reset at your first stream in a new month. Mods can use `!punish off`, `!punish clear` and `!punish next`. Import the Streamer Punishments Streamer.bot package and approve Set Filter and Switch Scene.

## [4.0.35] - 2026-10-20

- Break & End Guard no longer switches to the five-minute warning scene the instant the end warning starts. The countdown, chat message and sound now show on the scene you are on first, and the switch follows after a heads-up. During the heads-up the overlay counts down to the switch (for example "JUST CHATTING IN 00:30"), then counts down to the end of the stream. Set the delay with "Heads-up before switching to the warning scene" (30 seconds by default, 0 switches immediately as before).

## [4.0.34] - 2026-10-20

- Scene roles now has a "Nested scene (ignored)" picker inside each role card, so you can pick the scene each role scene nests its sources from (for example 🟠 Gameplay inside 🔴 Gameplay) the same way you pick the role scene. Going live on a picked nested scene starts or stops nothing. The name-prefix box from 4.0.33 is still there as "Also ignore any scene that starts with (optional)" for nested scenes not tied to a role, and it now says to enter only the start of the name (such as 🟠).

## [4.0.33] - 2026-10-19

- New "Nesting scenes" setting under Add-ons > Scene roles. Scenes whose names start with what you enter there (for example 🟠) are treated as scenes that only hold sources for other scenes. If one goes live, nothing starts or stops: clips, the break and ending countdowns, Raid Scout, scene actions, timers and the lights all act as if the last other scene is still live, and switching back to that scene is not counted as a new switch. Blank (the default) keeps the old behavior.

## [4.0.32] - 2026-10-19

- Stream Break & End Guard now posts a heads-up to every live chat when the break countdown starts, and again when the stream-end countdown starts. It also plays a sound on its overlay at that moment and again 10 seconds before the break or the end. The messages, the sound, its volume and the final-countdown seconds are under the new "Chat and sound alerts" settings, and each can be switched off.
- Raid Scout now waits for a running ad before sending the raid, so Twitch's 90-second raid countdown moves your viewers only after the ad finishes. Until then it keeps playing the target's clips that fit and shows the next-stop card with the time left. Cancel still stops it. Turn it off with "Send the raid after a running ad" under Raid Scout's clip preview settings.

## [4.0.31] - 2026-10-19

- The Extensions page's component list now scrolls when it is taller than the window, instead of cutting off the groups at the bottom.
- Face Filters no longer says a lens is on in chat when Streamer.bot refused to start it.
- Approve Streamer.bot actions now scans Streamer.bot as soon as you open it, shows whether each recommended action was found, and approves the found ones with one click (Approve recommended). If an action is not found, the manual picker opens so you can choose it yourself. Face Filters now recommends Activate Lens and Deactivate Lens, and add-ons without a fixed list recommend the actions their own package created.
- Face Filters now turns each lens off itself when its seconds are up, when the stream ends, and when StreamBridge stops, using a new triggerless Deactivate Lens action. Streamfog ignores the duration sent with Activate Lens, so lenses used to stay on. Re-import the Face Filters Streamer.bot package and approve both actions.

## [4.0.30] - 2026-10-19

- When a release adds a new extension to a built-in group you already turned on (Face Filters joined Community Play in 4.0.28), StreamBridge now installs it on startup, turned off until you set it up. It happens once, so an extension you remove stays removed.

## [4.0.29] - 2026-10-19

- The optional-app file chooser (Streamfog, TikFinity and the others) now opens in the app's install folder, lists Desktop and Start-menu shortcuts, and no longer freezes StreamBridge while it is open.
- Choosing the wrong file, or a chooser that could not open, now shows what went wrong instead of "Internal bridge error".

## [4.0.28] - 2026-10-19

- New Face Filters extension (Community Play) for Streamfog face-cam lenses. Each lens is one editable line (label, exact Streamfog lens name, optional !command, optional channel point reward title, seconds); it ships with four placeholders (Banana, Sloth, Female, Mystery, 30 s each). Viewers can also use !filter <name> or !filter random. One lens runs at a time with a short queue, global and per-viewer cooldowns (redemptions, mods and the broadcaster skip them), live-only use with offline mod testing, and the queue clears when the stream ends. Needs the new Face Filters Streamer.bot package and the Activate Lens approval.
- Streamfog is now an optional app in Start all streaming tools, skipped when it is already running.
- Face Filters lenses are edited as rows of labelled boxes (Name, Streamfog lens, Chat command, Channel point reward ID, Seconds) with Add lens and Remove. Channel point rewards are matched by reward ID only, so renaming a reward does not break a lens; paste the Twitch and Kick IDs separated by a comma for a lens that works on both.

## [4.0.27] - 2026-10-18

- Chat Guard now catches the Kick chatbot-ad spam ("Make your stream fire with Bot Liva com", "With AI-powered chatbots, your chat stays active around the clock... type !noads") with new default blocked phrases: bot liva, botliva, make your stream fire, ai-powered chatbot, chat stays active around the clock and !noads. Existing installs with a saved word list need these added to it.
- New Chat Guard list "Spam-bot phrases that get an instant ban" (section 4, Optional automatic action). A message matching it is hidden and, when both automatic-action switches are on, the sender is banned on the chosen platforms (Kick by default) while everything else keeps the everyday action. The same account is never banned twice; mods and VIPs stay exempt.

## [4.0.26] - 2026-10-18

- After an internet drop, the tray names each platform that did not come back. When several stream outputs drop at once, StreamBridge treats it as an internet drop; once the connection has been back for a minute and platforms have had up to 3 more minutes to report, one notice lists every output OBS gave up on or is still retrying and every platform that reported its stream ending (for example YouTube Auto-stop or Facebook) while OBS kept streaming. If everything came back, it stays quiet. The "keeps dropping" alert no longer fires for every output while the drop is in progress.

## [4.0.25] - 2026-10-17

- If OBS crashes or is closed while you are live, StreamBridge now treats the stream as ended once OBS has refused connections for 30 seconds: TikTok LIVE Studio ends, timed messages stop and the session closes, the same as a normal stop. Before, a crash left the session open, so TikTok LIVE stayed up and timed messages kept firing until OBS was reopened. Brief hiccups or a busy OBS do not count.
- Raid Scout's "Stop All OBS Streaming Outputs" now stops outputs one at a time, waiting up to 5 seconds for each to finish, with OBS's main stream still last. Stopping several outputs that share one encoder at the same moment could crash OBS. Ending a stream takes a few seconds longer. Streamer.bot keeps its existing copy of this action until it is updated or re-imported.

## [4.0.24] - 2026-10-17

- Raid Scout no longer ends the stream when a different scene is picked for a moment. A saved scene name that starts with an emoji now only matches that exact emoji, so "🟠 Ending Soon" no longer counts as "🔴 Ending Soon"; the same rule applies to the scene roles on the Add-ons page. Raid Scout also waits until the ending scene has stayed on screen for 3 seconds before it starts the ending ad, the raid and Stop Streaming, so a Studio Mode toggle or a mis-click is ignored. Saved names without an emoji still match any decorated variant.

## [4.0.23] - 2026-10-17

- Start THSV Streaming Tools no longer reports TikTok LIVE Studio as FAILED when it opens fine. LIVE Studio's launcher needs administrator rights, so Windows refused the direct start ("EACCES"); StreamBridge now opens it the way double-clicking does and reports success once it runs, or mentions a waiting Windows permission prompt instead of a failure. An already-open LIVE Studio is now recognised as running even though Windows hides where it runs from, so it is not started a second time.

## [4.0.22] - 2026-10-16

- YouTube chat keeps working after Streamer.bot updates on PCs with Windows Smart App Control on. Streamer.bot 1.1.0 alpha builds ship an unsigned Google.Protobuf library that Smart App Control blocks, and every Streamer.bot update removes the fix that points it at a Google-signed copy. When StreamBridge starts Streamer.bot, it now puts that fix back first, after backing up Streamer.bot.exe.config, and notes it in the startup output. It only does this when a signed copy is in Streamer.bot's `dlls\google-protobuf-signed-<version>` folder, the shipped library is unsigned and the fix is missing; otherwise it changes nothing, and a failed check never stops Streamer.bot from starting.

## [4.0.21] - 2026-10-16

- Automatic TikTok Go LIVE now works when OBS Virtual Camera is off when you start streaming. StreamBridge turns Virtual Camera on and now waits up to 5 seconds for OBS to report it running, instead of checking once right away, seeing it still off and falling back to the reminder. You no longer need to press Start Virtual Camera before Start Streaming.

## [4.0.20] - 2026-10-16

- Fixed "Internal bridge error" in the setup wizard (readiness check, Streamer.bot page and updates) while TikTok LIVE Studio or another optional program runs as administrator. Windows hides the location of such a program, and StreamBridge now treats it as running with an unknown location instead of failing. StreamBridge still sees it as running, so it does not open a second copy, and the TikTok LIVE Studio reminders and automatic Go LIVE / End LIVE work while LIVE Studio is open.

## [4.0.19] - 2026-10-16

- Stream Launch Countdown no longer starts over and freezes at 5:00 when you toggle OBS Studio Mode (or click another scene and back) on the Starting scene. A countdown that was running keeps counting if you return to the Starting scene within a minute.
- Fixed the countdown's go-live timer, which could be scheduled for less than the 1 second minimum and fail to fire.
- TikTok LIVE Studio reminders: when OBS starts streaming and TikTok LIVE Studio is one of your optional programs, the StreamBridge tray reminds you to press Go LIVE in LIVE Studio (skipped if TikTok events are already coming in), and reminds you to end the TikTok LIVE when OBS stops. Clicking the reminder opens LIVE Studio.
- Optional automatic Go LIVE and End LIVE in TikTok LIVE Studio together with OBS, using the same local control LIVE Studio offers its official Stream Deck plugin. Turn it on under Setup Wizard > Streamer.bot > TikTok LIVE Studio; it is off by default. StreamBridge turns on the OBS Virtual Camera, only presses Go LIVE when LIVE Studio is not live and only presses End LIVE when it is live, leaves a paused LIVE alone, and falls back to the reminder if anything fails. The last result is shown in the wizard.

## [4.0.18] - 2026-10-15

- StreamBridge now warns you when one stream output keeps dropping. While you are live it checks every streaming output in OBS (the main stream, Twitch Enhanced Broadcasting and plugin outputs such as Aitum Stream Suite's TikTok, Kick and YouTube outputs) every 10 seconds. If one drops 3 times within 2 minutes, the StreamBridge tray shows a notification naming it, for example when TikTok has ended your LIVE and the stream key no longer works. A single network blip stays quiet, you get one notification per problem, and it clears after a minute of stable streaming or when you stop that output. It only uses StreamBridge's existing OBS connection.
- Installs are about 11 MB smaller: the release no longer ships source maps, type declarations, TypeScript sources or Markdown docs from its runtime folders, which StreamBridge never loads. License and notice files stay.
- After an update, StreamBridge now also removes downloaded update zips and prepared folders left behind by older versions, which could add up to over 100 MB.
- Clip Library Cache refreshes the clip list hourly while you are offline and right away when you go live, instead of every 15 minutes (or your chosen interval) around the clock. While live it keeps your chosen interval.
- When GitHub's hourly limit for update checks runs out, Overview > Bridge updates now says so and when to check again, instead of "GitHub release check returned HTTP 403".
- While Streamer.bot is closed, add-ons such as Clip Library Cache and Follower Pulse now log one warning per add-on and a line when Streamer.bot is reachable again, instead of an error on every attempt.
- Browser tests no longer connect to a real OBS on the same PC.

## [4.0.17] - 2026-10-15

- Scene roles is now on the Add-ons page, where the settings and docs point, and loads its scene pickers when that page opens. It was previously left on the Extensions page.
- The Scene roles card is a compact grid with one shared Refresh scenes button instead of a long column of repeated controls.
- Added a separate Just Chatting scene role (`role:chatting`) next to Main live. The Scene Actions starter "Just Chatting" mapping uses it on new installs; saved mappings are unchanged.
- The Extensions page now has a searchable component list with status dots, and each component opens in tabs (Settings, Streamer.bot, Overlay, Data, Status) instead of one long page. Each component remembers its last tab, and "Configure" on a group card jumps to it.
- Existing installs: after updating, open **Add-ons > Scene roles**, map your scenes (including Just Chatting if you use one), save with backup and restart StreamBridge.

## [4.0.16] - 2026-10-15

- Bridge updates is now the first card on the Overview page, so the update check is easy to find.
- Added TikTok LIVE Studio to the optional programs StreamBridge can start with your streaming tools (Streamer.bot page). Choose `TikTok LIVE Studio Launcher.exe`; an already-open TikTok LIVE Studio from the same install folder is recognised instead of started twice.

## [4.0.15] - 2026-10-14

- Added a Community name setting (Overview > Community) that add-ons use in viewer-facing text. Blank uses the broadcaster's channel name from live events, then "the community". Add-ons read it from the new `context.community.name`.
- Add-on defaults now use a `{community}` token instead of "the village": Automated Shoutouts welcomes, Village Lurk Tracker's lurk reply, Discord Chat Archive's forum post name and session header, and Village Draw's giveaway name. Saved values keep working, and `{community}` also expands in saved text.
- Viewer Foundation's points name now defaults to "Points" and its achievement labels to Regular, Veteran and Legend; achievement IDs are unchanged. Viewer Spotlight, Free Game Check and the Village Draw overlay use neutral wording. The THSV product name, add-on names and Streamer.bot action names are unchanged.
- Existing installs: set Overview > Community name in the setup wizard (for example 'The Hidden Sloth Village'); add-ons you already saved keep their wording, while add-ons never saved switch to the new neutral defaults (for example 'Points').
- Added scene roles: choose your own Starting, Main live, Break and Ending scenes once under **Add-ons > Scene roles** in the setup wizard. Scene pickers in add-on settings now offer these roles alongside detected scenes, and the pre-stream check names any role an add-on uses but you have not mapped.
- Stream Break & End Guard, Random Clip Player, Stream Launch Countdown, Raid Scout and the Scene Actions starter mappings now default to roles (`role:break`, `role:ending`, `role:starting`, `role:live`) instead of the scene names `BRB`, `Stream Ending`, `Starting Soon`, `Just Chatting` and `Be Right Back`, so a shared install works with any streamer's scenes. The Gameplay starter mapping is no longer created; its imported action is still available to map.
- Raid Scout's ending-scene match now ignores any leading emoji, not only 🔴 and 🟠.
- Timed messages that post only to Facebook no longer also run the Streamer.bot sender, which failed every time because it has no Facebook output. Facebook output still posts them.
- The Streamer.bot imports now include the triggers that do not depend on your setup, so re-importing no longer strips them: all 29 Twitch, YouTube and Kick triggers on the three platform intakes, OBS Studio, Streamlabs Desktop and Meld Studio Scene Changed (any scene) on the Scene Actions intake, and Twitch Upcoming Ad and Ad Run on the two Ad Break Companion intakes. Streamer.bot's import replaces an existing action's triggers, so re-importing restores exactly this set instead of adding copies, and trigger assurance treats them as satisfied.
- Launch Bridge now ships with its Streamer.bot Started trigger, so StreamBridge starts with Streamer.bot again after a re-import.
- Triggers that depend on your setup are still attached by hand and are still removed when an import overwrites their action: Monitor Connections' THSV StreamBridge Health timed action, Live Beacon's and Raid Scout's broadcast-app Streaming Started/Stopped, Ko-fi Donation, Voice Control, scene-specific Random Clip Player triggers, and hotkey or deck-button triggers.
- Launch Bridge, Shutdown Bridge and Open Setup Wizard now find the install on their own. StreamBridge records its folder in `%LOCALAPPDATA%\THSV StreamBridge\install-location.txt` every time it starts, and the installer records it on install and update. The `thsvBridgeInstallPath` argument now ships blank; blank, `auto` and the old `%LOCALAPPDATA%\THSV StreamBridge` default all mean automatic, and a typed folder that contains an install still wins.
- Existing installs: start StreamBridge once after updating (from the tray or Start THSV StreamBridge) so it records its folder, then re-import your universal Streamer.bot import once with overwrite enabled. If you typed a folder into `thsvBridgeInstallPath`, you can clear it. After the re-import, reattach the THSV StreamBridge Health timed action to Monitor Connections, plus any other hand-made triggers listed above; the Launch Bridge, platform, Scene Actions and Ad Break Companion triggers are already in place, so do not add them again. If trigger assurance reports duplicates, remove the extra copies.
- Existing installs: scene names you already saved in these add-ons keep working unchanged and need no action. If you never saved those add-on settings (so they were still using the shipped `BRB`, `Stream Ending` or `Starting Soon` names), map your Starting, Break and Ending scenes under **Add-ons > Scene roles**, save with backup and restart StreamBridge; until a role is mapped, the features that use it do nothing.

## [4.0.14] - 2026-10-07

- Republished the 4.0.13 changes after its release build stopped on a launcher test that only passed before noon UTC; the test now mocks the clock before saving. No application changes beyond 4.0.13.

## [4.0.13] - 2026-10-07

- Kept one subscribed OBS WebSocket per endpoint for scene and live-state changes instead of opening a new authenticated connection every second, with a 15-second fallback check.
- Made Streamer.bot and broadcast-app process checks asynchronous and cached, so the Bridge no longer launches netstat and PowerShell about once a second.
- Debounced the deduplication and activity-timeline saves, coalesced overlapping status and delivery-queue writes, and wrote connection history and the scene catalog only when they change.
- Delivered one scene change when Streamer.bot and OBS both report the same switch.
- Replaced per-minute month-rollover checks in the monthly add-ons with one timer for the next month boundary, and stopped idle Chat Play Pack, User Translate and Lurk Tracker state rewrites.
- Saved Starting Soon Countdown and Subathon Timer state on changes and every 30 seconds instead of every second.
- Backed off Random Clip Player retries while Streamer.bot is unreachable, from 1 second to a 30-second cap.
- Stopped bridge and wizard launches from holding Streamer.bot's WebSocket and Stream Deck ports, retried the launch readiness check for up to 15 seconds, and remembered the install folder across launcher re-imports.
- Played raid targets' clips in Twitch's embedded clip player (served on localhost) instead of requesting download links Twitch only grants for your own channel.
- Bounded Raid Scout clip previews to 45 seconds, checked live state when the stream-online signal was missed, and refused Suggest and Confirm or Go Live as the Stop Streaming action.
- Fixed the wizard's timer-template apply and overview header regressions, and made CI tests platform- and timezone-independent.

## [4.0.9] - 2026-08-27

- Began a new application release line without modifying the published 4.0.8 release.
- Added a seven-day advance warning for verified Streamer.bot compatibility-cache expiry.
- Added automated Windows coverage for stale GitHub CLI credentials and public release/attestation fallback.
- Made compatibility-cache and command-publication history replacement flushed, recoverable, and safe across interrupted Windows renames.
- Split active service output and archived logs into independently reported and enforced storage ceilings.
- Added a scheduled public-attestation canary and a release-gating Windows ACL acceptance check.
- Added a dedicated checksum-verified Node runtime cache for offline-tolerant repeat packaging.
- Serialized crash-safe state writes per path and added fault injection at every replacement boundary.
- Added persistent wizard log-budget controls with a mutation-free archive-prune preview and explicit approval gate.
- Updated ESLint to 10.9.1 and typescript-eslint to 8.68.0 while holding TypeScript and Node types on their reviewed major lines.
- Stabilized the complete browser suite, expanded unauthenticated release verification to every published evidence and add-on asset, and delayed public-canary issues until two consecutive failures.
- Included safe log-storage budgets in configuration transfers, added a weekly verified runtime-cache rotation rehearsal, and added an isolated TypeScript 7 / Node 26 compatibility lane.
- Added two-strike recovery-aware notifications for the runtime and toolchain canaries, upgraded actionlint to 1.7.12, and added shared offline hostile release-evidence fixtures.
- Kept disposable package/tool caches outside ESLint discovery to reduce local and release-gate overhead.
- Pinned the actionlint container to its immutable registry digest and made cancelled, skipped, neutral, and timed-out automation conclusions non-failures for issue tracking.
- Bound 4.0.9 release evidence to both the exact clean source commit and the core archive SHA-256 while retaining public verification compatibility for older 4.0.8 evidence.
- Added commit-, toolchain-, and 24-hour-bound release-validation receipts so clean receipt-backed repackaging can reuse a completed quality gate without rerunning lint, typecheck, tests, and configuration validation.
- Added daily and weekly canary freshness, latest conclusion, and last-success timestamps to the read-only release-readiness view and creator-review gate.
- Queried each release canary through its dedicated workflow history, retained recent incident and recovery duration, and exposed GitHub API cache age plus rate-limit capacity in Release readiness.
- Retained and attested the exact commit-bound validation receipt inside the protected release job.
- Added a deterministic unsigned-payload manifest before Authenticode signing and carried its SHA-256 into the final release and installed-build provenance.
- Added restart-safe ETag caching and public GitHub rate-limit backoff to Release readiness, including visible conditional-hit and resume status.
- Pinned every third-party GitHub Action to an immutable commit or container digest and added a workflow-wide regression test.
- Required signer and trusted timestamp verification for the bundled runtime and every configured first-party PowerShell signature during post-release smoke.
- Split the TypeScript 7 and Node 26 type migration canary into independent and combined lanes; all three preserve the production manifest and lockfile.
- Added weekly grouped Dependabot pull requests for immutable GitHub Action revisions while retaining human review and the existing protected-main checks.
- Split the oversized add-on browser acceptance into four focused scenarios and added an explicit install-complete/error DOM contract instead of timing-based waits.
- Blocked first-party signing unless the certificate thumbprint is creator-approved, enforced a minimum validity window, and recorded advance expiry warnings in signing evidence.
- Added a manual, confirmation-gated draft promotion workflow that requires the published 4.0.9 release and three consecutive green scheduled toolchain canaries.
- Required toolchain promotion to download and validate every retained lane artifact from all three qualifying canary runs before changing production dependencies.
- Isolated every Playwright case behind its own Bridge process, random port, and disposable add-on data root, enabling safe parallel browser workers.
- Added a protected manual signing-certificate preflight that checks the shared allowlist, code-signing EKU, and expiry policy without signing release files.
- Added a checksum-pinned actionlint bootstrap that reuses its verified archive offline and falls back across Windows HTTPS, Node, and GitHub CLI downloads.
- Verified every GitHub Action commit pin against its documented upstream tag and corrected the compatibility provenance action to the v2.4.0 commit.
- Regenerated and aligned all 42 first-party Streamer.bot packages and first-party add-ons for 4.0.9.
- Bound every toolchain promotion lane to its workflow head commit and required each downloaded artifact to match the SHA-256 digest reported by GitHub.
- Explicitly dispatches and waits for protected CI on bot-created toolchain promotion pull requests.
- Shows the protected signing-certificate preflight age, expiry state, and days remaining in Release readiness without exposing certificate identity.
- Restricts workflow Actions to the approved `actions` publisher and verifies the official actionlint release attestation in CI in addition to its pinned checksum.
- Retries temporary Action-tag lookups and permits only a matching, seven-day verified cache fallback during GitHub API outages.
- Attests the exact toolchain-promotion eligibility and validated artifact report before an automated draft promotion pull request can be created.
- Opens one deduplicated certificate-renewal issue inside the 60-day warning window and closes it after a protected preflight reports a current certificate.
- Sanitizes retained certificate-preflight artifacts so certificate subject and thumbprint remain inside the protected job.
- Temporarily runs the isolated next-major toolchain soak daily so the three post-release scheduled gates can complete in days instead of weeks.
- Links the exact promotion-evidence attestation from both the generated draft pull request and Wizard Release Readiness.
- Adds a monthly stale-preflight check that opens one protected-approval reminder and closes it after fresh evidence appears.
- Grants the current GitHub artifact-metadata permission required by the attestation action in release and promotion workflows.

## [4.0.8] - 2026-08-26

- Added one versioned Streamer.bot 1.0.7 trigger registry shared by universal import generation, trigger assurance, repair, documentation-facing wizard output, and automated tests.
- Added guided post-import verification and recovery: inspect the saved actions, preview exact changes, create a verified backup, repair while Streamer.bot is closed, restart safely, and run the suppressed integration rehearsal.
- Replaced manual import confirmation with authoritative installed trigger evidence in pre-stream readiness.
- Hardened trigger repair with version and schema guards, missing-action re-import guidance, type-aware duplicate prevention, transient Windows write retries, post-write validation, automatic rollback, and SHA-256 backup metadata.
- Bounded trigger rollback storage to the newest 20 verified backups and pruned their matching integrity sidecars together.
- Added a packaged Windows release gate covering the 29-trigger import-loss scenario, 10/10/9 restoration, action-body preservation, post-restart readiness, and verified rollback.
- Added a reusable isolated upgrade rehearsal that fingerprints copied creator configuration, secrets, private integration state, and add-on state before and after installation without touching the active installation.
- Made protected previous-release resolution fall back to GitHub's public release and attestation APIs when the local GitHub CLI login is unavailable, while retaining checksum and offline cryptographic provenance verification.
- Regenerated and aligned all 42 first-party Streamer.bot packages and first-party add-ons for 4.0.8.

## [4.0.7] - 2026-08-26

- Added durable, privacy-safe stream-session evidence spanning Bridge restarts, including countdown, live, chat, timed-action, ad, clip, raid, ending, capability-denial, and dispatch-failure results.
- Expanded mutation-free pre-stream checks across installed actions, creator grants, exact OBS/Meld/Streamlabs scenes, browser sources, timed actions, and the complete Raid Scout ending flow.
- Added detected-scene selectors, offline-only apply-and-verify recovery, and safer handling for permanent action-grant denials.
- Preserved wizard settings, executable selections, protected credentials, add-on state, action grants, triggers, and Streamer.bot action identities during upgrades.
- Regenerated all 42 Streamer.bot packages and gated the release with 1,189 passing unit/integration tests and the complete 61-case browser suite.

## [4.0.6] - 2026-08-25

- Added encrypted, exact-process-bound native WebSocket profiles for OBS, Meld, and Streamlabs, including safe discovery, scene selection, conflict detection, maintenance windows, reliability scoring, and acceptance history.
- Hardened one-button startup against missing or moved executable paths, stale listeners, overlapping launches, crash loops, and optional-app failures without stopping healthy tools.
- Added scheduled mutation-free preflight, configuration drift detection, protected repair and rollback, trigger assurance, sanitized support timelines, and post-stream reports.
- Made installed extension recovery restore every previously enabled verified bundled component while preserving creator settings, action grants, paths, secrets, and state.
- Regenerated and indexed all 42 Streamer.bot packages at 4.0.6 and expanded Linux, Windows, lifecycle, installer, startup-chaos, browser, and protected-release coverage.

## [4.0.5] - 2026-08-23

- Added the Live Confidence Center with configuration-drift checks, dry-run replay, readiness rehearsal, redacted operational timelines, recovery evidence, and post-stream reports.
- Added continuous OBS interruption evidence and recovery tracking so scene or broadcast-state instability is visible without exposing creator secrets or chat content.
- Automatically synchronize already-installed, core-managed extension packages during a Bridge upgrade while preserving enabled choices, action grants, private settings, and module state.
- Kept extension migration bounded: upgrades do not reinstall creator-removed components or alter optional add-on selections.
- Regenerated and indexed all 42 Streamer.bot packages at 4.0.5 and expanded operational reliability, upgrade-migration, wizard, browser, and packaging coverage.

## [4.0.4] - 2026-08-22

- Added direct OBS scene discovery and continuous broadcast-state monitoring so the wizard can populate scene selectors and recover or close live sessions when platform lifecycle events are missing.
- Added Streamer.bot trigger assurance, native scene relay hardening, and clearer wizard diagnostics for incomplete, disabled, duplicated, or version-unavailable triggers.
- Made Starting Soon Countdown and Random Clip Player recover from mid-live startup and scene-state drift without restarting healthy playback.
- Added Raid Scout clip embed and alternate-clip fallbacks when Twitch returns no direct playable download URL.
- Made lifecycle transitions idempotent, reset overlay surfaces once after the final offline transition, and clear stale simulated timed-action selections on test or stop.
- Regenerated and indexed all 42 Streamer.bot packages at 4.0.4 and expanded automated live-reliability, wizard, launcher, scene, and trigger coverage.

## [4.0.1] - 2026-08-17

- Removed persistent application rollback copies: after the replacement version passes its health check, the installer keeps only the active application version.
- Removed the `previousVersion` field from successful installation records while retaining temporary transactional recovery if an installation fails before activation completes.
- Updated release documentation and installer coverage to make the single-active-version policy explicit.

## [4.0.0] - 2026-08-17

- Consolidated 23 frequently used components into seven built-in extension groups and made Viewer Foundation, Community Analytics, and Ko-fi Donations first-class integrations in the main installation.
- Added a selectable one-file Streamer.bot import workflow covering the required framework, chosen extensions, integrations, and enabled optional add-ons while preserving stable action IDs and creator-owned trigger review.
- Reduced public add-on downloads to 11 genuinely optional packages; bundled extension components remain integrity-verified inside the main archive and are no longer duplicated as optional ZIPs.
- Added the native tray shell, ordered one-click tool launcher, authenticated token recovery, safe updater, responsive wizard navigation, live overlay editing previews, and explicit success and failure feedback.
- Hardened stream lifecycle, presentation queues, independent timer/media lanes, clip playback, Raid Scout shutdown fallbacks, moderation, hydration, follower reconciliation, command directories, and stale-session recovery.
- Removed retired archived prototypes, legacy recovery imports, redundant generated packages, and obsolete application-only installation folders while preserving creator data.
- Regenerated and indexed all 41 Streamer.bot packages at 4.0.0 and refreshed setup, migration, release, add-on, integration, website, and troubleshooting documentation.

## [3.6.0] - 2026-08-15

- Promoted Community Analytics, Custom Counter, Follower Pulse, Village Voice, Translate, Chat Play Pack, and Village Fun Commands into built-in extensions with shared lifecycle coordination, explicit enablement, migration controls, and isolated failure boundaries.
- Separated built-in extensions from optional add-ons in the setup wizard, expanded the responsive workspace for wide displays, and added clearer action feedback, live overlay previews, guided setup, and update status.
- Added a native Windows tray shell, one-click ordered launcher, safer stale-session recovery, discoverable installation/token controls, and an automatic signed release update monitor with live-stream safeguards.
- Added synchronized, indexed Streamer.bot imports generated from reviewed source, including Raid Scout multi-output start/stop helpers and package integrity metadata.
- Hardened Raid Scout, Random Clip Player, Starting Soon Countdown, Hydration Station, Quote Vault, Clip Library Cache, Chat Guard, alert coordination, and browser overlays against stale state, duplicate triggers, playback interruptions, shutdown failures, and malformed provider data.
- Added application branding assets and expanded setup, architecture, feature, add-on, website handoff, release, backup, restore, installer, and troubleshooting documentation.
- Regenerated all 41 Streamer.bot import packages and aligned every first-party package with THSV StreamBridge 3.6.0.
- Removed retired archived implementations, recovery-only legacy imports, the unreferenced generated Free Games import, and stale pre-versioned installation folders. The portable installer now removes those old application-only paths after the replacement version passes its health check while preserving creator data, extension state, backups, and the current version rollback.

- Repaired legacy mojibake in saved reward activity and alert templates, including middle dots, sparkle/fire emoji, apostrophes, bullets, ellipses, and dash punctuation.
- Made Stream Launch Countdown Start idempotent so OBS Studio Mode scene-active duplicates and transient Stop/Start cycles preserve the running timer; Reset plus Start or Set & Start remain the explicit restart paths.
- Fixed Hydration Station so only accepted viewer redemption/command reminders display temporarily through the shared overlay queue; startup, stream lifecycle, scheduled reminders, and creator controls remain visually silent, and hydration cards no longer interrupt independent clip playback.
- Fixed First Five startup so module loading and automatic stream-start reward resets stay silent; its overlay now appears only after a valid completed claim, avoiding startup timeouts and unsolicited cards.

## [3.5.0] - 2026-08-02

- Added one bridge-wide presentation queue for transient alerts, reward cards, shoutouts, game results, giveaway cards, and prize wheels, with a wizard-configurable delay between items. Clip/media playback, persistent widgets, captions, and exact previews remain independent.
- Re-verified Viewer Spotlight against normalized, verified Twitch and Kick channel-redemption events with exact saved reward-ID matching and bounded reward settlement/refund behavior.
- Added the optional Village Fun Commands package with automatically registered multi-platform Sloth Fact, Cat Fact, Joke, Fun Fact, Number Fact, 8-Ball, Hug leaderboard, Dice, Pick, Rate, and Random Color commands; Chuck Norris and Aesthetic Text remain opt-in.
- Moved Random Joke, Magic 8-Ball, and Hug out of Command Sync so one add-on owns their settings, cooldowns, source-only replies, repeat protection, and bounded state. Existing creator-authored commands still win collisions.
- Added a triggerless, fixed-domain Streamer.bot content helper with short timeouts, bounded reads, correlated one-use relays, circuit breakers, and 20 local fallbacks per provider-backed command. No viewer identity or chat text is sent to fact or joke providers.
- Fixed the shared command contract to accept digit-leading command names such as the conventional `!8ball`, which the old wizard exposed but the central validator previously rejected.

- Promoted the complete post-3.0 wizard, add-on, command-directory, Village Polls, Chat Play, Viewer Lobby, Village Draw, and reliability work into one synchronized 3.5.0 release.
- Regenerated all 38 Streamer.bot imports and all 34 independently installable add-on bundles at 3.5.0 while preserving the one-intake-per-platform trigger contract and Twitch/Kick reward-redemption routing.
- Added local-deployment verification that installs every first-party add-on into the creator-owned add-on package root, preserves private settings/state, and confirms module, overlay, wizard, health, and readiness cohesion before publication.
- Kept provider acceptance separate from automated acceptance: financial, reward, moderation, raid, Discord, voice, scene, and outbound-chat actions still require the documented creator-controlled live checks.
- Added a privacy-safe viewer command directory, authenticated creator-specific publishing, dictionary-backed Chat Play content, bundled Chat Play commands, creator-approved core/add-on update staging with checksum and provenance verification, and the `!songqueue` collision fix.
- Expanded Viewer Foundation administration and Chat Guard review tools while preserving private identities and chat text.
- Hardened Category Pilot, Viewer Lobby, Creator Controls, Free Game Check, Chat Play Pack, Accessibility Captions, Follower Pulse, and multi-platform lifecycle processing against stale results, simulation leakage, floods, and partial-provider shutdowns.

- Village Draw now reads commands directly from existing normalized chat intakes instead of generating inert no-response actions. Pending point purchases can no longer cross draw lifecycle boundaries, cancellation waits for recovery before refunding, multi-platform stream-end handling waits for the final observed platform, and chat/overlay delivery failures are exposed through its authenticated status.
- Renamed Creator Utility Pack to Village Polls, including its internal module ID (`thsv.village-polls`), and retired its duplicate counter so Custom Counter is the only counter system. Village Polls now reads commands directly from the existing normalized chat intakes, removes the generated no-op poll actions, deduplicates chat and derived-command copies, surfaces delivery failures, publishes results when a stream closes an open poll, announces polls/results across all four chats, rejects empty closes, and strictly caps unique voters at 5,000.

## [3.0.0] - 2026-08-01

- Synchronized the bridge, 34 first-party add-ons, 37 generated Streamer.bot packages, overlay assets, wizard, package manifests, and public documentation at Version `3.0.0`.
- Added centralized add-on coordination with exclusive, queueable, independent, background, priority, cooldown, cancellation, timeout recovery, failure cleanup, diagnostics, and creator-confirmed emergency reset behavior.
- Added Custom Counter with role-gated chat/action controls, up to 20 private persistent counters, optional normalized-event deltas, source-routed replies, and a customizable core-hosted overlay.
- Added one central reward blueprint catalogue covering names, descriptions, costs, colors, text input, cooldowns, limits, settlement expectations, and coordination behavior while preserving honest Twitch/Kick capability differences.
- Regenerated every Streamer.bot import with Version 3 metadata and dedicated core or add-on groups, without claiming automatic preservation of creator-owned trigger bindings during overwrite import.
- Added the Version 3 migration, rollback, first-live checklist, reward, trigger, emergency-reset, and release documentation.
- Preserved runtime blocking of high-impact events that lack provider-stable IDs. Simulated and automated tests remain separate from genuine Twitch, Kick, YouTube, TikTok, Streamlabs, Ko-fi, Discord, TTS, scene, and reward acceptance.

## 2.6.1 - Free Game viewer access follow-up

- Free Game Check now accepts Twitch and Kick channel-reward requests through the existing platform intakes and the configurable `!freegames` command from YouTube and TikTok.
- Matching requests send one source-routed, creator-editable chat message that directs the viewer to a validated Discord invite, with a bounded per-viewer cooldown.
- Added a guided wizard setup card and Command Sync template without adding another platform trigger or WebSocket connection.

- Added optional authenticated third-party add-on publishers. Creators explicitly bind one publisher ID to one GitHub repository; staged updates must pass the existing tagged-workflow artifact-attestation, release-index, outer/inner checksum, compatibility, and publisher checks before a separate inbox install approval.
- Added opt-in bounded Twitch clip video prefetch for Random Clip Player. Only Twitch CDN HTTPS URLs and redirects are accepted; files are limited to 50 MiB each and 250 MiB total, expire within 24 hours, remain loopback-only, and are byte-range served for smoother browser-source playback. Cache failures fall back to the provider URL.
- Added optional Free Game Check Discord channel/forum delivery with a private Streamer.bot webhook argument, disabled mentions, correlated acknowledgements, bounded rate-limit retries, and strict Discord/GamerPower URL validation.

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.1.138] - 2026-11-21

- Added: Stream Bingo extras. A **full card bonus** keeps the card going after the bingo and draws a second winner when every square is marked. **Hype mode** makes a quiet card glow and nudges chat once with how close the nearest bingo is. Viewers can send **square ideas** with `!bingo suggest`, which only reach the card after you press Add in the Control Panel. New **command squares** tick from chat commands such as `!lurk` or a death counter's `!death`. Bingos and a monthly recap can post to a **Discord** channel, and your own **Streamer.bot action** can run after each bingo with the winner's details.

- Added a loopback-only interactive multichat dock with a normalized chat feed, one-platform or all-platform reply targeting, per-platform character limits, and creator-account sending through the existing Streamer.bot connection. Regular, Compact, and Minimal now have distinct visual structures, and the new Classic Chat option provides a familiar card-free name-and-message flow.
- Added one collision-safe effective command registry shared by chat intake and the public command directory. Enabled add-ons now register their saved viewer commands automatically after restart, creator-authored Command Sync definitions remain authoritative, and conflicts are reported without disabling unrelated commands.
- Moved Clip Courier `!clip` creation and Chat Guard `!guardtrust` into the existing normalized chat-intake path. Their Streamer.bot helpers remain triggerless, while legacy native Command objects can stay disabled until live acceptance is complete.
- Updated add-on setup guides and wizard readiness cards to remove obsolete Command Sync/package-generation steps for automatically registered commands.

## [2.6.0] - 2026-07-31

- Added Village Jukebox, a YouTube-first multi-platform song-request add-on with creator-private API resolution in Streamer.bot, bounded persistent queues, Viewer Foundation point spending after validation, Twitch/Kick reward intake, Twitch settlement, no-repeat fairness, vote/moderator skip controls, and one shared browser/media connection. Spotify playback is intentionally excluded.
- Expanded First Five, Fan Crown, Raid Scout, Village Roll Call, Viewer Spotlight, and Village Voice so supported Twitch/Kick rewards and YouTube/TikTok Viewer Foundation point paths share stable identities, source-routed replies, bounded state, and explicit settlement limits.
- Hardened serialized add-on event processing so one rejected event cannot permanently poison First Five, shutdown waits for in-flight Fan Crown and Viewer Spotlight work, and failed Viewer Spotlight requests refund supported rewards or point spends.
- Hardened Village Voice with serialized controls, bounded cooldown tracking, stable point-spend identities, shutdown cancellation/refunds, and non-overlapping scheduled work.
- Fixed Random Clip Player fresh installs by making Clip Library Cache optional, retaining the approved Streamer.bot fallback, serializing lifecycle events, and removing overlay/media listeners during shutdown.
- Added beginner-first wizard guidance and setup documentation for the expanded reward, point, voice, spotlight, clip, and Village Jukebox paths, including dependency order and duplicate-trigger prevention.
- Pinned the development-only `brace-expansion` transitive dependency to patched `5.0.8`; both production and complete npm audits now report zero known vulnerabilities.
- Synchronized the bridge, all 33 first-party add-ons, all 36 Streamer.bot packages, public documentation, and release metadata on version `2.6.0`.

## [2.5.2] - 2026-07-31

- Added beginner-first Bridge Core and all-add-on setup guides, exact wizard connection steps for the newest no-import add-ons, and Command Sync templates for Creator Utility counters, poll control, and voting.
- Hardened Viewer Foundation so chat inside a viewer's award cooldown cannot farm consistency bonuses, repeated lurk commands preserve the original lurk start, and an undersized activity window is safely raised to the required award interval.
- Serialized Stream Labels, Village Roll Call, and Prize Wheel event handling so simultaneous provider events cannot overwrite label/check-in state or start overlapping spins.

- Expanded Viewer Foundation into a creator-configurable cross-platform points system with a custom currency name, a source-routed `!points` command, chat consistency bonuses, observation-based active-chat and lurk awards, configurable supported-event values, replay protection, and bounded catch-up behavior. Silent viewing is not guessed or tracked.
- Removed Creator Utility Pack's older in-memory giveaway so Village Draw is the single giveaway system; Creator Utility Pack now owns only counters and polls.
- Hardened Prize Wheel lifecycle handling so overlapping spins are rejected and disabling or stopping the add-on cancels its delayed result instead of allowing a late chat or overlay announcement.
- Added Prize Wheel, a casual multi-platform command-controlled wheel with two through ten equal slices, server-authoritative winner selection, a studded decelerating OBS animation, cropped winner card, per-platform bounded chat templates, and a safe Command Sync control template.
- Added Village Draw, a standalone cross-platform giveaway add-on with free or Viewer Foundation points entry, bounded weighted tickets, authenticated wizard controls, secure snapshot-based selection, source-routed confirmations, responsive winner cards, and persisted batched cancellation refunds.
- Added Village Roll Call, a Twitch daily Channel Points check-in add-on with stable-user daily uniqueness, configurable calendar time zone, bounded monthly rankings, editable winner messages, simulation-safe testing, and an optional cropped-OBS-safe leaderboard card.
- Added the Stream Labels add-on. It groups equivalent Twitch, YouTube, Kick, TikTok, Streamlabs, and Ko-fi events into persistent Latest Follower, Member, Gift Membership, Support, Raid, Reward, and Latest Event browser-source labels without adding Streamer.bot triggers or WebSocket connections.
- Added four Command Sync templates: Twitch Account Age and Uptime use the official Helix API with Streamer.bot-held broadcaster credentials; Game Suggestion keeps one bounded, case-insensitive multi-platform list without a hard-coded file path; and Magic 8-Ball returns one source-gated answer from an original editable response set.
- Updated Streamer.bot guidance to recommend `1.0.5-beta.5` while retaining beta.2 as the latest directly observed THSV runtime evidence. The compatibility review confirmed that OBS retry handling, Speaker.bot timeout improvements, and Twitch user-lookup guards require no C# import, trigger, reference, normalized-event, or add-on API change.
- Added Raid Scout's private phased search presentation and optional single public Twitch clip preview before an already-confirmed raid. The preview is bounded, retained nowhere, and safely falls through to the raid when no clip can play.
- Declared Raid Scout's bounded-scheduling capability so live phased-search and clip-preview lifecycle events are accepted by the add-on broker.
- Added a permission-gated exclusive video slot shared by media add-ons. A confirmed Raid Scout preview now fades and pauses Random Clip Player without disabling it or losing its shuffle bag; cancellation and failure release the slot, while a successful raid keeps the ending-scene clip hidden through the bounded handoff window.
- Expanded Live Beacon with per-platform channel/forum destinations, existing forum-post IDs, and a create-for-me mode that creates each permanent welcome post on its first genuine live event and privately persists the confirmed thread ID. The standard import now asks for one shared webhook; advanced platform-specific webhook arguments remain available only for platforms routed to different parent destinations. Each linked embed includes explicit stream-title, game/category, direct-link, and start-time fields, plus Twitch broadcaster-title/category fallbacks.
- Consolidated manual and automatic translation into the current Translate add-on. The legacy Auto Translate package remains migration-only in source and is excluded from new release bundles.

## [2.5.1] - 2026-07-30

- Simplified every add-on wizard card with a four-item setup summary, one essential settings section open by default, collapsed long-form instructions, plain-language trigger guidance, and persistent disclosure state after saves.
- Added verified recommended-action selection. The wizard now matches the exact imported action names, displays human-readable names and groups, saves stable IDs, and keeps unrelated or creator-defined approvals behind an advanced section.
- Clarified guided setup for Chat Guard, Clip Library Cache, Clip Courier, and Community Analytics in the wizard and versioned add-on guides.
- Clip Library Cache is now explicitly presented as optional shared infrastructure: it performs one bounded Twitch metadata lookup and has no overlay, playback, download, or Discord output of its own.
- Removed Clip Courier's redundant Twitch `Get Clips` action and scheduler. Courier now consumes shared cache snapshots for optional current-stream discovery, while its direct `!clip` path creates a new Twitch clip and imports one triggerless Discord Deliver action.
- Added Chat Guard optional-enforcement controls and a disabled `!guardtrust` Streamer.bot command that can enroll a replied viewer's stable platform ID into the wizard-managed trusted list.

- Added independent alert heading, creator thank-you, and optional viewer-message layers with editable per-platform/event templates. Expanded Voice Relay with all-alert Speaker.bot thank-yous, separately opted-in viewer-message speech, financial thresholds, five-second bits/gift aggregation, and a bounded filtered queue. Voice Relay now requires a real Speaker.bot Voice Alias before it can be enabled and fails closed when setup is incomplete.
- Recorded live Voice Relay playback acceptance with Speaker.bot `0.1.7`: both creator aliases were saved, the approved Speak action was acknowledged, and the creator heard the connection phrase plus all ten alert-category acknowledgement phrases. Queue-pressure behavior is covered by regression tests, and emergency controls were accepted separately through audible manual checks.
- Added direct Voice Relay regression coverage for rapid-cheer aggregation and Pause/Resume/Stop state transitions. The installed creator controls also returned `ok`, reached the bridge as unique durable add-on relay events, and finished in Resume.
- Completed Voice Relay offline acceptance: native Clear Pending removed a queued marker sentence and Stop Speaking interrupted the active harmless phrase, both confirmed audibly by the creator.
- Completed Chat Guard Observe-only acceptance against the installed bridge: a safe local sample was flagged without persistence, public output, or moderation enforcement. Destructive provider modes remain deliberately unaccepted.
- Completed Discord Chat Archive normal-channel provider acceptance with one viewer-free test message, a confirmed Discord message ID, and no delivery error. Forum-thread creation/reuse remains pending.
- Completed Ko-fi Donations offline acceptance: Streamer.bot's simulated donation carried a stable ID, remained visibly simulated, normalized once, and entered durable delivery. Ko-fi-originated webhook acceptance remains pending.
- Repaired the installed clip stack by adding its missing Clip Library Cache dependency. One approved real Twitch refresh returned `40` bounded records, persisted metadata without signed query credentials, and restored Clip Courier and Random Clip Player to healthy while leaving longer duplicate-polling observation pending.
- Reconfirmed the repaired Stream Launch Countdown relay through its imported Streamer.bot actions: Set & Start persisted and displayed a running timer, Stop hid it cleanly, and preview-only Complete Now rendered and auto-hid the configured completion state without dispatching Go Live. Audible completion audio and optional scene switching remain explicit acceptance tasks.
- Accepted the Subathon Timer's local manual-control and overlay slice: all five control types acknowledged cleanly, Add Time produced the exact bounded increase, reset restored the baseline, the browser rendered READY without errors, and simulated gifts remained unable to alter production time.
- Fixed source-checkout startup on Windows launch hosts that expose duplicate case variants such as `Path` and `PATH`; the launcher now normalizes aliases only while creating the child process and restores the caller environment afterward.
- Fixed add-on upgrades across bridge releases: the installer now verifies the outgoing package's schema, file list, and hashes without incorrectly requiring that older package to support the newly installed bridge. The incoming replacement still must pass current core and bridge compatibility checks.
- Synchronized the public status, production gate, acceptance ledger, offline guide, and future roadmap around the published `2.5.0` baseline, `29` packaged add-ons, `135` Vitest files / `717` tests, and `12` browser checks.
- Recorded direct Streamer.bot `1.0.5-beta.2` acceptance evidence: the `93`-action grouped layout was intact, and one harmless Twitch, YouTube, and Kick chat test trigger per platform reached the installed bridge exactly once as a non-duplicate, durably queued event. Genuine-provider acceptance remains separate.
- Clarified that the earlier Streamer.bot `Partially Connected (8/10)` state predated the now-verified Speaker.bot connection; Meld remains intentionally unused because OBS is the adopted browser host.
- Improved the chat overlay's production defaults with darker high-contrast platform cards, automatic fallback from unreadable provider name colors, one canonical `MOD` role marker instead of duplicate `MOD`/`Moderator` labels, integer-positioned standalone chat layout, and native-size OBS guidance through the responsive chat URL.
- Widened standalone chat cards to `680` pixels, assigned deliberately contrasting accessible username colors per platform, added four-platform readability coverage, and versioned the chat CSS/JavaScript asset URLs so OBS reloads cannot retain the older duplicate-badge renderer.
- Made cropped and custom-sized chat sources fill their native browser width, kept the newest card inside the bottom safe area, forced usernames to crisp white on every platform, and removed redundant moderator badges in the bridge projection as well as the browser renderer.
- Restored distinct platform-aware username accents with an automatic WCAG contrast check against the creator's selected card color and a strongest-contrast black/white fallback.
- Fixed height overflow in cropped chat sources: the newest message now remains fully visible at the bottom, older messages move upward, and the oldest card is removed as soon as the available source height can no longer contain it. ResizeObserver coverage reapplies the fit after live source resizing.
- Refined cropped chat overflow so it no longer removes a whole card early and leaves unused space. The feed stays bottom-packed while excess oldest content passes through a soft fade at the top boundary; the newest card remains fully visible.
- Restored the recommended alert shape to the classic horizontal rectangle and added per-alert transition controls in the wizard: slide down/up, fade, horizontal slide, soft pop, or instant. Alert exits now complete before the next queued card renders.
- Added responsive alert-title fitting: long names shrink only as needed to remain within two clean lines, preserve a readable 16-pixel floor, and use a final two-line clamp for extreme input so the title cannot collide with alert details.
- Fixed the wizard Setup overview card so it is labeled **Version** and reads the synchronized installed StreamBridge release instead of displaying the internal `2.0.0-preview.1` contract identifier as a product preview version.
- Updated current Streamer.bot guidance to recommend `1.0.5-beta.2`, documented its THSV impact and re-acceptance checklist, and preserved `1.0.5-alpha.31` plus package-specific versions as compatibility floors rather than forcing an unnecessary package rebuild.
- Corrected active setup documentation that still named `2.4.0` downloads and Streamer.bot imports after the synchronized `2.5.0` release.

## [2.5.0] - 2026-07-27

- Completed the practical add-on expansion with Creator Utility Pack, Chat Play Pack, Free Game Check, Accessibility Captions, and Clip Library Cache, bringing the release to 29 separately installable first-party add-ons and 36 reproducibly generated Streamer.bot imports.
- Added optional Chat Guard enforcement modes with double approval, provider-capability checks, simulation suppression, and rolling action limits while retaining observe-only defaults.
- Expanded Viewer Foundation and Viewer Spotlight with digest-locked migration, achievements, carousel and credits modes, Stream Score, reward requests, Discord snapshots, and immediate privacy-deletion propagation.
- Added a creator-facing acceptance ledger that keeps automated, offline/manual, and genuine-provider evidence separate in the wizard.
- Reduced Streamer.bot Action History pressure by excluding only high-frequency triggerless background lookup workers from pending/history views; moderation, rewards, public delivery, controls, and other auditable actions remain visible.
- Added a generated, versioned setup guide for every first-party add-on, a complete guide index, inline wizard setup steps, health checks, repair guidance, and a `SETUP.md` inside every public add-on bundle.
- Aligned the bridge, all 29 add-ons, all Streamer.bot manifests/imports, documentation, release assets, and update metadata on the stable `2.5.0` version baseline.

## [2.4.3] - 2026-07-27

- Refined Command Sync starter templates: every template now identifies its platform coverage; removed Rules, Love, PC Specs/Gear, Emotes, and Bot Credit; added stateful multi-platform Lurk and Hug templates; made Streamer Time report the Streamer.bot computer's live local time and timezone; and clamped every generated response to Twitch, YouTube, Kick, or TikTok limits after variable expansion.
- Added the first Chat Guard safety slice as a disabled-by-default observe-only add-on. It classifies bounded public-chat signals, supports stable-ID and role exemptions, stores no raw chat or identity data, and has no moderation or Streamer.bot action authority.
- Added authenticated Chat Guard aggregate status, explicit all-provider observe-only capability reporting, and confirmed clearing of retained pseudonymous observations.
- Added a non-persisting Chat Guard rule tester so creators can evaluate sample messages and repeat thresholds without echoing text or invoking moderation.
- Added normalized Chat Guard domain allow/deny policy with exact parent/subdomain matching and no broad plain-text domain false positives.
- Added creator-approved temporary Chat Guard link permits with stable-ID hashing, bounded expiry and use counts, explicit clearing, and domain-only bypass behavior.
- Added pseudonymous Chat Guard incident review labels and recent metadata so creators can measure confirmed matches versus false positives without retaining chat or viewer identity.
- Moved Bloom Companion to the back burner in the future roadmap so current work proceeds through non-companion safety and creator-control features first.

- Fixed Random Clip Player repeatedly requesting the same exhausted clip list until broker rate limiting. A refreshed pool whose clips have all played now starts exactly one new shuffle cycle without repeating within that cycle.
- Unified Live Beacon, Clip Courier, and Discord Chat Archive on one reviewed Discord channel/forum delivery contract: one destination type per private webhook, explicit mention allowlists, confirmed `wait=true` responses, bounded HTTP 429 retry, correlated message/thread IDs, and no response-body, message-content, or webhook logging. Chat Archive now creates one forum thread and reuses it until the final live platform goes offline.
- Added bounded main-wizard templates for Commands/Help, a source-gated stateless Coin Flip, and Twitch Follow Age; Community Links, Rules/Help, Support, and Schedule timed-message packs; and independently applied Minimal, Warm, and Hype wording for chat events and alert profiles. Follow Age queries Twitch's fixed Helix followers endpoint from its reviewed generated Streamer.bot C# action, keeps broadcaster OAuth credentials inside Streamer.bot, checks only the invoking viewer, and ships with API-protective cooldowns and readable permission failures. Placeholder-dependent timed packs start disabled.
- Reused Streamer.bot's existing authenticated Streamlabs connection for native `Streamlabs.Donation` intake over the bridge's single WebSocket. StreamBridge never reads or stores the Streamlabs credential, accepts live financial events only when the raw event contains a stable `event_id`, `donation_id`, `_id`, or `id`, and exposes independent Streamlabs donation alert/chat styling and simulated previews in the wizard.
- Added Follower Pulse as a disabled-by-default Twitch add-on. A triggerless approved Streamer.bot controller pages the fixed Helix followers endpoint with the existing broadcaster credential, while StreamBridge creates a silent baseline, accepts only complete bounded scans, requires two missing scans before recording a removal, and keeps identity history private and retention-bounded.
- Added optional capped monthly engagement scoring to Community Analytics using observed sessions, messages, and commands only. Creator-defined weights and per-input caps prevent chat spam from dominating; money and provider support are structurally excluded. Viewer Spotlight can separately display the score and a cohort-protected monthly rank, both disabled by default, while its fake wizard preview never reads production viewer data.
- Added broker-local Viewer Foundation privacy-deletion propagation. Only the official provider can emit a validated pseudonymous viewer ID; Community Analytics immediately purges the matching viewer and active attendance, while Viewer Spotlight removes queued/cooldown data and hides an active card. Restart coverage also proves Spotlight never restores presentation identity or replays an old card.
- Hardened optional add-on dependency isolation: an absent dependency now fails only that optional module during startup instead of preventing the module registry from being constructed, while required modules still fail closed. Viewer Spotlight regressions also prove overlay publication failures do not stop core chat, core alerts, or unrelated add-ons, and its hosted overlay reconnects without replaying a stale card.
- Added browser-level Viewer Spotlight visual acceptance at 1920x1080 and a 520x280 cropped source. The shared add-on card host now uses height-aware spacing, typography, avatar sizing, and bounded title/detail lines so long Unicode names, maximum enabled fields, missing avatars, and transparent backgrounds remain crisp and contained.
- Added Viewer Spotlight's first privacy-gated slice as a standalone Viewer Foundation and Community Analytics consumer. A self-only `!card` request can publish one temporary hosted card with creator-selected points, level, and honestly labeled observed counters; simulations and target arguments are rejected, provider projections are re-read before display, and the bounded queue never persists display names, avatars, raw platform IDs, or chat text. Its authenticated wizard preview uses saved appearance/field switches with fake values, while its creator-only manual display resolves a stable account through Viewer Foundation and requires an existing analytics observation before entering the same bounded queue. Paid reward requests remain gated until fulfillment/refund behavior is explicit.
- Added Community Analytics as an optional Viewer Foundation consumer. It records bounded cross-platform session attendance and interaction counters, labels lifecycle-missing sessions as approximate, skips bots/system actors/ignored stable accounts/simulations, fingerprints replays, and stores no chat text, display names, raw platform IDs, money, or provider payloads. Its authenticated local-wizard administration provides aggregate active/recent session summaries, one-viewer privacy export, confirmed deletion, and local size-bounded session JSON plus pseudonymous viewer CSV downloads through the same serialized state queue. A permission/dependency-gated broker service exposes only bounded pseudonymous viewer counters and active aggregate-session projections to future consumers such as Viewer Spotlight.
- Began Viewer Foundation as an optional add-on rather than restoring archived viewer state to core. It provides per-install salted pseudonymous IDs, explicit stable-ID-only account links, fixed replay-safe progression awards, per-viewer chat cooldowns, bounded private state, guided settings, and a documented privacy threat model. A narrow broker service exposes schema-bounded projections and idempotent audited mutations only to permissioned add-ons that declare the foundation dependency. Its authenticated local-wizard administration now supports live status, bounded privacy export, audited point corrections, and confirmed deletion through the provider's serialized atomic state queue.
- Reorganized all thirteen optional Streamer.bot packages into one dedicated `THSV Addon - <Name>` group per add-on. Core receiver, platform intake, administration, and shared output actions retain their framework groups. Every affected `.sb` import was regenerated from its reviewed manifest/source, and a repository test now prevents add-ons from collapsing back into one catch-all group.

## [2.4.2] - 2026-07-26

- Renamed Starting Soon Countdown to Stream Launch Countdown. It can run exactly one creator-approved triggerless Streamer.bot action when a real countdown reaches zero, with an optional bounded delay, at-most-once persistence, a five-minute stale-action cutoff, and preview-safe Complete Now behavior. Subathon Timer remains a separate event-driven timer.
- Regenerated four stale Streamer.bot imports and added a repository-wide byte-for-byte cohesion test so every checked-in `.sb` package must match its current manifest and C# source. C# line endings and the gzip operating-system marker are canonicalized before export so clean Windows and Linux checkouts produce identical imports.
- Added explicit bridge-release compatibility bounds alongside the stable add-on API contract. Official add-ons built for a newer or older host are now rejected with an actionable update message instead of installing into an incompatible core.
- Fixed packaging-only add-on upgrades so completed historical data migrations are not demanded or rerun when no migration exists in the current upgrade path.
- Aligned the core, all thirteen first-party add-ons, all Streamer.bot manifests/imports, the add-on update index, and the portable Windows installer to `2.4.2`.
- Bumped the browser-overlay SharedWorker identity to `1.3.2` while retaining the previous asset route, preventing OBS, Meld, Streamlabs, and ordinary browsers from reusing stale cross-release overlay transport code. Added a hosted add-on preview rendering regression check.

## [2.4.1] - 2026-07-26

- Added Stream Launch Countdown (originally named Starting Soon Countdown) as a separate optional add-on with any-duration scene controls, persistent bounded state, a customizable core-hosted `/overlay/countdown` source, a custom completion message, local tone choices including silence, and seven narrowly allowlisted Streamer.bot controls: Start, Stop, Pause, Resume, Reset, Complete Now, and Set & Start.
- Added optional stream-scoped Raid Scout viewer suggestions through one creator-owned Twitch Channel Points reward, with bounded deduplication, one-suggestion-per-viewer controls, fulfillment/refund handling, creator messages, and automatic clearing between streams.
- Reorganized the wizard's platform, blocker, command, chat, alert, reward, timed-action, and add-on setup surfaces into short guided sections while preserving collapsed-section state after saves and reloads.
- Improved Timed Actions with separate message cards per selected platform and automatic removal of messages belonging to disabled delivery platforms.
- Aligned core, all first-party add-ons, and every Streamer.bot import to the `2.4.1` release baseline.

## [2.4.0] - 2026-07-23

- Aligned the bridge, all 12 first-party add-ons, and all 24 Streamer.bot packages to one visible `2.4.0` release baseline while preserving the independently versioned `2.0.0-preview.1` add-on/event API contract.
- Added a repeatable `release:sync-version` guard that updates package/import names, removes stale `.sb` files, and recalculates every add-on integrity hash; a release-cohesion test prevents future drift.
- Added Quote Vault as a separate cross-platform add-on and optional Streamer.bot control package. Twitch, YouTube, Kick, and TikTok share one bounded local library with random/ID/search retrieval, viewer submissions, moderator approval/rejection/editing, recoverable deletion, source-only responses, Twitch reply capture, exact ignores, duplicate/link/spam gates, starter quotes, and no ordinary-chat retention.
- Added Discord Chat Archive as a separate disabled-by-default add-on and Streamer.bot import. It copies selected normalized Twitch, YouTube, Kick, and TikTok public chat to one private Discord webhook with exact ignore rules, bot/system/command/simulation gates, bounded in-memory batching and retries, mention neutralization, one-use approved-action delivery, and no local transcript or StreamBridge webhook storage.
- Added guided Random Clip Player settings, split oversized Subathon visual controls into layout and color sections, and added Expand all/Collapse all controls to every add-on settings page.
- Added a repository-wide wizard UI contract test requiring introductions, unique collapsible sections, complete one-time field coverage, an open quick-start section, and at most 12 fields per section.
- Improved core and add-on update checks with direct trusted GitHub asset links, exact package names, SHA-256 display, compatibility and revocation state, and explicit creator-controlled installation guidance. No update silently executes or enables code.
- Regenerated every first-party Streamer.bot import from its reviewed source at the unified release version.

## [2.3.1] - 2026-07-22

- Fixed transient Windows `EPERM`, `EBUSY`, `EACCES`, and `ENOTEMPTY` file locks during portable upgrades and rollback by applying bounded retry and backoff to atomic directory and manifest swaps.

## [2.3.0] - 2026-07-22

- Added Scene Actions `1.0.0`: one documented OBS Studio, Streamlabs Desktop, and Meld Studio scene-change intake normalizes `stream.scene-changed` through the existing Streamer.bot WebSocket. A guided wizard editor maps exact scene names to creator-approved stable action IDs, with editable starter actions, optional delays, duplicate suppression, loop-rate protection, and Trigger Test safety. The same scene events now make core Timed Action scene gates operational without another connection.

- Added First Five `1.0.0`, a Twitch Channel Points queue that opens five sequential creator-owned rewards, rejects duplicate viewers across every position, serializes redemption decisions, refunds failed or invalid claims, keeps a private monthly leaderboard, and exposes creator-controlled reset actions.

- Added Raid Scout `1.0.0`, a Twitch-only preferred/followed-live/same-category raid finder with bounded Helix discovery, creator-ordered sources, viewer/language/category/tag filters, similar-size preference, stream-based repeat protection, shuffle rotation, expiring suggestions, creator Confirm/Cancel controls, private history, and a configurable Next Stop browser card. Suggest then confirm is the default; automatic raiding is an explicit advanced opt-in.

- Added Fan Crown `1.0.0`, a Twitch-only rotating Channel Points crown with actual-spend monthly rankings, fixed or multiplier pricing, current-holder and cooldown rules, serialized redemption decisions, replay protection, refund-on-failure behavior, creator-approved Streamer.bot mutations, manual reset actions, editable chat messages, and a configurable hosted overlay card.

- Added concise official add-on overlay URLs (`/overlay/shoutouts`, `/overlay/clips`, and `/overlay/subathon`) while preserving existing module-ID URLs, and added per-trigger Twitch visual controls for raid, approved first-chat, and manual shoutout paths.

- Changed Automated Shoutouts to `1.1.0` with Twitch-only visual modes: an editable verified profile card or a bounded random clip. Clip retrieval uses Streamer.bot's supported `GetClipsForUser` and `TwitchGetClipDownloadUrls` methods, respects creator-set age/duration/popularity, mute, and volume controls, and can fall back to the profile card. YouTube, Kick, and TikTok remain chat-only, and no OBS scene mutation, undocumented Twitch GQL call, permanent clip file, or extra WebSocket is introduced.

- Changed Ko-fi Donations to `1.0.1` with a short Streamer.bot-first setup checklist, collapsed connection/privacy/presentation/safety sections, direct official setup links, and explicit guidance showing where Ko-fi alerts and optional chat activity are configured. The Alerts page now also explains the supported Ko-fi prerequisite and the reason Streamlabs intake remains pending.
- Added the Ko-fi Donations add-on and its separate Streamer.bot import. Ko-fi payments require the documented stable `messageId`, keep private supporter content out of public alerts, and enter the normal validated, deduplicated, durable delivery pipeline through a narrowly scoped provider permission.
- Added a manual, read-only wizard add-on update checker. It validates the official GitHub release index, reports compatible updates, publisher mismatches, unlisted packages, and revocations, and never downloads, installs, enables, or disables an add-on automatically.
- Hardened User Translate and Auto Translate so their Streamer.bot actions reject third-party provider responses larger than 256 KiB before JSON parsing.

- Wizard/Roadmap: Auto Translate settings are split into shorter setup sections (start, audience, languages, chat message, safety limits, chat rate limits, final review) so the add-on is not one dense limits panel. The future add-on roadmap now places Ko-fi/Streamlabs providers before Community Analytics and Multi-platform Subathon, then Free Game Check and utility packs after the financial/provider foundation.
- Add-ons: package descriptors now support HTTPS-only publisher source, support, update, and revocation metadata. Release packaging now emits a GitHub-hosted add-on index plus checksum so future add-on updates can be reviewed from one manifest without silent installs.
- Added: Automated Shoutouts `1.0.0` as a separate executable add-on. Twitch raids, first-chat creators, and manual targets are promoted only after Streamer.bot returns a non-empty extended-user category; an allowlisted Twitch first-time chatter with a verified empty category receives a separate editable viewer welcome exactly once instead. YouTube, Kick, and TikTok automatic first-chat messages are platform-specific welcomes because their documented integrations do not expose an arbitrary chatter category. Moderator commands, source/selected routing, editable per-platform templates, stable-identity ignores, persisted cooldowns, a bounded expiring queue, hosted cards, an optional native Twitch shoutout, and strict single-message destination limits are included. Simulated events never post live or call Twitch.
- Wizard: add-on settings now support creator-defined collapsible sections, switch controls, checkbox selectors for enumerated lists, shorter text editors, plain-language option labels, and conditional fields. Automated Shoutouts uses eight guided sections instead of one long settings card.
- Compatibility: reviewed Streamer.bot `1.0.5-alpha.32`. It is now recommended for new installs because of EventSub, authentication, backup, pending-action, and C# editor stability fixes. Existing packages retain `1.0.5-alpha.31` as their live-verified minimum because alpha.32 does not remove a C# contract they use; a fresh live acceptance pass remains pending. Native Platform Intake `1.5.1` now preserves the known `firstMessage` flag so first-ever-viewer welcomes fail closed when history is unavailable.

## [2.2.0] - 2026-07-22

- Added six independently downloadable add-ons with matching Streamer.bot imports: Random Clip Player, Automated Shoutouts, User Translate, Auto Translate, Ko-fi Donations, and Subathon Timer.
- Added a core-owned Subathon timer overlay with responsive styling, editable font/background/opacity, platform-specific event rules, durable timer state, and narrowly allowlisted Start, Pause, Resume, Reset, and Add Time Streamer.bot controls.
- Added a manual, read-only add-on update checker with publisher, compatibility, revocation, and checksum validation. Updates never install themselves.
- Improved add-on settings with guided collapsible sections, conditional fields, toggles, selectors, clearer privacy notes, and exact creator-approved Streamer.bot action grants.
- Hardened native platform intake, add-on relay boundaries, hosted overlay topics, translation response limits, stable financial-event identity, and provider-specific chat/alert routing.
- Changed release packaging so core and every add-on are separate, checksummed artifacts; each add-on archive contains its own `.thsv-addon`, matching `.sb`, setup notes, and update-index entry.
- Added Auto Translate as a separate, disabled-by-default add-on for creator-selected public chat and User Translate as an explicit-command-only add-on.
- Updated Native Platform Intake to relay only Streamer.bot's documented Twitch reply fields and restore `reply.msgBody` escaped spaces.

## [2.1.1] - 2026-07-21

- Security: completed a repository-wide trust-boundary pass. Streamer.bot relay frames are ignored until authenticated; add-on result relays use short-lived one-use module tokens; privileged framework actions cannot be granted to add-ons or selected by timed actions; browser WebSockets enforce loopback same-origin; localhost HTTP rejects hostile Host headers; add-on review/install closes package-swap races; regex blockers reject nested ambiguous quantifiers; and package/export paths are confined to their approved roots.
- Reliability: hardened durable delivery and deduplication persistence, including serialized enqueue commits, rollback on failed acceptance, corruption fail-closed behavior, and bounded receiver-side replay suppression. Launcher startup is serialized, custom service ports are honored by lifecycle and wizard launchers, and the wizard verifies the expected healthy service before opening.
- Changed: release packaging now discovers every valid folder under `addons/` and publishes each add-on as a separate versioned, checksummed, provenance-attested `.thsv-addon` asset. The published normalized-event JSON Schema now tracks runtime field bounds, presentation metadata, JSON-only values, and stable identity requirements.
- Added: Random Clip Player `1.4.0` fades the final frame for four seconds, then honors the creator's configured pause (so 60 seconds becomes a 64-second end-to-next-start gap). It still plays every eligible clip exactly once before fetching a fresh pool, and its Streamer.bot package now includes creator-triggerable Enable and Disable actions for scene automation.
- Fixed: the `thsv.addon` return relay is now an automatic internal bridge input whenever Streamer.bot is enabled. Existing creator configurations no longer need a synthetic `platforms.addons` entry, and a legacy entry is ignored rather than creating a duplicate listener.
- Fixed: Random Clip Player `1.3.0` keeps a bounded retry armed until the matching hosted overlay reports playback started. Stale download responses and lifecycle IDs cannot cancel or advance the active clip, loading time no longer consumes the clip-duration timeout, and creators can configure mute and volume.
- Security: `thsv.addon` envelopes must publish inside `addon.<moduleId>.*`; a Streamer.bot action for one add-on can no longer inject an event into another add-on's subscription namespace or a core event type.
- Fixed: add-on upgrade migrations now receive the configured private add-on state root in portable installations instead of incorrectly writing beneath the package directory. Random Clip Player declares a value-preserving migration from `intervalMinutes` to `secondsBetweenClips`.
- Fixed: Random Clip Player's executable entrypoint is no longer hidden by the repository-wide `dist/` ignore rule. Release automation now builds, checksums, attests, and uploads its optional `.thsv-addon` archive as a separate GitHub Release asset.
- Fixed: unsaved Approved Streamer.bot action selections remain intact when the Add-ons page refreshes; a successful save deliberately reloads the authoritative installed grants.
- Fixed: the combined browser overlay (`/overlay`, the default all-in-one route) never hid its connection-status badge once connected — unlike standalone Chat and Alerts, which already faded it out. Every overlay surface now shares one consistent pattern: a red "OFFLINE" badge while disconnected, a brief green "LIVE" flash on connect, then hidden. Add-on-hosted overlays (`/overlay/addons/<module-id>`) previously showed an always-visible amber badge that never matched this behavior at all; they now use the same colors and hide-when-connected logic as every other overlay. Documented as the required pattern for any future overlay surface in `docs/browser-overlay.md`.
- Added: a generic return path for add-ons that need a Streamer.bot action to hand data back — `streamerbot.run-approved-action` could dispatch an action but had no way to receive its result. A creator-approved action can now call `CPH.WebsocketBroadcastJson` with a `thsv.addon` envelope (moduleId, its matching namespaced eventType, and a bounded JSON payload), which reaches the requesting add-on's `onEvent` through the same event pipeline every other event type already uses. `StreamerBotAddOnRelayAdapter` is an automatic internal input and never appears as a creator platform.
- Added: Random Clip Player, the project's first real add-on beyond the reference examples — plays a random clip from the broadcaster's own Twitch clip library on a timer. Ships as a Streamer.bot action package (`packages/streamerbot/random-clip-player`, two actions: fetch the clip list, resolve a direct playable download URL per clip at play time) and a `.thsv-addon` package (`addons/random-clip-player`). No-repeat rotation resets once the pool is exhausted rather than going silent; failed/timed-out playback retries without being marked seen.
- Added: `ModuleRuntimeContextV2` now exposes `context.settings` — a creator's saved add-on settings (Wizard → Add-ons → Settings), validated against the add-on's own `configurationSchema` with defaults applied, delivered to the running module. Previously the wizard form validated and persisted settings but nothing read them back; every executable add-on's settings page was decorative. Threaded through `AddOnCapabilityBroker.contextFor`, `FrameworkModule`, and `loadInstalledAddOns` (which now also accepts the add-on state root, reusing the same schema-validation-with-defaults logic the wizard's settings form already used, exported rather than duplicated).
- Fixed: Random Clip Player's clip list was fetched once per restart and cached forever, so a clip created on Twitch after that first fetch would never enter rotation without a full StreamBridge restart. The clip list now refreshes whenever the whole rotation pool has been played through, using the settings plumbing above.
- Changed: Random Clip Player no longer plays clips on a fixed wall-clock interval. The next clip is requested a short configurable pause (default 5s, "Pause between clips") after the current one actually finishes — reported by the overlay itself — instead of on an independent schedule with no relationship to how long the current clip was. A failed/timed-out clip retries quickly; if Streamer.bot never responds at all, a 90-second safety net retries instead of stalling forever. Hardened to 1.3.0 with playback acknowledgement and correlated lifecycle handling.
- Fixed: both Random Clip Player Streamer.bot actions failed to compile (`CS0012: The type 'Object'/'DateTime' is defined in an assembly that is not referenced`). Streamer.bot's own `Twitch.Common.Models.Api` types (`ClipData`, `TwitchUserInfo`) are compiled against .NET Standard, which requires an explicit `netstandard.dll` reference alongside the usual `mscorlib.dll`/`System.dll`/`Newtonsoft.Json.dll` — a known Streamer.bot C#-action interop requirement, now added to both actions' references.
- Fixed: every StreamBridge startup logged a spurious "Installed add-on was rejected" error for the `data/addons/inbox` folder itself, which the add-on loader was scanning as if it were an installed package directory. The inbox holds pending, not-yet-installed archives and was never meant to be scanned this way; it's now excluded explicitly.
- Fixed: an add-on's previously-approved Streamer.bot actions showed as "· disabled or missing" any time the wizard hadn't re-inspected Streamer.bot in the current browser session — which is the normal state right after a restart, not a real problem, but read exactly like one. The Approved Streamer.bot actions list now distinguishes "not yet re-inspected this session" (with an inline hint to inspect first) from an action a live inspection genuinely no longer finds or reports as disabled.
- Added: the wizard now runs a Streamer.bot inspection automatically right after login, in addition to the existing manual Inspect button, so Command Sync, Timed Actions, and Add-ons' approved-action lists are populated without an extra click on a fresh session.
- Changed: an add-on's Approved Streamer.bot actions list is now an "add one at a time" picker (a dropdown of not-yet-approved inspected actions plus an Add button, with approved ones shown as a compact removable list below) instead of a checkbox next to every single action Streamer.bot reports — which on a real setup means every core THSV action, every command, and every other add-on's actions, all at once, to find the couple that matter.
- Changed: an installed add-on's Settings, Approved Streamer.bot actions, and Hosted overlay sections are now collapsible (`<details>`, matching the pattern already used in the Chat Overlay panel) instead of always-expanded — a single executable add-on with all three could run to 1300px+ of always-visible content, which will only compound as more add-ons are installed. Settings starts expanded since it's the most commonly used; the other two start collapsed. The overlay URL copy button and "Send preview card" testing action already existed and are unchanged in behavior, just relocated under the new "Hosted overlay & testing" section.

## [2.1.0] - 2026-07-20

- Promotes `2.1.0-rc.1` to stable with no code changes. The wizard-command chat-matching fix was live-verified against a real Streamer.bot instance before promotion.

## [2.1.0-rc.1] - 2026-07-20

- Fixed: wizard-imported commands (for example `!tips`) could show up correctly in Streamer.bot's own edit dialog — Enabled, correct Sources, correct Mode/Location, correct alias list — and still never fire from chat, while deleting and retyping the identical command by hand worked immediately. Diffed a real export of a working, hand-typed command against what the wizard generates and found two real structural bugs: (1) Streamer.bot's multi-line Command(s) field joins aliases with `\r\n`, not `\n` — the wizard was LF-only; (2) a hand-typed command carries an internal, comma-separated mirror of the same alias list in an undocumented property alongside the primary CRLF field, which the wizard never emitted at all. Also fixed a related, longstanding no-op: the "Ignore Internal Messages" option was being written to a property name (`ignoreInternal`) that doesn't exist in Streamer.bot's real export schema, so the toggle silently had no effect on any generated command; it's now written to the correct (obfuscated) property. See `bridge/services/streamerbot-package-builder.ts` for the full reverse-engineered field notes.
- Fixed: a custom-script wizard command whose creator pasted a full Streamer.bot action (its own `using` directives, `class CPHInline`, and `Execute()`) instead of just the response-method body produced a class nested inside a method — invalid C# that failed to compile, silently, with no message ever sending. Custom scripts are now generated as the body of a dedicated `BuildCustomResponse(...)` method that the real `Execute()` calls and dispatches through the same verified `SendToSource` helper as platform-message mode (so custom scripts get the correct Twitch/YouTube/Kick send-method signatures for free, and can return a message string, or call `CPH.*` themselves and return an empty string to skip the automatic send). The wizard now rejects a script containing `class CPHInline`/`Execute()` immediately, both client-side and server-side, with an explanation, instead of generating broken C#.
- Fixed: `channelId`/`channelName` on native platform intake (`RelayPlatform.cs`), and the `{channel}` template token in wizard-generated commands (`command-generation.ts`), silently resolved to an empty string on YouTube and Kick. Streamer.bot's broadcaster-username argument is spelled `broadcastUserName` on Twitch but `broadcastUsername` (lowercase "n") on YouTube and Kick, and argument lookups are case-sensitive; the code only ever tried the Twitch spelling, plus two names (`broadcasterUserName`, `broadcasterId`/`broadcaster`) that were never real Streamer.bot arguments on any platform. Since `channel.name` is a required, non-empty field in the normalized event schema, this meant every YouTube and Kick chat message or event relayed through native intake was silently rejected as invalid, not merely missing a display value. Verified directly against Streamer.bot's own documented variables for the Twitch/YouTube/Kick Chat Message and Command Triggered triggers; see the new reference table in `docs/streamerbot-csharp-references.md`. Native Platform Intake bumped to 1.5.0.
- Added: a live preview pane in the Chat Overlay editor showing four example messages across all platforms plus an event-message example, updating on every keystroke as layout, fonts, colors, message-background mode, and visibility toggles change — mirroring the Alerts editor's existing live preview. Never connects to a real overlay.
- Added: seven new Command Sync starter templates — Merch, PC specs / gear, VOD / replays, Emotes, Clip, Bot credit, and Timezone — alongside the existing nine, each pre-filled across all four platforms and ready to add straight to the batch.
- Changed: the Timed Actions templates (Social rotation, Hydration, Stretch) now set up a complete ready-to-stage timer — per-platform starter message rotations within each platform's character limit, first-run delay, and the bundled Send Timed Message action pre-selected as the target. Staging accepts the bundled action (and an edited timer's unchanged saved target) without requiring a fresh Streamer.bot inspection first; the drift column shows "not-inspected" until the next inspection verifies it. New-timer setup is now: Add timer → pick template → Apply → tick your delivery platforms → Stage → Commit.
- Added: the Bridge Launcher Streamer.bot actions (Launch/Shutdown) now raise a Windows toast notification with the result — "Bridge connected and healthy," "Bridge stopped," or the failure reason — since they intentionally run with no visible console window. Each run raises exactly one toast, and all THSV toasts share one id so Windows groups them under a single Action Center header instead of piling up. Per-event actions (chat, alerts, command, and platform intake) deliberately never toast. Bumped to 1.4.0.

## [2.0.0] - 2026-07-20

- Promotes `2.0.0-rc.4` to the stable v2 release with no code changes. The automated, clean-machine, and visual gates pass; a genuine live-stream, real-viewer soak of the high-impact provider-event matrix is still in progress, and high-impact operations without verified provider-stable IDs remain blocked at runtime regardless (see [production-readiness](docs/production-readiness.md)).

## [2.0.0-rc.4] - 2026-07-20

- Changed: the release archive is now named `THSV-StreamBridge-<version>.zip`, dropping the `-windows-x64` suffix for a shorter download name. Windows x64 remains the only supported target, and the in-app update checker accepts both the new and the old asset names.
- Added: a `slothbloom.com` link in the wizard header ("A Slothbloom project") and a matching byline at the top of this README, so creators configuring the bridge see where it comes from. No functional or architectural change — StreamBridge remains entirely local, with no accounts and no hosted component.
- Added: alert layout and media placement presets. Each alert card now has an independent text layout (Classic — avatar left/text right, unchanged default; Stacked — avatar above centered text; Centered — no avatar) and media placement (Behind — full-bleed dimmed, unchanged default; Below — an undimmed banner strip beneath the text; Inset — a small undimmed box in the avatar's spot, or centered above the text for the Centered layout). The two choices combine freely and are configurable per alert type from the Alerts editor, with the live preview pane reflecting both.
- Changed: a wizard-wide visual pass across every panel — a real button hierarchy (primary/ghost/danger, previously all buttons looked identical), hover/focus transitions, themed scrollbars, purple-accented native checkboxes, rotating chevrons on collapsible sections, and consistent card/typography spacing.
- Changed: long descriptive paragraphs (Advanced Blockers, Command Sync, Rewards, Add-ons) now collapse to two lines with a "Show more" toggle instead of always taking full space. The Platforms tab's per-card "Input enabled"/"Output enabled" explanations — identical text repeated on all six platform cards — moved to a hover tooltip, cutting each card by about four lines.
- Added: alert cards can now use an animated GIF or a short uploaded background video (MP4/WebM, up to 5 MB) instead of a static image, with the video's own embedded audio replacing the alert's separate sound setting — "an mp4 with its own song," per the original request. Uploads are validated by file signature (not just declared content type), and an image and a video can't be set on the same card at once. Fixed two real, previously-unnoticed bugs found while wiring this up: neither the alert overlay page's nor the wizard's own Content-Security-Policy had a `media-src` directive at all, which — under CSP's fallback rules — silently blocked *all* audio and video playback on both pages, including the pre-existing custom alert sound upload feature.
- Added: a live preview card directly inside the Alerts editor, showing the title/detail templates (filled with example values), card color, font, and background image/GIF/video as you edit — updating on every keystroke — so a creator can see roughly what an alert will look like without opening OBS or Meld. This is separate from "Fire test alert," which still sends the real design to a connected overlay.
- Added: the Rewards panel remembers the platform and Reward ID from each successful live operation (locally, in the browser) and offers them back as one-click quick-select chips, so a creator doesn't have to keep the reward GUID copied on the side. Also added inline explanations for which operations need only a Reward ID versus which also need a Redemption ID.
- Fixed: the Overview panel's heading read "Stage 8 configuration" — leftover internal build-stage numbering with no meaning to a creator — now "Setup overview".

- Windows release lifecycle launchers now remain visible with explicit results, the release-only installer shortcut is no longer copied into installed layouts, and uninstall tolerates directory-handle locks by preserving creator data while deferring application-only cleanup until its window closes.
- Fixed: uploaded overlay backgrounds and sounds were being written under the disposable, per-version app folder instead of the persistent data root, so they were silently deleted on every upgrade; they are now correctly anchored to the configured data root.
- Fixed: the Bridge Launcher Streamer.bot actions (Launch/Shutdown) reported success as soon as a process handle existed, without waiting for the launcher to actually confirm the bridge started or stopped; they now wait for the launcher to finish and check its exit code before reporting success. Bumped to 1.3.0.
- Fixed: the portable installer's Start launcher could force-terminate an unrelated process if a stale PID file happened to be reused by Windows after an unclean shutdown; it now verifies the recorded PID is actually the bundled runtime before ever signaling it.
- Fixed: native platform intake (`RelayPlatform.cs`) hardcoded the literal item name "Kick Gift" as the default for every platform and event type, leaking into unrelated events (YouTube subscriptions, memberships, etc.).
- Fixed: Twitch/Kick reward redemptions were rejected as lacking a stable event ID even though Streamer.bot provides `redemptionId`; it's now used as a valid fallback.
- Fixed: YouTube Super Chat and Super Sticker were rejected despite carrying valid amount/currency data, because Streamer.bot hands the amount over pre-formatted (e.g. `"$42.00"`) and nothing stripped the currency symbol before validation. Also fixed `quantity` incorrectly inheriting that same formatted amount when no other quantity field was present.
- Fixed: Twitch Subscription, Resubscription, Gift Subscription, and Gift Bomb alerts never fired because these Streamer.bot triggers expose no message/event ID at all (confirmed via a full Action History argument dump, not assumed). The relay now builds a deterministic ID from fields that cannot repeat for a genuinely new event, explicitly flagged as unverified rather than platform-native.
- Fixed: Kick's "Kicks Gifted" trigger was silently unsupported because Streamer.bot's real event name is `KickKicksGifted`, not `KickGifted` as previously assumed everywhere in the codebase (relay, normalization, overlay display, and manifest).
- Fixed: YouTube Membership Gift alerts never fired because its real stable ID is exposed under the argument name `id`, not any of the previously-checked `messageId`/`msgId`/`eventId` names.
- Fixed: Kick Subscription, Resubscription, and Gift Subscription alerts never fired for the same no-platform-ID reason as their Twitch equivalents; extended the same deterministic, honestly-flagged fallback-ID mechanism to them using Kick's real available fields (`expiresAt`, `recipient.userId`, `subscribedAt`).
- Fixed: Kick's "Kicks Gifted" item name and quantity now read from the real argument names (`kicks.name`, `kicks.amount`) instead of the generic fields that were never actually populated for this trigger.
- Improved: YouTube monetary amounts now prefer the platform's integer micro-units field (`microAmount`) over string-parsing the pre-formatted currency display value, avoiding any risk from thousands-separator or locale formatting; conversion uses integer arithmetic only, never floating point.
- Fixed: Kick Mass Gift Subscription alerts never fired for the same no-platform-ID reason as the other Kick subscription-family triggers; extended the fallback-ID mechanism using the gifter's userId plus the shared `subscribedAt` timestamp, confirmed against Streamer.bot's own published variable reference rather than a live test (its test trigger currently crashes Streamer.bot before any data can be captured). Its recipients are indexed arrays (`recipient.0.userId`, `recipient.1.userId`, ...), unlike single Gift Subscription, so no recipient field is used in the fallback ID.
- Improved: the wizard's Alerts panel now explains what each alert template token (`{actor}`, `{amount}`, `{itemName}`, etc.) actually means and when it's populated, instead of showing a bare comma-separated list of token names with no context.
- Changed: alert presentation profiles are now scoped per platform *and* event (`alerts.profiles.<platform>.<alertType>`) instead of per event only, so, for example, Twitch Follow and Kick Follow can have entirely independent titles, sounds, and durations. This is a breaking configuration-schema change with no migration shim, since the shipped config's alert profiles were still empty; anyone who had already customized alert profiles in a preview build will need to re-enter them under the new per-platform layout. The wizard's Alerts panel was rebuilt around this: a platform-grouped event tree replaces the old flat card list, each event has its own inline enable/disable toggle, and a single "Fire test alert" action replaced the old scattered per-card preview buttons and the redundant alert-type/platform preview form.
- Changed: the Command Sync and Timed Actions wizard panels were rebuilt around the same list-plus-editor pattern as Alerts — a left-hand list (tracked commands / queued batch entries, or configured timers with an inline enable toggle) and a right-hand editor form that only appears when adding or selecting an item, instead of one long always-visible form stacked above a flat card list. The Chat Overlay panel's single long settings form is now grouped into collapsible sections (Layout & text, Canvas & message cards, Branding & visibility, Chat events, Ignored names) instead of one continuous field list. The wizard's left navigation is now sticky so it stays reachable while scrolling a long panel. The "Inspect now" and "Sync now" buttons were renamed to "Inspect" and "Sync". Also removed two dead, unreachable duplicate form-submit handlers left over from an earlier command/timer design that a `stopImmediatePropagation()` in the real handler had silently prevented from ever running.
- Changed: the wizard's Platforms panel now renders each platform as a compact, evenly spaced card instead of a single grid row that let long capability lists wrap unpredictably. Provider capabilities are shown as small badges instead of a raw comma-separated line, and each of the three toggles (Platform enabled, Input enabled, Output enabled) now has a plain-language explanation of what it actually does — including that Output enabled is honestly disclosed as reserved for future features and not yet enforced by any current adapter, rather than implying it already gates something it doesn't.
- Changed: the Advanced Blockers wizard panel was rebuilt around the same list-plus-editor pattern as the other panels — a left-hand rule list with an inline enable toggle and delete button, and a right-hand form that only appears when adding or selecting a rule. Existing rules can now be edited in place (previously the panel could only add or delete a rule, never edit one, and its own ID was preserved across an edit instead of being regenerated from a possibly-changed name). The Scope, Target, and Match dropdowns now each carry an inline plain-language explanation instead of leaving that distinction only in the panel's intro paragraph. Fixed a bug found in testing: toggling or deleting a rule while none was selected for editing left a stale status message on screen because `stageFilters()`, unlike every other panel's stage function, never wrote its own confirmation text.
- Fixed: `docs/integration-assumptions.md`'s "Production platform alert matrix" and `docs/production-readiness.md`'s preview-limitations note still described Twitch/YouTube/Kick as placeholder transports with no verified event mapping, which was stale — both now reflect the native Streamer.bot relay intake and the specific alert types whose field/ID mapping has been corrected against real Action History argument dumps, with the one exception (Kick Mass Gift Subscription) still called out explicitly since its live test trigger crashes Streamer.bot.

## [2.0.0-rc.3] - 2026-07-19

### Changed

- The public Windows installer now explains its local verification and privacy behavior, displays an unmistakable success or failure summary, and waits for the creator before closing.
- The public Windows uninstaller now explains exactly what is removed and preserved, displays an unmistakable success or failure summary, and waits for the creator before closing and removing its own wrapper.

## [2.0.0-rc.2] - 2026-07-19

### Changed

- Windows-only PowerShell acceptance tests skip on Linux, and the Windows CI matrix runs them under Windows PowerShell 5.1 so its native cmdlet/module environment matches supported installations.
- Real PowerShell backup/restore integration tests have an explicit hosted-runner time budget without weakening their assertions.
- Durable-delivery retry assertions tolerate hosted-runner scheduling delays while still requiring the event to reach the dead-letter queue.
- GitHub-hosted CI and release workflows use the current Node 24-based checkout, setup-node, and artifact-upload actions.

### Fixed

- Safety backups combine a readable timestamp with a random suffix so an immediate restore cannot collide with a backup created in the same second.

## [2.0.0-rc.1] - 2026-07-19

### Added

- Stage 9 v2 add-on descriptors with complete SHA-256 file manifests, compatibility bounds, safe-path validation, atomic creator-approved install/remove operations, and runtime manifest matching.
- A verified no-op reference add-on, optional-module discovery, failure isolation, public developer documentation, and add-on install/remove tests.
- Hashed backups that include installed add-ons plus an approval-gated, verified, staged restore workflow with rollback.

### Changed

- Promoted the v2 Windows distribution to a public release candidate with a self-contained installer, SHA-256 manifest verification, SBOM generation, and GitHub artifact attestations.
- Preview and release-candidate tags now publish as GitHub prereleases and cannot replace the latest stable release.
- Updated public documentation to reflect the durable output outbox, restart replay, bounded retry, and dead-letter behavior that is now implemented.
- Windows launchers and the setup wizard now accept valid JSON configuration files saved with a UTF-8 byte-order mark by common Windows editors.
- The public Windows uninstaller now normalizes its trailing installation-path separator before handing the path to Node, preventing a quoted-path failure during removal.
- JavaScript release assets are pinned to LF checkout semantics so add-on manifest sizes and hashes remain reproducible on Windows GitHub runners.
- CycloneDX release SBOMs are written as BOM-free UTF-8 JSON for GitHub attestation compatibility on Windows PowerShell 5.1.

### Safety

- High-impact provider events still require provider-stable event IDs; unverified TikFinity financial and progression use remains blocked during RC acceptance.

## [2.0.0-preview.1] - 2026-07-17

### Added

- Parallel v2 preview contracts for normalized events, chat, commands, alerts, timed actions, rewards, capabilities, module manifests, configuration extensions, module health, and browser overlays.
- A strict core-only v2 configuration schema and non-writing v1-to-v2 migration preview that enumerates excluded configuration/state before extraction.
- Revised product-scope, contract-boundary, and module-system documentation.
- Stage 2/3 migration acceptance criteria from the independent Stage 1 review.
- A manifest-validated module registry with dependency ordering, event subscriptions, isolated lifecycle failures, and per-module health.
- Built-in Chat, Commands, Alerts, and Timed Actions module registrations plus registry acceptance tests.

### Changed

- Completed the Stage 1 adapter inventory with the Streamer.bot relay and package-envelope helpers and explicitly retained the timed-actions control script.
- Archived Viewer Progression, Bloom Companion, and Speaker.bot implementations under `archive/future-add-ons` and removed their runtime, HTTP, configuration, event, overlay, and Streamer.bot argument dependencies from core.
- Rebuilt the Core Receiver and Multi-Commands imports as `2.0.0-preview.1` without viewer-progression identity arguments.
- Startup now emits a structured warning listing any archived `viewerIdentity`, `companion`, or companion-overlay configuration paths that were safely ignored, while preserving their state for creator review.

### Safety

- Stable `main` remains unchanged. Legacy config keys load without reactivation, migration preview is non-writing, and upgrade/uninstall flows preserve excluded state until explicit creator deletion.

## [1.0.1] - 2026-07-17

### Added

- Explicit SemVer downgrade protection with an intentional `-AllowDowngrade` escape hatch and backward-state warning.
- Bloom image-generation provenance, asset-license scope, trademark boundary, and direct production dependency notices.
- A centralized compatibility and platform-support matrix linked from first-run and troubleshooting documentation.

### Changed

- Release packaging now includes `THIRD-PARTY-NOTICES.md` and tests its presence.

## [1.0.0] - 2026-07-17

### Added

- Checksummed Windows release manifests and adjacent SHA-256 archive files.
- A staged public-release installer with custom-path support, hash verification, production-only dependency installation, configuration bootstrap, state-preserving upgrades, and rollback on final-swap failure.
- A managed uninstaller that preserves creator data by default and requires an explicit switch to remove it.
- A production-safe PowerShell simulation helper that does not require development dependencies.
- Automated Windows lifecycle coverage for install, upgrade, tamper rejection, data-preserving uninstall, and full removal.

### Changed

- Public release documentation now distinguishes source setup from archive installation and states the license and production-transport publication boundaries.
- The project is now licensed as open-source software under the MIT License.
- The accepted release candidate is promoted to the first stable public release.

## [0.12.2] - 2026-07-17

### Fixed

- Kept Bloom's raised-arm celebration poses inside their sprite cells so the jump no longer clips the head or leaves neighboring-frame artifacts.
- Added a sprite-generation boundary check that rejects any future pose that would escape its fixed cell.

## [0.12.1] - 2026-07-16

### Added

- Eight-frame registered animations for Bloom idle blinking, waving, eating, sleeping, waking, and celebrating.
- Persistent sleep state and a free `!bloom-wake` interaction that reverses the sleep transition.

### Fixed

- Normalized every sprite to a fixed square cell, centerline, baseline, and face scale so poses do not stretch, shrink, slide, or bleed into adjacent frames.
- Removed detached generation fragments and replaced the artificial berry and eyelid overlays with fully drawn poses.

## [0.12.0] - 2026-07-16

### Added

- Bloom Companion with unified progression spending, creator-configured commands, cooldowns, bounded shared stats, and atomic local state.
- Wave, eat, sleep, and celebrate animations in an independent shared-WebSocket browser source.
- A projection-only Streamer.bot package and authenticated PowerShell visual-test helper.

### Fixed

- Companion persistence failures roll state back and automatically refund spent points.
- Derived commands receive their trusted bridge sequence before companion validation.

## [0.11.1] - 2026-07-16

### Added

- Loopback-only authenticated viewer progression add, remove, reset, and deletion controls with required operator and reason audit fields.
- A PowerShell administration helper for bounded moderator corrections and verified privacy deletion requests.

### Fixed

- Serialized progression administration with ordinary awards so adjustments and deletion cannot race the state writer.
- Viewer deletion now removes matching creator-configured account links and rolls them back if progression persistence fails.

## [0.11.0] - 2026-07-16

### Added

- Native Streamer.bot intake actions and normalized adapters for Twitch, YouTube, and Kick chat, follow, subscription, gift, raid, cheer, and paid-message triggers.
- Dedicated Streamer.bot action groups for Twitch, YouTube, Kick, and TikTok while reusing one authenticated WebSocket connection.

### Changed

- Standardized TikFinity action names under the `THSV TikTok - ...` naming scheme.

### Removed

- Removed Facebook from the platform schema, configuration, fixtures, documentation, and test matrix because it is no longer an implementation target.

## [0.10.3] - 2026-07-16

### Fixed

- Subscribed the shared Streamer.bot connection to `General.Custom` events before reporting it ready, allowing `WebsocketBroadcastJson` TikFinity relays to reach StreamBridge.
- Unwrapped Streamer.bot's live custom-event envelope before validating and normalizing TikFinity events.
- Added an integration regression test for the actual Subscribe acknowledgement and `General.Custom` wire shape.

## [0.10.2] - 2026-07-16

### Added

- A TikFinity input adapter that receives allowlisted event broadcasts over StreamBridge's existing authenticated Streamer.bot WebSocket connection.
- A four-action TikFinity Intake package for chat, follow, gift, and like mappings already configured in the adopted TikFinity profile.
- Safe TikFinity chat/alert normalization with bounded fields, simulator-default provenance, visible unverified-field markers, and no raw payload retention.

### Changed

- The example TikTok platform now uses the `tikfinity-streamerbot` adapter while remaining disabled until its Streamer.bot package is imported and tested.
- The Streamer.bot export builder now supports reviewed multi-action packages without changing existing single-action exports.

## [0.10.1] - 2026-07-16

### Fixed

- Isolated Viewer Identity and Progression from bridge availability: corrupted state now degrades only that subsystem while chat, commands, alerts, timed actions, and overlays remain active.
- Continued accepting and delivering valid events when progression persistence fails, disabled further progression work for that run, and exposed the failure through structured logs and diagnostics.
- Added bridge-level regression coverage for corrupted startup state and runtime progression write failure.

## [0.10.0] - 2026-07-16

### Added

- Explicit creator-configured cross-platform account links with stable platform-scoped pseudonyms for unlinked viewers.
- Atomic, duplicate-bounded local progression state with fixed event points, cross-platform cooldowns, configurable levels, and default exclusion of simulated/bot/system activity.
- Derived `viewer.progression` events plus Core Receiver `1.0.4`, Multi-Commands `1.1.0`, and Viewer Progression `1.0.0` Streamer.bot packages.
- Privacy and recovery documentation for viewer identity state, link configuration, testing, and backups.

## [0.9.9] - 2026-07-16

### Fixed

- Bounded waiting alerts, skipped malformed alert cards without freezing the queue, made combined branding configurable, and exposed standalone reconnect status.
- Hid broken avatars and documented Browser Source refresh and scene-lifecycle behavior.

## [0.9.8] - 2026-07-16

### Fixed

- Limited standalone Chat to eight visible cards by default and faded the oldest card when the next message arrives.
- Added a larger bottom-safe area so the newest chat card remains fully visible after a browser source is cropped.

## [0.9.7] - 2026-07-16

### Fixed

- Applied the standalone Chat clarity treatment to Alerts with an opaque high-contrast card, crisp type, and an opacity-only entrance.
- Made standalone Alerts use a centered, bounded card on a full 1920 by 1080 browser canvas so broadcasting apps can crop transparent space without squeezing the webpage.
- Versioned the shared browser-event worker so updated overlay pages cannot remain attached to a stale event session after a source reload.

## [0.9.6] - 2026-07-16

### Fixed

- Replaced translucent blur on standalone Chat cards with an opaque high-contrast surface for crisp browser-source text.
- Made the Chat container fit narrow and wide source viewports without stretching text or changing card proportions.
- Replaced the translated arrival animation with an opacity-only transition to avoid compositor softening after messages settle.

## [0.9.5] - 2026-07-16

### Fixed

- Made the plain `/overlay/chat` URL use the Meld-safe, full-canvas layout without query-string sizing parameters.
- Removed vertical scale compensation so chat cards preserve their proportions at every browser-source size.
- Increased standalone chat readability with responsive card widths, spacing, names, labels, and message text.
- Disabled browser caching for overlay assets and added query-safe HTTP routing so broadcasting apps reliably receive overlay updates.

## [0.9.4] - 2026-07-16

### Fixed

- Added a canvas-native Chat layout for Meld Studio so its editor-controlled browser viewport no longer compresses chat inside a tall layer.
- Preserved the fill-source layout as `?layout=compact` for OBS Studio, Streamlabs Desktop, and hosts with explicit browser viewport sizing.

## [0.9.3] - 2026-07-16

### Fixed

- Kept the standalone Chat source transparent when empty and bottom-anchored message cards instead of stretching the chat panel across the entire browser-source canvas.

## [0.9.2] - 2026-07-16

### Added

- Independently movable Chat-only and Alerts-only browser-source URLs alongside the existing combined overlay.
- A same-origin `SharedWorker` that multiplexes separate overlay sections over one WebSocket when supported, with a safe direct-connection fallback for isolated browser-source hosts.

## [0.9.1] - 2026-07-16

### Changed

- Generalized Meld-specific naming into the Browser Overlay Hub for Meld Studio, OBS Studio, Streamlabs Desktop, and compatible Chromium/CEF browser sources.
- Renamed creator configuration to `browserOverlay` while automatically migrating the deprecated `meldOverlay` key.
- Preserved the existing `http://127.0.0.1:8787/overlay/` URL and event contract.

## [0.9.0] - 2026-07-16

### Added

- Local cross-compatible Browser layer/source and loopback-only public event WebSocket.
- Context-safe unified chat with bounded retention and moderation/deletion correlation.
- Priority-aware visual alert queue with explicit subscription lifecycle and gift provenance fields.
- HTTPS avatar/badge metadata, validated name colors, role badges, bot and simulated-event controls.
- Browser CSP, projection, injection-sink, fixed-asset, and live loopback WebSocket tests.

## [0.8.1] - 2026-07-16

### Added

- Timed actions remain dormant until an explicit session start or normalized `stream.online` event.
- Multi-platform live tracking stops timers only after every observed live platform goes offline.
- Token-protected runtime start, stop, pause, and resume endpoints plus a PowerShell operator script.
- Pause freezes the remaining interval instead of creating catch-up promotional messages.

## [0.8.0] - 2026-07-16

### Added

- Session-relative local scheduling with independent creator-configured minute intervals.
- Persistent shuffle-container message selection with no repeats until every configured message is used.
- Streamer.bot timestamp parsing preserves ISO strings instead of allowing Json.NET date coercion.
- Explicit skip or single-catch-up behavior with occurrence, missed-run, and lateness diagnostics.
- Atomic completed-occurrence state and deterministic scheduled-event identities.
- Platform-neutral `system.timed` projection and a triggerless concurrent Multi-Timed Actions Streamer.bot package.
- Deterministic scheduler, persistence, contract, safety, fixture, and export-integrity tests.

## [0.7.1] - 2026-07-16

### Changed

- Speaker Orchestration now requires a positive CPH transport result before reporting `speakerDispatched=True`.
- Dispatch documentation distinguishes local UDP send success from voice-alias validation, engine acceptance, audio generation, and playback.
- Creator-side cooldown, stable request-ID deduplication, URL/markup transformation, and speak serialization responsibilities are explicit; priority, caption timing, and audio ducking are carried into the appropriate future milestones.

## [0.7.0] - 2026-07-16

### Added

- Platform-neutral Speaker.bot orchestration contract for speak, stop, pause, resume, and clear operations.
- Triggerless, concurrent Streamer.bot package using the official `TtsSpeak` integration and Speaker.bot localhost UDP queue controls.
- Default-deny speech safety: explicit creator approval, approved text provenance, forced bad-word filtering, simulated-event blocking, and no-audio dry runs.
- Honest generated-audio metadata outputs that remain unavailable on the selected C# dispatch path.
- Automated contract, safety, source-integrity, and reproducible-export tests.

## [0.6.1] - 2026-07-16

### Added

- Schema-level stable source-event-ID requirement for public alerts, preventing legitimate repeated financial or engagement alerts from colliding in fallback deduplication.
- Machine-readable Multi-Alerts content-safety policy that classifies creator-controlled text as untrusted and defaults speech to denied until explicitly approved.
- Regression coverage proving a stalled delivery does not prevent a later delivery from completing when concurrency is available.
- A bounded `simulate:burst` tool for repeatable 2–100 event live Streamer.bot pressure checks with unique source identities.
- Serialized, sequence-aware accepted-state snapshots so concurrent Windows writes cannot race atomic renames or let an older event overwrite newer status.

### Changed

- Core Receiver, Multi-Chat, Multi-Commands, and Multi-Alerts exports now enable concurrent stateless invocations so one slow event cannot serialize the entire receiver pipeline.
- Streamer.bot package patch versions are now Core Receiver `1.0.3`, Multi-Chat `1.1.1`, Multi-Commands `1.0.1`, and Multi-Alerts `1.0.1`.

## [0.6.0] - 2026-07-16

### Added

- Platform-neutral Multi-Alerts projection for follows, subscriptions, memberships, gifted subscriptions, gifts, donations, cheers, Super Chats, raids, and milestones.
- Versioned Multi-Alerts Streamer.bot package with reviewed C# source and reproducible import.
- Exact decimal-string money validation, ISO currency codes, safe quantities, inert Unicode text, actor identity, and transport-verification outputs.
- Twitch follow fixture and comprehensive alert contract/package tests.

### Changed

- TikFinity like/share fixtures now use the standard `engagement.milestone` contract with explicitly unverified normalized fields.
- Adapter capabilities now represent engagement milestones explicitly.

## [0.5.1] - 2026-07-16

### Added

- Creator-facing command prefix and definition configuration with startup-time alias collision validation.
- Central derivation of structured command events from raw public chat, with deterministic correlation and consecutive bridge sequences.
- Atomic output-capacity reservation for source chat and its derived command.
- Unicode argument, cross-platform derivation, collision, malformed-input deduplication, and batch-capacity tests.

### Changed

- Production adapters must emit raw public command text as `chat.message`; the bridge now owns tokenization for every platform.
- Cooldowns and spam throttles are explicitly blocked on Milestone 9 cross-platform identity rather than being added with bypassable platform-scoped IDs.

## [0.5.0] - 2026-07-16

### Added

- Platform-neutral Multi-Commands parsing and projection contract with canonical names, aliases, quoted arguments, and explicit input limits.
- Portable role and bot authorization results while leaving final command behavior in Streamer.bot.
- Public, private, and operator command event boundaries.
- Versioned Multi-Commands Streamer.bot package with reviewed C# source and reproducible import.
- Five-platform simulated command fixtures plus parser, permission, privacy, inert-input, and package-integrity tests.

## [0.4.1] - 2026-07-16

### Added

- Process-local bridge arrival sequences that overwrite caller values after deduplication and let consumers reconstruct cross-platform order.
- Multi-Chat event ID, received timestamp, sequence, public visibility, actor type, and bot provenance outputs.
- Standard private chat, system chat, and operator message event types that never enter the public Multi-Chat path.
- Deterministic sequence, privacy-boundary, actor-provenance, and 100-event burst tests.

### Changed

- Core receiver package updated to `1.0.2` with argument contract `1.1.0`.
- Multi-Chat package and contract updated to `1.1.0`.
- Streamer.bot export generation preserves stable action and C# sub-action IDs across package upgrades.

## [0.4.0] - 2026-07-16

### Added

- Platform-neutral Multi-Chat projection contract for Twitch, YouTube, Kick, TikTok, and future registered platforms.
- Versioned `THSV StreamBridge - Multi-Chat` Streamer.bot package with reviewed C# source and reproducible import generation.
- Plain-text normalization, message-length validation, user-role flags, defensive argument initialization, and readable feature-level errors.
- Offline chat fixtures for all five planned platforms plus unit and package-integrity coverage.
- Deterministic `package:streamerbot` export builder for reviewed Streamer.bot C# packages.

## [0.3.1] - 2026-07-16

### Fixed

- Streamer.bot requests now send only the normalized event envelope, eliminating redundant unvalidated flattened wire arguments.
- Receiver failure paths clear every derived argument before validation, and identifier/type validation now mirrors the open normalized schema.
- Receiver JSON parsing now preserves ISO 8601 timestamps as strings before validating them in Streamer.bot.
- Streamer.bot package documentation now describes the actual Base64/SBAE/gzip export representation.
- Streamer.bot reconnection backoff now includes bounded equal jitter.

### Added

- Receiver queue, concurrency, dependency, uninstall, compatibility, and manual QA documentation.
- Adapter-author guidance for safely handling asynchronous emissions from real-time callbacks.

## [0.3.0] - 2026-07-15

### Added

- Versioned Streamer.bot core receiver package with a portable import, manifest, reviewed C# source, and installation guide.
- Stable platform-neutral Streamer.bot argument contract with envelope, user, channel, payload, metadata, and correlation fields.
- Export-integrity, contract, and live request-shape tests for the receiver package.

### Changed

- Streamer.bot delivery now forwards the complete receiver argument contract instead of only the raw event, event ID, and event type.
- Windows release packaging now includes the Streamer.bot package directory.

## [0.2.0] - 2026-07-15

### Added

- Token-authenticated, Origin-checked, rate/concurrency-bounded local control endpoints.
- Registry-backed input/output adapters, open platform/output records, namespaced events, and normalization helpers.
- Bounded asynchronous output queues, delivery metrics, failure-aware readiness, pending acknowledgement limits, and persisted deduplication state.
- Tests for security, delivery pressure, lifecycle, persistence, redaction, adapter registration, and failure paths.

### Changed

- Example configuration now defaults to truthful live Streamer.bot delivery; test mode is explicit and visibly non-live.
- Canonical deduplication is stable across payload key order and mixed channel ID availability.
- Post-acceptance state-write failures are reported diagnostically without falsely rejecting delivered or queued events.

## [0.1.0] - 2026-07-15

### Added

- Initial repository scaffold and Bridge Core milestone.
