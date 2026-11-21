# Ko-fi Donations

**Module:** `thsv.kofi-donations` · **Version:** `4.1.157` · **Built in (integration)**

Receives verified Ko-fi donations through Streamer.bot and shows each one once as a StreamBridge alert. Donations are saved first so a hiccup does not lose them. Includes privacy controls.

Ko-fi Donations brings your Ko-fi tips into StreamBridge, so each donation can show as an on-stream alert and, if you like, as a message in the chat overlay. Ko-fi sends the donation to Streamer.bot, and Streamer.bot passes it on to StreamBridge. Private supporters stay private: their names and messages are never shown.

## What you need
- Your own Ko-fi account connected to Streamer.bot through a Streamer.bot website webhook and your own Ko-fi verification token (step 1 below shows how).
- The **THSV Addon - Ko-fi Donations - Intake** action in Streamer.bot. Select Ko-fi Donations when you create your universal Streamer.bot import, then give it the **Integrations > Ko-Fi > Donation** trigger.
- The StreamBridge alerts browser source (and the chat overlay, if you want chat messages). No extra overlay is needed.

## Set it up
1. Connect your Ko-fi account:
    1. On the Streamer.bot website, open **User Settings > Webhooks** ([streamer.bot/user/integrations/webhooks](https://streamer.bot/user/integrations/webhooks)), create a webhook, choose **Ko-Fi**, give it a name and keep **Enabled** on.
    2. Press **Configure** and copy the **Webhook URL**. Keep that page open.
    3. On Ko-fi, open **Settings > API** ([ko-fi.com/manage/webhooks](https://ko-fi.com/manage/webhooks)), paste the URL into **Webhook URL** and press **Update**.
    4. Open **Advanced** on that Ko-fi page and copy your **Verification Token**.
    5. Back on the Streamer.bot webhook, paste it into **Verify Secret** and press **Save**.

   The token belongs to your Ko-fi account and stays on the Streamer.bot website. See the [Streamer.bot Ko-fi guide](https://docs.streamer.bot/guide/integrations/ko-fi).
2. Create (or re-create) your universal Streamer.bot import with **Ko-fi Donations** selected, and import it. Accept the C# warning.
3. Attach only **Integrations > Ko-Fi > Donation** to **THSV Addon - Ko-fi Donations - Intake**.
4. Open Setup Wizard > Alerts > Donation provider setup (Ko-fi Donations). Choose your privacy options: show public supporter names, show public messages, and the label used for private supporters (default "Anonymous Ko-fi supporter").
5. Turn on **Enable Ko-fi donation intake**, save, and restart StreamBridge.
6. Style the alert under Alerts > Ko-fi > Donation (card, sound, duration, preview). For a chat overlay message, open Chat Overlay > Chat events and enable **Ko-fi events**.
7. Use the alert preview to check the look offline. To test the full path, send a test webhook from Ko-fi after the trigger is attached.

## Good to know
- Private Ko-fi donations always show the private supporter label and no message, whatever your settings.
- The alert and the chat overlay message are separate. Turning off the chat message does not turn off the alert.
- Donations without Ko-fi's message ID, or with a broken amount or currency, are rejected. Repeat deliveries of the same donation are ignored.
- Accepted donations are queued and retried, so a short hiccup does not lose them.
- StreamBridge never stores your Ko-fi verification token or a payment history.

## Where to find it

1. This integration ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this integration in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from **Alerts > Donation provider setup**, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Ko-fi Donations`

- `THSV Addon - Ko-fi Donations - Intake` in `THSV Addon - Ko-fi Donations`

Attach only Ko-Fi > Donation. Donations without a Ko-fi messageId are refused.

Creator-selected triggers:

- Integrations > Ko-Fi > Donation

## Browser source

Ko-fi donations use the main alert overlay at `http://127.0.0.1:8787/overlay/alerts`; no provider-specific browser source is needed.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Receive Ko-fi donations | Leave off until Ko-fi is set up in Streamer.bot. | Off |
| Provider label |  | `Ko-fi` |
| Show public supporter messages | Private Ko-fi messages are never exposed regardless of this setting. | On |
| Show public supporter names |  | On |
| Private or hidden supporter label |  | `Anonymous Ko-fi supporter` |

## Health checks

- **thsv.kofi-donations.runtime:** Checks that Ko-fi donations with a valid ID can reach your alerts and are saved until shown.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `provider.events.publish`.

Private storage: `data/addons/thsv.kofi-donations/`.

Dependencies: none.

## Remove or repair

1. Turn off Ko-fi donations in Alerts. The integration remains available with StreamBridge and stores no Ko-fi webhook secrets or payment history.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
