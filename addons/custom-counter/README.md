# Custom Counter

Custom Counter provides up to 20 named, persistent counters. Values are serialized through StreamBridge and saved atomically in private add-on state. The browser source receives only the selected name, value, icon, and style. Its default chat command is `!streamcounter` to avoid colliding with Creator Utility's `!counter`; creators may rename it to `!counter` only when the other command is disabled.

Import the separate Streamer.bot package for Increment, Decrement, Add, Subtract, Set, Reset, Show, Hide, Rename, Save, and Load. Keep these actions creator-controlled. The optional `!counter` command rechecks normalized broadcaster/moderator roles inside the add-on.

Overlay: `/overlay/addons/thsv.custom-counter`

Use a 512 x 512 PNG or WebP with a transparent background for the optional icon. The browser source keeps the icon inside a square `object-fit: contain` box, so a non-square source is never stretched. The current wizard accepts an image URL; local upload/cropping is intentionally not performed without explicit creator action.

No chat text, viewer identity, secrets, or raw events are retained.
