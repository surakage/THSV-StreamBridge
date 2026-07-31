# Ko-fi Donations setup

**Module:** `thsv.kofi-donations`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Receives verified Ko-fi Donation triggers through Streamer.bot and publishes stable-ID donations into StreamBridge's durable alert pipeline with privacy controls.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Ko-fi-Donations-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Ko-fi-Donations-2.5.2.thsv-addon` and review its permissions.
3. Import `Streamer.bot/THSV-StreamBridge-KoFi-Donations-2.5.2.sb` in Streamer.bot.
4. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Connect Ko-fi to Streamer.bot using Streamer.bot Website Webhooks and the Ko-fi verification token.
2. Import the Ko-fi Donations Streamer.bot package and attach Ko-Fi > Donation to its intake action.
3. Install this add-on, review its financial-event permission, configure privacy, enable it, and restart StreamBridge.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.5-alpha.32`.

Imported group: `THSV Addon - Ko-fi Donations`

- `THSV Addon - Ko-fi Donations - Intake` in `THSV Addon - Ko-fi Donations`

Attach only Ko-Fi > Donation. The action rejects missing stable messageId values and never generates a replacement payment ID.

Creator-selected triggers:

- **0:** Integrations > Ko-Fi > Donation

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.kofi-donations` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.kofi-donations.runtime:** Confirms stable-ID Ko-fi donations can enter the validated durable alert pipeline.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `provider.events.publish`.

Private storage: `data/addons/thsv.kofi-donations/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. StreamBridge stores no Ko-fi webhook secrets or payment history.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
