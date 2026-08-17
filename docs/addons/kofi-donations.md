# Ko-fi Donations setup

**Module:** `thsv.kofi-donations`
**Version:** `3.6.0`
**Publisher:** THSV StreamBridge

Receives verified Ko-fi Donation triggers through Streamer.bot and publishes stable-ID donations into StreamBridge's durable alert pipeline with privacy controls.

## Built-in setup

1. Ko-fi Donations is installed and updated with StreamBridge; do not install a separate `.thsv-addon`.
2. In **Wizard > Streamer.bot > One Streamer.bot import**, select Ko-fi Donations and generate the universal import.
3. Import that one `.sb` file, then attach **Integrations > Ko-Fi > Donation** to `THSV Addon - Ko-fi Donations - Intake`.
4. In **Wizard > Alerts > Donation provider setup**, configure privacy, turn on Ko-fi intake, save, and restart StreamBridge.

### Add-on-specific steps

1. Connect Ko-fi to Streamer.bot using Streamer.bot Website Webhooks and the Ko-fi verification token.
2. Include Ko-fi Donations in the universal Streamer.bot import and attach Ko-Fi > Donation to its intake action.
3. Configure privacy and enable the built-in integration under Alerts.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Ko-fi Donations`

- `THSV Addon - Ko-fi Donations - Intake` in `THSV Addon - Ko-fi Donations`

Attach only Ko-Fi > Donation. The action rejects missing stable messageId values and never generates a replacement payment ID.

Creator-selected triggers:

- **0:** Integrations > Ko-Fi > Donation

## Browser source

Ko-fi donations use the main alert overlay at `http://127.0.0.1:8787/overlay/alerts`; no Ko-fi-specific browser source is needed.

## Offline test

1. Keep the bridge and Streamer.bot running, then open **Alerts > Donation provider setup** in the wizard.
2. Save the intended settings and use the Ko-fi alert preview.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.kofi-donations.runtime:** Confirms stable-ID Ko-fi donations can enter the validated durable alert pipeline.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `provider.events.publish`.

Private storage: `data/addons/thsv.kofi-donations/`.

Dependencies: none.

## Remove or repair

1. Turn off Ko-fi intake under **Alerts > Donation provider setup**. The integration remains available and StreamBridge stores no Ko-fi webhook secrets or payment history.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
