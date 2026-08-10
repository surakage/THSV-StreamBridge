# Village Fun Commands

Village Fun Commands adds source-routed entertainment commands without creating separate Streamer.bot Command objects. It registers through the existing THSV platform chat intakes and sends exactly one bounded response back to the platform that invoked it.

The add-on includes local sloth facts, Magic 8-Ball, hugs, streamer timezone/time, dice, list picking, ratings, colors, and Twitch `!followage`. Cat facts, family-friendly jokes, general facts, number facts, and optional Chuck Norris jokes can use one approved, triggerless Streamer.bot fetch action. Every entertainment command with an online provider has a local fallback and a short circuit-breaker cooldown, so provider outages never stop the command system.

## Setup

1. Install the add-on in the StreamBridge wizard.
2. Import the bundled Streamer.bot package. Approve **Fetch Fun Content** when online providers are enabled and approve **Twitch Follow Age** when `!followage` is enabled. Leave both actions triggerless.
3. Choose the commands you want. Chuck Norris and Aesthetic begin disabled.
4. Save and restart StreamBridge. Do not create separate Streamer.bot Command objects.
5. Test `!hug Viewer`, `!hugs`, and `!timezone` from one connected platform chat. Older standalone Hug and Timezone Streamer.bot commands can then be disabled to prevent duplicate replies.

The fun-content helper accepts only a fixed provider identifier and an optional bounded integer. It never sends viewer identity, usernames, chat history, or arbitrary URLs. The follow-age helper sends only the invoking Twitch viewer ID and broadcaster ID to Twitch's fixed followers endpoint using Streamer.bot-held credentials; it never logs or relays the credential or raw API body. All responses are size-bounded, cleaned, correlated with a one-use relay token, and discarded if late or mismatched.

Optional providers are [Cat Facts](https://catfact.ninja/), [JokeAPI](https://jokeapi.dev/), [Random Useless Facts](https://uselessfacts.jsph.pl/), [Numbers API](http://numbersapi.com/), and the opt-in [Chuck Norris Jokes API](https://api.chucknorris.io/). JokeAPI uses safe mode and every documented blacklist flag, but no public humor service can guarantee creator-specific moderation. Disable online providers to use only the built-in reviewed fallbacks.
