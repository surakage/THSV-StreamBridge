# Raid Scout

Raid Scout is a Twitch-only raid destination finder with a safe default: suggest first, raid only after creator confirmation.

## Discovery

1. Preferred Twitch channels.
2. Channels the broadcaster follows that are currently live.
3. Live channels in the broadcaster's current Twitch category.

The order is configurable. Each source can be disabled. Search requests, pages, candidates, state, and history are bounded.

The preferred tier can combine two lists:

- Permanent creator-managed channels saved in the wizard.
- Viewer suggestions submitted through one configured Twitch Channel Points reward. Viewer entries are deduplicated, bounded, optionally limited to one per viewer, searched before the permanent list, and cleared on stream offline and again on the next stream online event.

## Selection and safety

- Removes the broadcaster, blocked channels, offline channels, filtered categories/tags/languages, viewer-count mismatches, recent raid destinations, and the current suggestion.
- Uses shuffle-without-repeats inside the first eligible tier.
- Can prefer channels from 25% through 200% of the current audience before falling back to the full eligible tier.
- Stores only local bounded candidate summaries and history.
- Shows honest private-overlay phases while it checks preferred, followed-live, and same-category sources. These status steps are never posted to public chat.
- Starts no raid until the creator uses Confirm unless advanced automatic mode is explicitly selected.
- Can optionally request a bounded public clip list for the confirmed channel, choose one clip at random, play its official Twitch embed once, and then start the raid. No clip is downloaded or retained.

## Install

1. Import `THSV-StreamBridge-Raid-Scout-2.5.1.sb` into Streamer.bot.
2. Leave `THSV Addon - Raid Scout - Controller` triggerless.
3. Install `thsv.raid-scout-2.5.1.thsv-addon` through the StreamBridge wizard.
4. Inspect Streamer.bot and approve only the Raid Scout Controller action.
5. Attach Suggest, Confirm, and Cancel only to creator-controlled hotkeys, deck buttons, or operator commands.
6. Open the add-on overlay URL as a private browser/OBS/Meld dock so you can review the suggestion.
7. Configure preferred channels and filters, then use Suggest while live.

To accept viewer suggestions, create a Streamer.bot-owned Twitch reward that requires text input, leave Skip Queue disabled, set its per-user-per-stream limit to 1, and paste its reward ID into Raid Scout's wizard settings. The existing `THSV Twitch - Intake` action already relays reward redemptions; do not add a platform trigger to Raid Scout. Valid suggestions are fulfilled only after Raid Scout reserves them, while invalid, duplicate, blocked, or over-capacity suggestions are refunded when Twitch exposes the supported operation.

Suggestion cards are enabled for that private dock by default. If the same URL is placed in a public scene, disable suggestion cards unless viewers should see an unconfirmed destination. The confirmed Next Stop card has its own toggle.

The optional clip preview begins only after Confirm. With media coordination enabled, Raid Scout claims one bounded internal video slot so Random Clip Player fades out and pauses without losing its creator-enabled state or shuffle bag. Cancellation and failure release the slot; a successful raid keeps it protected through the handoff window. Twitch clip embeds do not expose a precise JavaScript playback-ended event, so Raid Scout uses Twitch's reported duration plus a short bounded grace period. If no usable clip is returned, the embed fails, or the dock is closed, the already-confirmed raid continues safely without getting stuck.

Streamer.bot does not expose documented C# methods for followed-live or category stream discovery. The dedicated controller therefore uses the broadcaster's existing Twitch authentication only for bounded GET requests to fixed `https://api.twitch.tv/helix/` endpoints. It never relays, logs, or persists either credential.
