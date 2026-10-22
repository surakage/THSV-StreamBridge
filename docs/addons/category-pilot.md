# Category Pilot

**Module:** `thsv.category-pilot` · **Version:** `4.0.51` · **Optional add-on**

Suggests or applies saved Creator Controls profiles from privacy-bounded allowlisted Windows process checks.

Category Pilot notices when a game you chose is running on your Windows PC and suggests the matching Creator Controls profile (your title and category). In the default Suggest only mode, a small suggestion card appears on your overlay and you choose to apply or dismiss it. In Automatic mode it applies the profile for you. It only checks the exact program names you type in, never your full process list, file paths or window titles.

## What you need
- **Creator Controls**, installed and set up first. Category Pilot applies its profiles.
- The Category Pilot Streamer.bot package. Import it and Save and Compile all three actions (group **THSV Addon - Category Pilot**):
  - **THSV Addon - Category Pilot - Process Probe**: approve it in the wizard and leave it without a trigger.
  - **THSV Addon - Category Pilot - Apply Suggestion** and **THSV Addon - Category Pilot - Dismiss Suggestion**: optional. Attach them only to your own hotkeys or deck buttons.
- In the wizard, also approve for Category Pilot the Creator Controls actions **Apply Profile 1**, **Apply Profile 2** and/or **Apply Profile 3**, but only the ones your mappings use.
- Optional: a browser source to see suggestion cards. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.category-pilot`).

## Set it up
1. Set up Creator Controls and check that its profiles work.
2. Open the Setup Wizard and go to **Add-ons > Category Pilot**.
3. **Quick start**: tick **Enable Category Pilot** and keep **Decision mode** on **Suggest only (recommended)**. **Check only while a stream is live** is on by default.
4. **Detection timing**: choose how often to check (default every 20 seconds) and how many matching checks are needed before a suggestion (default 2).
5. **Game mappings 1-5**: for each game, tick the mapping, type the program name without `.exe` (as it appears in Task Manager's Details tab), and pick the Creator Controls profile to use.
6. Approve **Process Probe** and the profile actions you use, then import the `.sb` file into Streamer.bot.
7. Restart StreamBridge.
8. Test it: turn off **Check only while a stream is live** for a moment, start one of your mapped games, and wait for the suggestion. Run **Apply Suggestion** from your hotkey or deck button and check your title. Turn the live-only setting back on afterwards.

## Good to know
- Start in Suggest only. Switch to **Apply automatically** only after the matches have proven reliable on your PC.
- A suggestion card shows for 15 seconds. The suggestion stays pending until you apply or dismiss it, a check finds no mapped game, or the stream ends.
- It will not re-suggest the profile that was last applied.
- If Streamer.bot does not answer a check within 30 seconds, Category Pilot simply tries again on the next interval.
- Test buttons and simulated events cannot create or apply a suggestion.
- Windows only. Up to five mappings, each using one of the three Creator Controls profiles.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Category-Pilot-4.0.51.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Category-Pilot-4.0.51.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Category-Pilot-4.0.51.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Category Pilot`

- `THSV Addon - Category Pilot - Process Probe` in `THSV Addon - Category Pilot`
- `THSV Addon - Category Pilot - Apply Suggestion` in `THSV Addon - Category Pilot`
- `THSV Addon - Category Pilot - Dismiss Suggestion` in `THSV Addon - Category Pilot`

Process Probe must remain triggerless and requires a one-use broker token. It compares only exact allowlisted process names and never returns paths, command lines, window titles, or the complete process list.

Creator-selected triggers:

- **controls:** Optional: attach Apply Suggestion and Dismiss Suggestion only to creator-controlled hotkeys or deck buttons.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.category-pilot` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Category Pilot |  | Off |
| Decision mode |  | `suggest` |
| Check only while a stream is live |  | On |
| Check every (seconds) |  | 20 |
| Matching checks before a suggestion |  | 2 |
| Enable mapping 1 |  | On |
| Mapping 1 process name | Exact executable name without .exe. Paths and window titles are never collected. | (blank) |
| Mapping 1 profile |  | `profile-2` |
| Enable mapping 2 |  | Off |
| Mapping 2 process name |  | (blank) |
| Mapping 2 profile |  | `profile-2` |
| Enable mapping 3 |  | Off |
| Mapping 3 process name |  | (blank) |
| Mapping 3 profile |  | `profile-2` |
| Enable mapping 4 |  | Off |
| Mapping 4 process name |  | (blank) |
| Mapping 4 profile |  | `profile-2` |
| Enable mapping 5 |  | Off |
| Mapping 5 process name |  | (blank) |
| Mapping 5 profile |  | `profile-2` |

## Health checks

- **thsv.category-pilot.runtime:** Confirms allowlisted process probes and suggestion controls are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`, `overlay.publish`.

Private storage: `data/addons/thsv.category-pilot/`, `data/addons/.state/thsv.category-pilot/`.

Dependencies: `thsv.creator-controls`.

## Remove or repair

1. Uninstall the add-on. Its bounded last decision remains preserved for later review.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
