# Quote Vault setup

**Module:** `thsv.quote-vault`
**Version:** `2.5.0`
**Publisher:** THSV StreamBridge

Provides one bounded, moderated, local quote library shared by Twitch, YouTube, Kick, and TikTok with source-platform-only responses.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Quote-Vault-2.5.0.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Quote-Vault-2.5.0.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-Quote-Vault-2.5.0.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and configure Quote Vault. No separate platform chat trigger is required.
2. Choose enabled platforms, command names, submission permissions, and safety limits.
3. Import the optional Quote Vault Streamer.bot package only if creator-triggered random or statistics actions are wanted.
4. Tell moderators that viewer submissions remain pending until approved.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.33`.

Imported group: `THSV Addon - Quote Vault`

- `THSV Addon - Quote Vault - Random Quote` in `THSV Addon - Quote Vault`
- `THSV Addon - Quote Vault - Statistics` in `THSV Addon - Quote Vault`

These optional actions emit only exact Quote Vault control envelopes. Public quote commands are parsed from normalized chat and need no Streamer.bot command or platform trigger.

Creator-selected triggers:

- **randomQuote:** Optional: attach to a creator-controlled hotkey, deck button, timer, or scene action.
- **statistics:** Optional: attach only to a creator-controlled hotkey or deck button.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.quote-vault` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.quote-vault.runtime:** Confirms bounded cross-platform quote commands, moderation, storage, and source-routed responses.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `state.private`.

Private storage: `data/addons/thsv.quote-vault/`, `data/addons/.state/thsv.quote-vault/`.

Dependencies: none.

## Remove or repair

1. Export or record wanted quotes before uninstalling. Private Quote Vault state remains preserved for a later reinstall.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
