# Clip Courier setup

**Module:** `thsv.clip-courier`
**Version:** `2.5.0`
**Publisher:** THSV StreamBridge

Discovers bounded Twitch clips and publishes each stable clip once to a Discord channel or forum.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Clip-Courier-2.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Clip-Courier-2.5.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Clip-Courier-2.5.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Import the Clip Courier Streamer.bot package.
2. Put a private Discord webhook in its Deliver action and leave both actions triggerless.
3. Approve Get Clips and Deliver, configure the destination, then enable the add-on.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-beta.1`.

Imported group: `THSV Addon - Clip Courier`

- `THSV Addon - Clip Courier - Get Clips` in `THSV Addon - Clip Courier`
- `THSV Addon - Clip Courier - Deliver` in `THSV Addon - Clip Courier`

Both actions remain triggerless and require one-use broker tokens. The webhook stays only in Deliver's Set Argument.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.clip-courier` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.clip-courier.runtime:** Confirms bounded Twitch discovery and idempotent Discord publication are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `state.private`.

Private storage: `data/addons/thsv.clip-courier/`, `data/addons/.state/thsv.clip-courier/`.

Dependencies: `thsv.clip-library-cache`.

## Remove or repair

1. Uninstall the add-on. Its bounded publication history remains preserved.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
