# Raid Scout

**Module:** `thsv.raid-scout` · **Version:** `4.0.64` · **Built in (extension)**

Previews Twitch raid destinations and delays shutdown through the raid countdown and any running ending ad.

Raid Scout helps you pick a Twitch channel to raid at the end of your stream. It checks your preferred channels first, then channels you follow that are live, then live channels in your current category, and suggests one. By default nothing happens until you press Confirm. It can also play a clip from the chosen channel, show a "Next Stop" card, and (if you turn it on) end your broadcast after the raid and an ending ad. Raid Scout is Twitch-only, but viewers on other platforms can suggest channels.

## What you need
- The **Viewer Foundation** add-on (used for YouTube and TikTok suggestion points).
- The Raid Scout Streamer.bot import:
  - **THSV Addon - Raid Scout - Controller**: keep triggerless and approve it.
  - **THSV Addon - Raid Scout - Run Ending Ad**: keep triggerless and approve it.
  - **Finish Stream**, **Suggest**, **Confirm**, **Cancel** and **Suggest and Confirm**: attach only to your own hotkeys, deck buttons or operator commands.
  - **Stop All OBS Streaming Outputs** and **Broadcast Stopped**: only for automatic broadcast ending (see below).
  - **THSV StreamBridge - Go Live - OBS and Stream Suite**: optional, starts real broadcasts, so keep it triggerless or on a protected button.
- A browser source or private dock for the Raid Scout card. Copy the URL from the wizard. It uses `http://localhost:<port>/overlay/addons/thsv.raid-scout`, not 127.0.0.1, because Twitch's clip player refuses IP addresses.
- Optional: a Twitch reward and a Kick reward that ask for text input, for viewer suggestions. Paste the reward IDs into the wizard.
- Optional: the **Ad Break Companion** add-on, for the "end after the ad" flow.

## Set it up
1. In Streamer.bot, import the Raid Scout package and attach Finish Stream, Suggest, Confirm and Cancel to creator-only controls.
2. Open Setup Wizard > Extensions > Broadcast Director > Raid Scout. Approve the Controller and Run Ending Ad actions.
3. Add your preferred channels (one login per line) and set filters: viewer range, language, blocked channels, excluded categories and tags.
4. Choose how to confirm: required (default), suggest only, or automatic.
5. Copy the overlay URL into OBS as a browser source or a custom browser dock. In OBS, keep hardware acceleration on and turn off **Shutdown source when not visible** for it.
6. Optional viewer suggestions: turn on **Let viewers suggest channels**, paste the Twitch and Kick reward IDs, and check the YouTube/TikTok command and cost.
7. Optional ending scene start: turn on **Start Raid Scout on an ending scene**, pick OBS, Meld or Streamlabs, and keep `role:ending` to use the Ending scene from Extensions > Scene roles (or type the exact scene name).
8. Save and restart StreamBridge. While live, press Suggest and check the card before trying any automatic options.

### Optional automatic broadcast ending
Off by default. Choose your broadcast app, then select its stop action: OBS users pick **Stop All OBS Streaming Outputs**; Meld and Streamlabs users create an action with that app's native Stop Streaming sub-action. Approve it, tick **I understand this can end my live broadcast**, and attach **Broadcast Stopped** to the same app's **Streaming Stopped** trigger. For the after-ad mode, attach Ad Break Companion's Ad Run Intake to **Twitch > Ads > Ad Run**.

## Chat commands
| Command | Who can use it | What it does |
| --- | --- | --- |
| `!raidsuggest channelname` | Viewers on YouTube and TikTok (when suggestions are on) | Spends 50 Viewer Foundation points to add a Twitch channel to this stream's raid list. |

