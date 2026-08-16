# Discord Chat Archive setup

**Module:** `thsv.discord-chat-archive`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Copies creator-selected normalized public chat to one private Discord webhook through a bounded, privacy-gated Streamer.bot delivery action.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Discord-Chat-Archive-3.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Discord-Chat-Archive-3.6.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Discord-Chat-Archive-3.6.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Create a private Discord webhook for the archive channel and never share its URL.
2. Import the Discord Chat Archive Streamer.bot package, edit its webhook Set Argument, compile it, and run it manually once for a safe test.
3. Install this add-on, approve only the imported Deliver action, review the privacy notice and ignore list, then enable it.

### Recommended archive layout

Use **Forum** with **Clean embeds**. Follower chat is kept in one dated forum post per live session, or one post per calendar day when chat arrives without a live lifecycle signal. The first post contains the session date and time; later confirmed batches append beneath it. Twitch, YouTube, Kick, and TikTok use separate configurable embed colors while consecutive platform groups preserve the conversation order. A forum tag applies to the whole session post, so do not create one forum thread per individual chat message.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Discord Chat Archive`

- `THSV Addon - Discord Chat Archive - Deliver` in `THSV Addon - Discord Chat Archive`

Broker-dispatched only. Do not attach platform triggers. A manual run with no delivery arguments sends one safe setup test.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.discord-chat-archive` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.discord-chat-archive.runtime:** Confirms bounded public-chat filtering, batching, and approved Discord delivery are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `schedule.bounded`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.discord-chat-archive/`, `data/addons/.state/thsv.discord-chat-archive/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. No chat transcript or webhook URL is stored by StreamBridge.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
