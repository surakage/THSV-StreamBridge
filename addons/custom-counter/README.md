# Custom Counter

Custom Counter provides up to 20 named, persistent counters. Values are serialized through StreamBridge and saved atomically in private add-on state. The browser source receives only the selected name, value, icon, and style.

The safest multi-counter setup uses one Bridge-managed command namespace:

- `!streamcounter deaths +1`
- `!streamcounter wins +1`
- `!streamcounter deaths reset`
- `!streamcounter wins show`

For shorter controls, add one counter command per wizard line: `death=deaths|Deaths` and `win=wins|Wins`. Those lines create distinct moderator commands and the named counter on first use. With no argument, `!death` increments by one. The same command also supports `!death -1`, `!death reset`, `!death set 5`, `!death add 10`, `!death show`, `!death hide`, and `!death rename Boss Deaths`. Duplicate, malformed, or conflicting names are ignored, and the effective command registry blocks collisions with commands owned by another add-on or the creator configuration.

Wizard-created counter commands do not require the Streamer.bot import or custom Streamer.bot Command objects. The separate import remains available only for creator hotkeys, Stream Deck buttons, and other trusted non-chat triggers. The add-on rechecks normalized broadcaster/moderator roles for every Bridge-managed command.

Overlay: `/overlay/addons/thsv.custom-counter`

Use a 512 x 512 PNG or WebP with a transparent background for the optional icon. The browser source keeps the icon inside a square `object-fit: contain` box, so a non-square source is never stretched. The current wizard accepts an image URL; local upload/cropping is intentionally not performed without explicit creator action.

No chat text, viewer identity, secrets, or raw events are retained.
