# Streamer.bot 1.1.0-alpha.12 compatibility evidence

On September 22, 2026, the creator host's automatic pre-upgrade alpha.11 backup (14:54:35) and post-upgrade alpha.12 backup (14:54:38) were compared read-only. Their complete parsed actions databases were identical after excluding only the save timestamp: 129 actions and 42 trigger records. The installed trigger inspection also found all six managed intake contracts present, enabled, and without missing or duplicate triggers. The 34 managed intake triggers are a subset of the 42 total trigger records.

The exact alpha.12 compatibility-data alias maps to the embedded alpha.10 registry, as does the previously verified alpha.11 alias. Unknown future versions remain unsupported. Installed automatic trigger repair remains locked until the dedicated compatibility release is published and its provenance verified by the installed Bridge.

The installed Bridge 4.0.11 was started and reported ready with no runtime blockers. Streamer.bot, Speaker.bot 1.0.0-alpha.5, and OBS 32.2.2 were running on their configured ports. Streamer.bot acknowledged three Bridge deliveries without failures; all loaded modules reported healthy. These checks do not establish live-provider event coverage or audible TTS playback.

The bots' upgrade logs contain channel-emote lookup failures and a missing optional Kick Bot credential warning. These originate in the upstream applications, not the Bridge. Kick Broadcaster connected successfully. EventSub timing messages logged at error severity were followed by successful authentication and are not evidence of a subscription failure. Do not suppress logging or remove creator integrations to conceal these messages.
