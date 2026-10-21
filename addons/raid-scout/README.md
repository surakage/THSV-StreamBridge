# Raid Scout

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
7. Optional ending scene start: turn on **Start Raid Scout on an ending scene**, pick OBS, Meld or Streamlabs, and keep `role:ending` to use the Ending scene from Add-ons > Scene roles (or type the exact scene name).
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
