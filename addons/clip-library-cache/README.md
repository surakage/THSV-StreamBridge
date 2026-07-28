# Clip Library Cache

This helper performs one bounded Twitch clip metadata lookup for all installed clip consumers. It stores stable IDs, titles, creator names, canonical clip links, thumbnails, duration, and refresh time in private add-on state.

It does **not** download videos or cache signed playback URLs; those expire and are resolved only when a clip is selected for playback. Import the bundled Streamer.bot package, leave Refresh triggerless, and approve that one action. Its internal refresh is excluded from Streamer.bot Pending and Action History to keep long-running sessions readable.
