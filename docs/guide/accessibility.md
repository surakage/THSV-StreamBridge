# Accessibility features

StreamBridge has several features that make your stream easier to follow for viewers who are deaf or hard of hearing, who watch without sound, or who speak another language. This page lists them in one place. Each one has its own switch, and you can use any mix of them.

## Closed captions of what you say

Shows your own speech as captions on stream, live.

- **Where:** the wizard's **Closed Captions** page.
- **How it works:** Streamer.bot's **Voice Control** turns your microphone into text, and StreamBridge shows it on the captions overlay. Nothing is recorded or saved.
- **Overlay:** `http://127.0.0.1:8787/overlay/captions` as a transparent 1920×1080 browser source.
- **Good to know:** you can mask words you never want captioned, add accent corrections (for example a name the speech engine keeps getting wrong), and set how long each caption stays up.

## Captions of chat and stream events

Shows short, high-contrast captions for follows, subs, raids, Super Chats and donations, and optionally public chat messages.

- **Where:** **Extensions > Accessibility Captions**.
- **Readability:** maximum caption length, how long it stays up, font size, high-contrast mode, and background and text colors.
- **Good to know:** chat captions are off by default. Turn them on only if you are happy to show viewer messages on stream. See [Accessibility Captions](../addons/accessibility-captions.md).

## Translation for viewers who speak another language

- **Chat translation:** viewers type `!translate`, or StreamBridge translates messages that are not in your language automatically. Replies go back only to the platform the message came from.
- **Your voice, translated:**
  - `!translateme spanish` posts what you say, translated, in that viewer's chat. It is batched every 30 seconds, so chat isn't flooded.
  - `!whatdidyousay japanese` translates your last 30 seconds once.
  - `!captions german` shows your speech translated on the Translate overlay for everyone.
- **Push to Talk:** a Stream Deck button that translates the next thing you say into chat, or into on-screen captions only.
- **Where:** **Extensions > Voice & Language > Translate**. See [Translate](../addons/user-translate.md).

## Hearing alerts and chat

For viewers who listen rather than read, **Village Voice** can read alerts and viewer messages aloud through Speaker.bot. See [Village Voice](../addons/voice-relay.md).

## Keeping overlays readable and out of the way

- Each feature card's **Overlay** tab has **Card position** and **Card size**, so cards stay clear of your webcam, chat and gameplay, and can be made larger.
- Set a browser source's width and height to its final size instead of scaling it in OBS, so text stays sharp.

## Tips for an accessible stream

- Put captions where they don't cover your face, chat or the game's own subtitles.
- Use high contrast for captions: light text on a solid dark background is easiest to read.
- Test captions with your real microphone before going live: the wizard's **Closed Captions** page has **Send preview caption**.
