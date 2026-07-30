# Clip Library Cache

Clip Library Cache is shared infrastructure for optional clip add-ons. It stays separate from Bridge Core so creators who do not use clip features install no Twitch clip polling or clip-specific state.

Install it once when Random Clip Player, Clip Courier, or another add-on declares `thsv.clip-library-cache` as a dependency. Its one approved triggerless Streamer.bot action reads a bounded list of public Twitch clip metadata through the creator's existing Twitch connection. StreamBridge stores only the bounded metadata snapshot and distributes it to approved consumers.

This helper does not play clips, post to Discord, render an overlay, download video files, or retain short-lived signed playback URLs. Those responsibilities remain with the consuming add-ons.

Recommended setup: import the matching Streamer.bot package, leave **Refresh** triggerless, approve only that action in the wizard, keep the default refresh limits, enable the shared clip list, and restart StreamBridge.
