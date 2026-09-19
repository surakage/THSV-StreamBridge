# Quote Vault setup

**Module:** `thsv.quote-vault`
**Version:** `4.0.11`
**Publisher:** THSV StreamBridge

Provides one bounded, moderated, local quote library shared by Twitch, YouTube, Kick, and TikTok with source-platform-only responses.

## Built-in setup

1. This extension is bundled and updated with THSV StreamBridge; do not download a separate add-on archive.
2. Select this extension when generating the one universal Streamer.bot import, then import that one `.sb` file.
3. Configure it from the **Extensions > Community Messaging** component catalogue, save, and restart StreamBridge when prompted.

### Extension-specific steps

1. Install and configure Quote Vault. No separate platform chat trigger is required.
2. Choose enabled platforms, command names, submission permissions, and safety limits.
3. Import the optional Quote Vault Streamer.bot package only if creator-triggered random or statistics actions are wanted.
4. Use the wizard Quote library to add, edit, approve, delete, or restore quotes. Moderator submissions are approved automatically.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Quote Vault`

- `THSV Addon - Quote Vault - Random Quote` in `THSV Addon - Quote Vault`
- `THSV Addon - Quote Vault - Statistics` in `THSV Addon - Quote Vault`
- `THSV Addon - Quote Vault - Native Quote Sync` in `THSV Addon - Quote Vault`

These optional actions emit only exact Quote Vault control envelopes. Public quote commands are parsed from normalized chat and need no Streamer.bot command or platform trigger.

Creator-selected triggers:

- **randomQuote:** Optional: attach to a creator-controlled hotkey, deck button, timer, or scene action.
- **statistics:** Optional: attach only to a creator-controlled hotkey or deck button.

## Browser source

When this extension publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.quote-vault` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the extension has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open the **Extensions > Community Messaging** component catalogue.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.quote-vault.runtime:** Confirms bounded cross-platform quote commands, moderation, storage, and source-routed responses.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.quote-vault/`, `data/addons/.state/thsv.quote-vault/`.

Dependencies: none.

## Remove or repair

1. Export or record wanted quotes before uninstalling. Private Quote Vault state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
