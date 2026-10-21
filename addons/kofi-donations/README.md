# Ko-fi Donations

Ko-fi Donations brings your Ko-fi tips into StreamBridge, so each donation can show as an on-stream alert and, if you like, as a message in the chat overlay. Ko-fi sends the donation to Streamer.bot, and Streamer.bot passes it on to StreamBridge. Private supporters stay private: their names and messages are never shown.

## What you need
- A Ko-fi account connected to Streamer.bot through Streamer.bot's website webhook and your Ko-fi verification token. Follow the official Streamer.bot Ko-fi guide (linked in the wizard).
- The **THSV Addon - Ko-fi Donations - Intake** action in Streamer.bot. Select Ko-fi Donations when you create your universal Streamer.bot import, then give it the **Integrations > Ko-Fi > Donation** trigger.
- The StreamBridge alerts browser source (and the chat overlay, if you want chat messages). No extra overlay is needed.

## Set it up
1. In Streamer.bot, create the Ko-fi webhook on the Streamer.bot website. Add that URL and your verification token in your Ko-fi account settings.
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
