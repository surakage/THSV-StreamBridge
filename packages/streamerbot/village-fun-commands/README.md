# THSV StreamBridge - Village Fun Commands

Import this package only when **Use online providers** is enabled in Village Fun Commands. It creates one triggerless action in its own Streamer.bot group.

Approve the action in the add-on wizard. Do not attach chat triggers or create Streamer.bot Command objects: the main THSV platform intakes register and route the commands automatically.

The helper accepts only five built-in providers, a one-use relay token, a request ID, and an optional bounded integer. It never sends viewer identity or arbitrary chat text to those services.