## Good to know
- Within each tier it picks the live channel with the fewest viewers (or a random one, if you choose). Channels you raided in the last 7 streams are skipped.
- Suggestion cards show on the overlay by default. If you put the URL in a public scene, turn off suggestion cards so viewers do not see an unconfirmed pick.
- Viewer suggestions are cleared after each stream. Twitch suggestions are refunded if refused; Kick suggestions cannot be refunded.
- During the raid clip, Random Clip Player pauses so two clips never overlap.
- If it cannot confirm the ad or the raid, the broadcast stays live unless you turn on the finish-anyway option. A failed stop is never retried, so stop manually if asked.
- Twitch credentials stay in Streamer.bot. Raid Scout only reads public Twitch data to find channels.

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Broadcast Director** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Raid Scout`

- `THSV Addon - Raid Scout - Controller` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Suggest` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Finish Stream` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Confirm` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Cancel` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Broadcast Stopped` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Run Ending Ad` in `THSV Addon - Raid Scout`
- `THSV StreamBridge - Go Live - OBS and Stream Suite` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Stop All OBS Streaming Outputs` in `THSV Addon - Raid Scout`
- `THSV Addon - Raid Scout - Suggest and Confirm` in `THSV Addon - Raid Scout`

Controller, Run Ending Ad, Test Go Live, and Stop All OBS Streaming Outputs ship triggerless. Test Go Live may be attached only to a protected creator control because it starts real OBS/Aitum broadcasts. Finish Stream, Suggest, Confirm, and Cancel emit exact bounded controls and never contact Twitch directly. Broadcast Stopped only confirms a provider stop signal. The ad action is dispatched once when the ending search begins; after clip completion and the raid attempt, the stop-all action is dispatched when the genuine Ad Run timer and configured safety gate finish even if Twitch rejects or cannot confirm the raid.

Creator-selected triggers:

