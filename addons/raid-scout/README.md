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

- Removes the broadcaster, blocked channels, offline channels, filtered categories/tags/languages, viewer-count mismatches, recent raid destinations, and the current suggestion.
- Uses shuffle-without-repeats inside the first eligible tier.
- Can prefer channels from 25% through 200% of the current audience before falling back to the full eligible tier.
- Stores only local bounded candidate summaries and history.
- Shows honest private-overlay phases while it checks preferred, followed-live, and same-category sources. These status steps are never posted to public chat.
- Starts no raid until the creator uses Confirm unless advanced automatic mode is explicitly selected.
- Can optionally request a bounded public clip list for the confirmed channel, shuffle it, retry other returned clips when Twitch cannot resolve one download, temporarily cache the first playable MP4 for smooth native playback, and then start the raid. Cached clips expire automatically.
- Can optionally request one ending Twitch ad immediately before the confirmed raid, use the genuine Twitch Ad Run duration as its timer, and then run the selected Stop Streaming action. An already-active ad is reused rather than duplicated. A fixed countdown remains available as an advanced fallback.

## Install

1. Import `THSV-StreamBridge-Raid-Scout-3.5.0.sb` into Streamer.bot.
2. Leave `THSV Addon - Raid Scout - Controller` and `THSV Addon - Raid Scout - Run Ending Ad` triggerless.
3. Install `thsv.raid-scout-3.5.0.thsv-addon` through the StreamBridge wizard.
4. Inspect Streamer.bot and approve the Raid Scout Controller and Run Ending Ad actions. If you enable automatic ending, OBS/Aitum users should also approve the included Stop All OBS Streaming Outputs action; Meld/Streamlabs users approve their provider-native stop action.
5. Attach Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands.
6. Open the add-on overlay URL as a private browser/OBS/Meld dock so you can review the suggestion.
7. Configure preferred channels and filters, then use Suggest while live.

To accept viewer suggestions, create Twitch and Kick rewards that require a channel login in the viewer input, and paste both IDs into Raid Scout. The existing platform intakes already relay those redemptions. Twitch suggestions are fulfilled or refunded through the controller; Kick suggestions are accepted directly and cannot be refunded automatically. For YouTube and TikTok, choose the command (for example `!raidsuggest creatorname`) and Viewer Foundation points cost in the wizard; the command registers automatically after restart.

Suggestion cards are enabled for that private dock by default. If the same URL is placed in a public scene, disable suggestion cards unless viewers should see an unconfirmed destination. The confirmed Next Stop card has its own toggle.

The optional clip preview begins only after Confirm. With media coordination enabled, Raid Scout claims one bounded internal video slot so Random Clip Player fades out and pauses without losing its creator-enabled state or shuffle bag. Cancellation and failure release the slot; a successful raid keeps it protected through the handoff window. Returned clips are shuffled, resolved through Streamer.bot one at a time, cached locally, and buffered before native video playback begins. If one clip has no playable Twitch URL or cannot be cached, Raid Scout tries another returned clip before continuing the already-confirmed raid.

## Optional automatic broadcast ending

This is disabled by default. Create one Streamer.bot action containing the native **Streaming > Stop** sub-action for the broadcast app you actually use, then select that action and accept the safety acknowledgement in Raid Scout's wizard settings. Saving all settings adds that exact action to Raid Scout's action grant automatically. Attach Ad Break Companion's Ad Run Intake to **Twitch > Ads > Ad Run**, and attach `THSV Addon - Raid Scout - Broadcast Stopped` only to the same broadcast provider's **Streaming Stopped** trigger.

In the recommended after-ad mode, Raid Scout finishes the selected clip, respects Twitch's eight-minute commercial cooldown, and dispatches its included Run Ending Ad action. It waits for the genuine Twitch Ad Run event before starting the confirmed raid, tracks the exact `adLength` reported by Streamer.bot, and stops only after that duration and the configured small buffer. If an ad is already running, Raid Scout uses its remaining time instead of requesting another. If Twitch rejects the request or no real ad event arrives before the bounded wait expires, it starts the confirmed raid but leaves the broadcast live and asks the creator to end manually. Cancel can abort before the raid or selected stop action runs. Search failure, clip failure by itself, raid rejection, simulated ad/control events, missing approval, or a missing safety acknowledgement cannot stop the broadcast. After dispatch, Raid Scout waits for the imported provider confirmation action; if no confirmation arrives, it tells the creator to stop manually and never retries.

Streamer.bot does not expose documented C# methods for followed-live or category stream discovery. The dedicated controller therefore uses the broadcaster's existing Twitch authentication only for bounded GET requests to fixed `https://api.twitch.tv/helix/` endpoints. It never relays, logs, or persists either credential.
