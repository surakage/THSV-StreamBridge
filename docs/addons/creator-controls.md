# Creator Controls setup

**Module:** `thsv.creator-controls`
**Version:** `3.0.0`
**Publisher:** THSV StreamBridge

Applies creator-authored Twitch, YouTube, and Kick channel profiles through one guarded shared Streamer.bot provider controller.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Creator-Controls-3.0.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Creator-Controls-3.0.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Creator-Controls-3.0.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the bundled Creator Controls Streamer.bot package.
2. Approve only its triggerless Provider Controller action in the wizard.
3. Edit the three profiles, then attach Profile 1/2/3 only to creator-controlled hotkeys, deck buttons, or scene actions.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Creator Controls`

- `THSV Addon - Creator Controls - Provider Controller` in `THSV Addon - Creator Controls`
- `THSV Addon - Creator Controls - Apply Profile 1` in `THSV Addon - Creator Controls`
- `THSV Addon - Creator Controls - Apply Profile 2` in `THSV Addon - Creator Controls`
- `THSV Addon - Creator Controls - Apply Profile 3` in `THSV Addon - Creator Controls`

Provider Controller must remain triggerless and requires a one-use broker token. Profile request actions only relay an exact profile ID; StreamBridge validates saved fields before dispatch.

Creator-selected triggers:

- **profiles:** Optional: attach Apply Profile 1/2/3 only to creator-controlled hotkeys, deck buttons, or approved Scene Actions targets.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.creator-controls` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.creator-controls.runtime:** Confirms guarded creator profiles can use the shared provider controller.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `state.private`.

Private storage: `data/addons/thsv.creator-controls/`, `data/addons/.state/thsv.creator-controls/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Its bounded last-result audit remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
