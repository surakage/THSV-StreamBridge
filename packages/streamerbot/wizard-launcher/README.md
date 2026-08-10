# Setup Wizard Launcher

Import the reviewed `.sb` file, then run **THSV StreamBridge - Open Setup Wizard** whenever you need the wizard. The action verifies the local Bridge, requests a short-lived single-use unlock ticket, and opens the wizard already authenticated in the default browser. The permanent control token is never placed in the URL or browser history, and the temporary ticket is removed from the address before it is exchanged.

No token lookup or copy-and-paste is required. Manual token entry remains available in the locked page only as an advanced recovery fallback.

The launcher reads the configured local port automatically. It does not create, edit, delete, enable, disable, or run any other Streamer.bot object.