- **suggest:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **confirm:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **cancel:** Attach only to a creator-controlled hotkey, deck button, or operator command.
- **broadcastStopped:** Attach only to the Streaming Stopped trigger for the same OBS, Meld, or Streamlabs provider used by the selected Stop Streaming action.
- **runEndingAd:** Keep triggerless. Raid Scout dispatches it when Suggest or Finish Stream begins so discovery, confirmation, and clip playback use the commercial window.
- **testGoLiveObsAndAitum:** Keep triggerless by default. Run it manually from Streamer.bot, or attach it only to a protected creator Stream Deck button or hotkey. Running it starts real broadcasts.
- **stopAllObsStreamingOutputs:** Keep triggerless. OBS/Aitum users may select and approve this action as Raid Scout's Stop Streaming action.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.raid-scout` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Raid Scout |  | On |
| Start Raid Scout on an ending scene | While Twitch is live, entering the exact scene in the selected broadcast app starts one search per stream. Repeated scene events are ignored. | Off |
| Ending-scene broadcast app | Choose the app whose normalized Streamer.bot Scene Changed relay owns the ending scene. | `obs` |
| Ending scene name | Enter the scene name exactly as it appears in the selected app, including emoji or folder symbols. role:ending uses the Ending scene you chose under Extensions > Scene roles. | `role:ending` |
| Search preferred channels |  | On |
| Search followed live channels |  | On |
| Search the current Twitch category |  | On |
| Legacy discovery request order | Retained for configuration compatibility. Discovery and selection now use the fixed preferred/local, followed-live, then same-category tier order. | `preferred-followed-category` |
| Permanent preferred Twitch channels | Your creator-managed list is kept between streams. One login per line or comma-separated. | (blank) |
| Maximum preferred channels per search |  | 20 |
| Let viewers suggest channels |  | Off |
| Twitch suggestion reward ID | Create a Streamer.bot-owned Twitch reward that requires text input, then paste its stable reward ID here. | (blank) |
| Kick suggestion reward ID | Paste the stable Kick reward ID. Kick redemptions are accepted immediately because Streamer.bot does not currently expose Kick reward fulfill or refund methods. | (blank) |
| YouTube and TikTok suggestion command | Use this command with a channel login, for example !raidsuggest creatorname. | `raidsuggest` |
| YouTube and TikTok points cost |  | 50 |
| Maximum viewer suggestions per stream |  | 20 |
| Allow one suggestion per viewer each stream |  | On |
| Confirm accepted or rejected suggestions in Twitch chat |  | On |
| Accepted suggestion message | Tokens: {viewer}, {channel}. | `{viewer}, added {channel} to tonight's raid list.` |
| Rejected suggestion message | Tokens: {viewer}, {channel}. Keep this generic so blocked-channel rules remain private. | `{viewer}, that raid suggestion could not be added.` |
| Maximum followed candidates |  | 25 |
| Maximum followed-stream pages | Each page is one Twitch request. Two is recommended. | 2 |
| Maximum same-category candidates |  | 100 |
| Minimum candidate viewers |  | 1 |
| Maximum candidate viewers |  | 100000 |
| Use the closest safe match when the viewer ceiling is empty | If no otherwise-safe channel is at or below the maximum, Raid Scout may select the closest channel up to twice the configured maximum or 25 viewers above it. Language, channel, category, tag, self, and repeat protections remain enforced. | On |
| Fallback current audience estimate | Zero uses the broadcaster's live viewer count returned by Twitch. | 0 |
| Legacy similar-size preference | Retained for configuration compatibility. Raid Scout now selects the eligible channel with the fewest viewers inside the first available tier: preferred/local, followed, then same category. | On |
| Preferred minimum audience ratio |  | 0.25 |
| Preferred maximum audience ratio |  | 2 |
| Preferred Twitch language code | Examples: en, es, fr. Leave empty for any language. | (blank) |
| Require the preferred language |  | Off |
| Blocked channels | One Twitch login per line. | (blank) |
| Excluded categories | Case-insensitive partial matches, one per line. | (blank) |
| Excluded tags | Case-insensitive partial matches, one per line. | (blank) |
| Do not repeat a destination for this many streams |  | 7 |
| Raid confirmation mode |  | `required` |
| Suggestion expiry (minutes) |  | 15 |
| Announce only after Twitch confirms viewers transferred |  | On |
| Confirmed raid message | Tokens: {displayName}, {login}, {category}, {title}, {viewers}, {language}, {durationMinutes}, {source}. | `Next stop: {displayName} playing {category}! https://twitch.tv/{login}` |
| Post a no-candidate message in Twitch chat | Disabled by default to keep search progress private. | Off |
| No-candidate message |  | `Raid Scout could not find a safe live destination with the current filters.` |
| Show each search phase on the Raid Scout overlay | Shows preferred, followed, and same-category checks as private overlay progress. It does not post those steps to chat. | On |
| Show suggestions in the Raid Scout browser card | Enabled so a private OBS/Meld/browser dock can show what Confirm will raid. Disable this if the same URL is placed on-stream and you want suggestions hidden from viewers. | On |
| Show the confirmed Next Stop card |  | On |
| Card duration (seconds) |  | 20 |
| Play one random clip before starting the confirmed raid | After Confirm, Raid Scout requests a bounded clip list, plays the selected clip through completion, then starts the raid. The ending ad can run in parallel from the moment Suggest begins. | Off |
| Pause other THSV video overlays during the raid preview | Recommended. Confirming a raid temporarily fades and pauses Random Clip Player or another coordinated THSV video overlay so the two clips cannot overlap. | On |
| Clips considered for random selection | Streamer.bot requests this many public clips for the selected channel. One is chosen locally at random. | 20 |
| Mute the raid clip preview | Keep enabled when browser-source autoplay blocks audio. OBS browser sources normally support unmuted playback. | Off |
| Raid clip volume |  | 0.8 |
| Send the raid after a running ad | When an ad is running (for example the ending ad), Raid Scout waits to send the raid so Twitch's 90-second raid countdown ends just after the ad. The next-stop card and the target's clips stay on screen while it waits. | On |
| End the broadcast after the raid attempt | Disabled by default. The approved stop action runs after Twitch confirms the viewer handoff and the configured ending wait finishes. Enable finish-on-failure below to also finish a requested ending when a destination or raid is unavailable. | Off |
| Broadcast application | Choose the application that owns the live broadcast. This keeps the stop action and Streaming Stopped confirmation on the same provider. | `obs` |
| Provider Stop Streaming action | OBS Studio/Aitum: choose the included Stop All OBS Streaming Outputs action. Meld Studio: choose an action containing Meld Studio > Stop Streaming. Streamlabs Desktop: choose an action containing Streamlabs Desktop > Stop Streaming. Approve the same action below. | (blank) |
| When to end the broadcast | After-ad asks Twitch to start the ending ad, then waits for a genuine Twitch Ad Run event and uses Twitch's reported duration. Countdown preserves the older fixed-delay behavior. | `after-ad` |
| Cancelable end-stream countdown (seconds) | Raid Scout Cancel aborts automatic ending only before the Stop Streaming action is sent. | 10 |
| Ending Twitch ad length | The duration Raid Scout asks Twitch to run. Twitch's genuine Ad Run event remains the authoritative timer. | 180 |
| Maximum wait for Twitch to confirm the ad (seconds) | Wait this long for a genuine Twitch Ad Run signal. With finish-on-failure enabled, a missing signal uses the full requested duration plus this confirmation grace; otherwise the broadcast stays live. | 45 |
| Extra buffer after the ad (seconds) | Small safety buffer added after Twitch's reported ad duration before Stop Streaming runs. | 3 |
| I understand this can end my live broadcast | Required in addition to enabling the feature. Raid Scout never retries a failed or unconfirmed stop command. | Off |
| Overlay background |  | `glass` |
| Background color |  | `#17122b` |
| Background opacity |  | 0.94 |
| Accent color |  | `#9146ff` |
| Text color |  | `#ffffff` |
| Font |  | `display` |
| Start raid search | Manual uses the Streamer.bot Suggest action from a Stream Deck button. Scene change starts one search per Twitch stream when the selected ending scene opens. Manual controls remain available in either mode. |  |
| Destination selection | Choose the fewest viewers, or randomly rotate through eligible channels without repeating until the current pool is exhausted. Preferred, followed, then category search tiers and safety filters still apply. | `lowest-viewers` |
| On the ending scene | Choose whether opening the ending scene only suggests a destination or also confirms and starts the raid after discovery completes. | `suggest` |
| Start the ending ad | Start the ending ad when discovery begins, or after a destination is found and confirmed, alongside its clip preview. | `search` |
| End after a confirmed ad failure (seconds) | 0 keeps streams live. A positive delay stops the approved broadcast outputs only after an explicit ad-request failure. A missing Ad Run signal alone does not trigger this fallback. | 0 |
| Finish even when the raid or ad is unavailable | For Finish Stream or automatic confirmed ending only. Failed raid clips release the video slot so your clips resume. No destination or unconfirmed raid continues to the ending wait without claiming raid success. A real Ad Run timer takes priority; an unanswered ad request waits its full requested duration plus confirmation grace. A rejected ad uses the farewell below. Cancel remains available until Stop Streaming is sent. | Off |
| Farewell when Twitch rejects the ad (seconds) | Your clips continue during this cancelable farewell. Used only with finish-on-failure enabled. An accepted or unanswered ad request always gets at least its full duration plus confirmation grace. | 30 |

## Health checks

- **thsv.raid-scout.runtime:** Confirms bounded discovery, filtering, non-repeating selection, and creator-confirmed Twitch raids.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`, `chat.send`, `overlay.publish`, `media.exclusive`, `media.cache`, `schedule.bounded`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.raid-scout/`, `data/addons/.state/thsv.raid-scout/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its bounded private suggestion and raid history remains preserved for a later reinstall.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
