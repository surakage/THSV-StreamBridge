# Raid Scout

Raid Scout is a Twitch-only raid destination finder with a safe default: suggest first, raid only after creator confirmation.

## Discovery

1. Preferred Twitch channels.
2. Channels the broadcaster follows that are currently live.
3. Live channels in the broadcaster's current Twitch category.

The order is configurable. Each source can be disabled. Search requests, pages, candidates, state, and history are bounded.

The preferred tier can combine two lists:

- Permanent creator-managed channels saved in the wizard.
- Viewer suggestions submitted through Twitch or Kick rewards, or a Viewer Foundation points command on YouTube and TikTok. Entries are deduplicated, bounded, optionally limited to one per platform-qualified viewer, searched before the permanent list, and cleared after the stream.

## Selection and safety

- Removes the broadcaster, blocked channels, offline channels, filtered categories/tags/languages, viewer-count mismatches, recent raid destinations, and the current suggestion. Same-category discovery can inspect up to 100 live channels; when enabled, the bounded closest-match fallback may relax only the maximum-viewer ceiling while every other safety filter remains enforced.
- Uses shuffle-without-repeats inside the first eligible tier.
- Can prefer channels from 25% through 200% of the current audience before falling back to the full eligible tier.
- Stores only local bounded candidate summaries and history.
- Shows honest private-overlay phases while it checks preferred, followed-live, and same-category sources. These status steps are never posted to public chat.
- Starts no raid until the creator uses Confirm unless advanced automatic mode is explicitly selected.
- Can start one search per live stream when OBS enters an exact, creator-configured ending scene. Repeated scene-active or Studio Mode signals are ignored.
- Can optionally request a bounded public clip list for the confirmed channel, shuffle it, play one through Twitch's embedded clip player, and then start the raid. Cached clips expire automatically.
- Checks eligible preferred/local channels first and selects the live channel with the fewest viewers. When none qualify, it checks followed-live channels and selects the lowest there; only when that tier is empty does it select the lowest-viewer same-category channel.
- Can optionally start or adopt one ending Twitch ad as Suggest begins, continue discovery, confirmation, and full clip playback during it, use the genuine Twitch Ad Run duration as its timer, and then run the selected Stop Streaming action only after Twitch confirms viewers transferred and the ending wait finishes. The same flow never requests a duplicate commercial. A fixed countdown remains available as an advanced fallback.

## Install

1. Import `THSV-StreamBridge-Raid-Scout-4.0.12.sb` into Streamer.bot.
2. Leave `THSV Addon - Raid Scout - Controller` and `THSV Addon - Raid Scout - Run Ending Ad` triggerless.
3. Install `thsv.raid-scout-4.0.12.thsv-addon` through the StreamBridge wizard.
4. Inspect Streamer.bot and approve the Raid Scout Controller and Run Ending Ad actions. If you enable automatic ending, choose OBS Studio, Meld Studio, or Streamlabs Desktop in the wizard and approve the matching stop action. OBS/Aitum users select the included Stop All OBS Streaming Outputs action; Meld and Streamlabs users select an action containing that application's native Stop Streaming sub-action.
5. Attach Finish Stream, Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands. Finish Stream is the one-press ending flow; Suggest and Confirm remain available for manual review.
6. Open the add-on overlay URL as a private browser/OBS/Meld dock so you can review the suggestion.
7. Configure preferred channels and filters, then use Suggest while live. To start automatically at the end of a stream, choose OBS Studio, Meld Studio, or Streamlabs Desktop, enable the ending-scene option, and enter that app's exact scene name (including any emoji or folder symbol).

To accept viewer suggestions, create Twitch and Kick rewards that require a channel login in the viewer input, and paste both IDs into Raid Scout. The existing platform intakes already relay those redemptions. Twitch suggestions are fulfilled or refunded through the controller; Kick suggestions are accepted directly and cannot be refunded automatically. For YouTube and TikTok, choose the command (for example `!raidsuggest creatorname`) and Viewer Foundation points cost in the wizard; the command registers automatically after restart.

Suggestion cards are enabled for that private dock by default. If the same URL is placed in a public scene, disable suggestion cards unless viewers should see an unconfirmed destination. The confirmed Next Stop card has its own toggle.

