# Chat Play Pack

Chat Play Pack adds cross-platform Coin Flip, Slots, Color Roulette, Rock Paper Scissors, Number Guess, Trivia, Unscramble, Prediction, and accepted viewer Duels. Viewer Foundation remains the only point ledger. Winners gain bounded, idempotent points; losses never debit a balance; simulations never mutate real progression.

New installations include 20 editable general-knowledge trivia questions with answers and 20 editable Unscramble words with hints. These built-in libraries also remain available at runtime when an older saved configuration has an empty fallback list.

## Setup for beginners

1. Install and enable Viewer Foundation.
2. Enable only the games you want in the wizard and keep the default anti-farming limits initially.
3. Import `THSV-StreamBridge-Chat-Play-Pack-4.0.6.sb` only when using the optional OpenTDB or Dictionary provider actions. Viewer commands already use the main chat intakes.
4. Add creator trivia as `Question | Correct answer | Alternate 1; Alternate 2` and fallback Unscramble entries as `Word | Optional hint`.
5. Leave the imported provider actions triggerless and approve only the fetch action(s) you enabled. Do not add command triggers or sub-actions: the existing Twitch, YouTube, Kick, and TikFinity platform intakes deliver public chat to Chat Play directly.
6. Add the add-on browser source only if you want result cards. Games continue through chat when the source is closed.

Enable or disable games with the wizard toggles. Commands register automatically after restart. Once that path is verified, disable older native or Command Sync game-command entries to keep Streamer.bot tidy.

Moderators start shared rounds with `!play number`, `!play trivia`, or `!play unscramble`; `!play stop` closes the current room. Solo results return only to their source platform. Shared questions can be announced to every currently live platform.

Duels use `!duel @name`, followed by `!accept` or `!decline`. The target must have chatted recently on the same platform, which lets the add-on resolve the display name to a stable Viewer Foundation identity without retaining raw account IDs.

OpenTDB is an optional external, keyless provider. Only question filters are sent. Its data is CC BY-SA 4.0. Mixed mode falls back to creator questions when the provider or approved action is unavailable.

Unscramble's recommended **Dictionary API with creator fallback** mode requests a small random English word batch, validates each candidate with Free Dictionary API, and uses a short definition as its hint. Only length and batch settings leave the machine. The batch is cached and consumed without repeats before another provider call; outages fall back immediately to the creator list.
