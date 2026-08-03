# Beginner setup: optional add-ons

Install optional add-ons only after Bridge Core chat and alerts pass. Every add-on reuses the main bridge event bus, Streamer.bot connection, private state, scheduler, chat router, and overlay transport.

## The four-step rule

For every add-on:

1. Download the add-on ZIP from the **same GitHub release** as the installed bridge.
2. Extract it and install the `.thsv-addon` in **Wizard > Add-ons**.
3. If that ZIP contains a `Streamer.bot` folder, import its `.sb` file. If it does not, do not invent another action or trigger.
4. Configure, save, enable, restart when prompted, and complete the add-on's offline test.

The wizard's **Connect Streamer.bot** step is authoritative. “No direct trigger needed” means the add-on listens to the existing main intakes internally.

## What each add-on needs

| Add-on | Extra `.sb` import | What starts it |
| --- | --- | --- |
| Accessibility Captions | No | Existing normalized chat/events |
| Automated Shoutouts | Yes | Imported package plus documented Twitch/manual triggers |
| Category Pilot | Yes | Imported detection/controller actions |
| Chat Guard | Yes | Existing chat intake plus approved optional enforcement action |
| Chat Play Pack | No | Command Sync templates through existing intakes |
| Clip Courier | Yes | Imported Twitch `!clip` command and private delivery helper |
| Clip Library Cache | Yes | Triggerless shared refresh action approved in the wizard |
| Community Analytics | No | Existing normalized events |
| Creator Controls | Yes | Imported approved controller actions |
| Village Polls | No | Command Sync poll-management and vote templates |
| Discord Chat Archive | Yes | Existing chat intake plus approved Discord delivery action |
| Fan Crown | Yes | Twitch reward intake plus imported controller |
| First Five | Yes | Twitch reward intake plus imported controller |
| Follower Pulse | Yes | Imported Twitch lookup action |
| Free Game Check | Yes | Imported lookup/delivery actions |
| Ko-fi Donations | Yes | Existing Ko-fi integration trigger plus imported add-on action |
| Live Beacon | Yes | Platform stream-online intake plus imported Discord delivery action |
| Quote Vault | Yes | Existing command intake plus imported response action |
| Raid Scout | Yes | Imported Twitch lookup/raid actions and optional browser source |
| Random Clip Player | Yes | Imported Enable/Disable actions; do not attach a repeating timer |
| Scene Actions | Yes | One scene-change trigger on its intake, then creator sub-actions |
| Stream Launch Countdown | Yes | Imported Start/Stop/Pause/Resume actions |
| Stream Labels | No | Existing normalized community events and one browser source |
| Prize Wheel | No | Command Sync Prize Wheel template and one browser source |
| Subathon Timer | Yes | Imported controller actions plus configured event rules |
| Translate | Yes | Imported/manual command path or configured automatic mode |
| Viewer Foundation | No | Existing events plus optional Command Sync `!points` and `!lurk` |
| Viewer Lobby | Yes | Imported queue controller actions and browser manager |
| Viewer Spotlight | Yes | Imported request/snapshot actions and browser source |
| Village Draw | No | Viewer Foundation plus the existing main platform chat intakes; no Command Sync package |
| Village Jukebox | Yes | Command Sync requests through the main intakes plus one private YouTube resolver |
| Village Roll Call | No | Twitch/Kick rewards or YouTube/TikTok Viewer Foundation point commands through the main intakes |
| Village Voice | Yes | Imported Speaker.bot relay action; optional native rewards or Viewer Foundation point commands |

## Dependency order that avoids setup errors

Some add-ons build on another add-on. Install them in this order:

1. **Viewer Foundation** first when points, identity, check-ins, viewer cards, giveaways, or viewer-paid requests are used.
2. **Community Analytics** after Viewer Foundation and before Viewer Spotlight.
3. **Clip Library Cache** before Random Clip Player or Clip Courier when they will share one Twitch clip list.
4. Install the feature add-on last, import only the `.sb` found in that feature's ZIP, and approve only the actions its wizard card recommends.

If the wizard reports a missing dependency, do not create a replacement Streamer.bot action. Install and enable the named dependency, save, restart StreamBridge, and return to the add-on.

## What “connected” means

An add-on is ready only when all applicable checks pass:

- its card says **Installed**, not Rejected;
- required dependencies are installed and enabled;
- the matching-version Streamer.bot import is present in that add-on's own group;
- every broker action the wizard recommends has been approved by stable action ID;
- required provider triggers remain on the main THSV platform intake, unless the add-on guide explicitly names a direct intake;
- its browser source shows the brief LIVE connection badge and its offline preview appears once;
- a simulated test is recorded as offline/manual evidence, never as a real provider pass.

## Safe test order

1. Keep the add-on disabled while entering settings.
2. Approve only the actions named by its guide.
3. Enable it and restart StreamBridge.
4. Refresh any browser source and wait for the brief LIVE badge.
5. Use the wizard preview first.
6. Use a Streamer.bot Test trigger second.
7. Treat real provider acceptance as a separate final check; simulations never prove a financial, reward, moderation, raid, or outbound-chat side effect.

## Avoid duplicate work and loops

- Never add the same platform trigger to both the main intake and an add-on action unless the add-on guide explicitly says to.
- Never make an add-on controller call itself.
- Do not place Random Clip Player Enable on a repeating timer; enable it on scene entry and disable it on scene exit.
- Use Clip Library Cache when multiple clip add-ons need the Twitch list, so they share one bounded refresh.
- Keep Viewer Foundation as the only point-balance authority. Add-ons spend or refund through it instead of maintaining another currency.
- One overlay page equals one browser connection to StreamBridge, not one WebSocket to Streamer.bot.

Choose an add-on from the [complete setup-guide index](addons/README.md) for its exact command names, action grants, overlay URL, privacy limits, and recovery steps.
