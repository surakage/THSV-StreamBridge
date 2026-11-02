# Setup Wizard Launcher

Import the reviewed `.sb` file, then run **THSV StreamBridge - Open Setup Wizard** whenever you need the wizard. The action verifies the local Bridge, requests a short-lived single-use unlock ticket, and opens the wizard already authenticated in the default browser. The permanent control token is never placed in the URL or browser history, and the temporary ticket is removed from the address before it is exchanged.

No token lookup or copy-and-paste is required. Manual token entry remains available in the locked page only as an advanced recovery fallback.

The launcher reads the configured local port automatically. It does not create, edit, delete, enable, disable, or run any other Streamer.bot object.

## Open Control Deck

**THSV - Open Control Deck** opens the Control Deck: one small window with a tab for each extension you can control during the stream (mark a punishment done, spin the prize wheel, start a break, and more). It unlocks the same safe way as the wizard.

To open it on one extension's tab, set the action's `controlDeckTab` argument to that extension's ID, for example `thsv.prize-wheel` or `thsv.streamer-punishments`. Leave it blank to open the last tab you used. The action ships without triggers; add a Stream Deck button or hotkey yourself if you want one.
