# THSV StreamBridge — Chat Play Pack

This package contains two triggerless provider actions used by the 11 Chat Play commands built into StreamBridge. One action retrieves a bounded OpenTDB question batch; the other retrieves a bounded random word batch and verifies each candidate through Free Dictionary API.

Requests contain only provider filters, word lengths, and batch sizes. They never contain chat text, viewer identity, point balances, or bridge secrets. Creator fallback questions and words keep games usable during provider outages. Unscramble caches each fetched batch and consumes it without repeats before requesting another batch.

Import the package once. Do not create separate Streamer.bot Command objects or attach triggers to its provider actions. The existing THSV Twitch, YouTube, and Kick intakes—and the TikFinity intake for TikTok—already relay public chat to Chat Play. The wizard's game toggles decide which Bridge-owned commands respond.

Approve only the provider action(s) enabled in the wizard. StreamBridge dispatches them with one-use relay tokens and validates the returned add-on namespace. If an older package created native `!play`, `!guess`, `!answer`, `!predict`, `!coinflip`, `!slots`, `!roulette`, `!rps`, `!duel`, `!accept`, or `!decline` entries, disable those legacy Command objects. If an older Command Sync export created `THSV Command - Chat Play` actions, disable those too.
