# Setup Wizard Launcher

Import the reviewed `.sb` file, then run **THSV StreamBridge - Open Setup Wizard**. The action opens `http://127.0.0.1:8787/wizard/` in the default browser. It does not pass credentials in the URL and does not create, edit, delete, enable, disable, or run any Streamer.bot object.

Unlock the wizard with the token stored at `data/runtime/control-token` in the THSV StreamBridge installation. The token remains only in the open browser tab and is not saved to local storage.

If the bridge uses a non-default port, open the matching `/wizard/` URL manually. Custom launcher-port configuration is deferred until the wizard owns configuration changes in a later stage.