The optional clip preview begins only after Confirm. With media coordination enabled, Raid Scout claims one bounded internal video slot so Random Clip Player fades out and pauses without losing its creator-enabled state or shuffle bag. Cancellation and failure release the slot; a successful raid keeps it protected through the handoff window. Returned clips are shuffled. Twitch only gives download URLs for your own channel's clips (or channels you edit), so the raid target's clip plays straight through Twitch's embedded clip player (`https://clips.twitch.tv/embed?clip=<slug>&parent=localhost&autoplay=true&muted=false`), bounded by the clip's duration plus five seconds, in both Confirm and Finish Stream flows. If the player does not start within eight seconds, Raid Scout shows the fallback card and continues the already-confirmed raid. A clip from your own channel still resolves through Streamer.bot, is cached locally, and buffers before native playback.

Twitch's embed only accepts a `parent` that matches the overlay page's hostname and refuses IP addresses, so the Raid Scout OBS browser source must use `http://localhost:<port>/overlay/addons/thsv.raid-scout` (the URL the wizard shows). A source still set to `http://127.0.0.1:<port>/...` reopens itself on `localhost` automatically.

## Optional automatic broadcast ending

This is disabled by default. Create one Streamer.bot action containing the native **Streaming > Stop** sub-action for the broadcast app you actually use, then select that action and accept the safety acknowledgement in Raid Scout's wizard settings. Saving all settings adds that exact action to Raid Scout's action grant automatically. Attach Ad Break Companion's Ad Run Intake to **Twitch > Ads > Ad Run**, and attach `THSV Addon - Raid Scout - Broadcast Stopped` only to the same broadcast provider's **Streaming Stopped** trigger.

In the recommended after-ad mode, Suggest or Finish Stream dispatches the included Run Ending Ad action immediately while Twitch is still live. Discovery and manual or automatic confirmation proceed during the commercial; after confirmation, the selected clip plays through completion, then Raid Scout attempts the raid. It tracks the exact genuine `adLength` reported by Streamer.bot and runs the selected OBS, Meld, or Streamlabs stop action after the ad end plus the configured buffer and a genuine Twitch RaidSend event confirming the destination viewer handoff. If Twitch rejects the ad or no real Ad Run event arrives, the destination search and raid continue but every broadcast remains live because Raid Scout has no trustworthy commercial timer. The OBS/Aitum helper recognizes Aitum's stable `aitum_multi_output_` names and its RTMP, WHIP, FTL, or MPEG-TS transports, requests every matching output to stop, and gives all secondary outputs one shared three-second confirmation window. OBS main is then stopped unconditionally; an Aitum failure is logged but can never hold the main broadcast online. Meld and Streamlabs use their own provider-native Stop Streaming action and confirmation trigger, so a disconnected application that is not selected cannot block shutdown. Cancel can abort before the selected stop action runs. Search failure, simulated ad/control events, missing approval, or a missing safety acknowledgement cannot stop the broadcast. After dispatch, Raid Scout waits for the selected provider's Broadcast Stopped confirmation; if none arrives, it tells the creator to stop manually and never retries.

Streamer.bot does not expose documented C# methods for followed-live or category stream discovery. The dedicated controller therefore uses the broadcaster's existing Twitch authentication only for bounded GET requests to fixed `https://api.twitch.tv/helix/` endpoints. It never relays, logs, or persists either credential.

### Ending fallbacks

`endBroadcastWithoutRaid` is off by default. When enabled, Finish Stream and the automatic suggest-and-confirm ending use your own clip player if a raid preview fails. No destination, rejected raid, or unconfirmed handoff proceeds to the ending wait without announcing a successful raid. The approved Stop Streaming action and acknowledgement are still required.

A genuine Twitch Ad Run event controls the ending time. A rejected ad uses `endBroadcastFallbackSeconds` (30 seconds by default); an unanswered or accepted request without Ad Run waits its full requested ad duration plus confirmation grace. The six-minute raid-flow watchdog releases stuck raid media and enters this bounded ending wait. Cancel aborts before Stop Streaming is sent. A stop command is sent once; failed stop confirmation still requires manual intervention. Enable Random Clip Player for both ending-scene variants to keep your clips playing.
