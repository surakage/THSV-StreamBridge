# THSV StreamBridge — Chat Play Pack

This package contains all 11 ready-to-use Chat Play command entries plus two triggerless provider actions. One action retrieves a bounded OpenTDB question batch; the other retrieves a bounded random word batch and verifies each candidate through Free Dictionary API.

Requests contain only provider filters, word lengths, and batch sizes. They never contain chat text, viewer identity, point balances, or bridge secrets. Creator fallback questions and words keep games usable during provider outages. Unscramble caches each fetched batch and consumes it without repeats before requesting another batch.

Import the package once. Do not attach triggers or sub-actions to its commands or provider actions. The existing THSV Twitch, YouTube, and Kick intakes—and the TikFinity intake for TikTok—already relay public chat to Chat Play. The wizard's game toggles decide which imported commands respond.

Approve only the provider action(s) enabled in the wizard. StreamBridge dispatches them with one-use relay tokens and validates the returned add-on namespace. If an older Command Sync export created `THSV Command - Chat Play` actions, disable or remove those legacy entries after importing this package.
