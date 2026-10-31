# Translate

Translate helps viewers who speak different languages understand each other in chat. Viewers can ask for a translation with a command, and you can also turn on automatic translation for chosen viewers. The translation is posted back in chat on the same platform the message came from.

## What you need
- The Translate Streamer.bot package, with **THSV Addon - Translate - Translate Text** imported and approved in the wizard. Do not attach a trigger to it; StreamBridge runs it for you.
- No Streamer.bot command objects are needed. StreamBridge reads the commands from chat itself.
- An internet connection: the text is sent to the translation provider you pick.

## Set it up
1. Open Setup Wizard > Extensions, install Translate and enable it.
2. Import the Translate package into Streamer.bot. In the wizard, inspect Streamer.bot and approve only Translate Text.
3. Choose a mode: **Manual** (recommended to start) answers only commands, **Automatic** translates ordinary chat, **Both** does both.
4. Pick a provider and languages:
   - **Google web** can detect the source language (`auto`), so `!translate buenos dias` just works. It is an unofficial endpoint and may change without notice.
   - **MyMemory** is a documented free service but needs a fixed source language such as `es`; it cannot use `auto`.
5. Set the default output language (English by default) and the language shortcuts you want (`en`, `es`, `fr`, `de`, `pt` by default).
6. If you use Automatic, keep the audience on **allowlist-only** and add a few exact viewer names or IDs. Common bots are already on the ignore list.
7. Restart StreamBridge. Test by typing `!translate buenos dias` in chat; you should get one English reply on that platform.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!translate buenos dias` | Everyone | Translates the text into your default output language. |
| `!translate fr hello` | Everyone | Translates into the language you name (must be one of your shortcuts). |
| `!es hello` (and `!en`, `!fr`, `!de`, `!pt`) | Everyone | Shortcut: translates into that language. |
| Reply with `!en` | Everyone (Twitch only) | Translates the message you replied to. |
| `!translate` | Everyone | Shows how to use the command. |

## Voice translation
Viewers can ask for what you say to be translated into their language. It uses your Live Captions speech (Streamer.bot Voice Control > Dictation), so turn on Live Captions first. There are three options under **6. Voice translation**, each with its own switch:

- **Follow along in chat** (`!translateme es`): what you say is collected for the batch window (30 seconds by default) and posted as one translated message on that viewer's platform, for example `@Ana @Luis (Spanish): ...`. Viewers who pick the same language on the same platform share one message. It stops after 15 minutes or when the viewer types `!translateme off`.
- **What did you say** (`!whatdidyousay ja`): translates the last 30 seconds of your speech once, into that viewer's chat. Each viewer can ask once every 30 seconds.
- **Captions on screen** (`!captions de`): shows your speech translated on the Translate overlay for 10 minutes. Add `http://127.0.0.1:8787/overlay/addons/thsv.user-translate` as a browser source. `!captions off` clears them.

Viewers can type the language code (`es`), its English name (`spanish`) or its own name (`español`). Only the languages you list can be picked, and at most 3 run at once by default. Your speech is kept in memory for two minutes at most and is never saved; translated text is sent to the translation provider you chose.

### Bilingual captions

Shows what you say on screen with a translation underneath, like subtitles on Japanese streams: your own words on the first line, then one or two translations (for example Spanish and Japanese) under it.

1. Make sure Live Captions is on and the Translate overlay is added as a browser source.
2. In section **6b. Bilingual captions**, turn on **Bilingual captions** and pick up to two languages.
3. Optional: turn off **show your own words on top** to show only the translation.

What you say in a short window (3 seconds by default) becomes one caption, so the translator is called once per language per caption, not for every few words.

### Stream Deck button (Push to Talk)
Turn on **9. Stream Deck button** to translate what you say with one button, without any viewer asking first.

1. Re-import the Translate package so Streamer.bot has **THSV Addon - Translate - Push to Talk**. It needs no approval and no trigger.
2. In the Stream Deck app, add a Streamer.bot **Run Action** button and pick **THSV Addon - Translate - Push to Talk**.
3. Press the button and talk. When you pause for 4 seconds, press again, or reach 2 minutes, what you said is translated into your chosen languages (Spanish by default) and posted once per language.

Each button can have its own arguments in Streamer.bot, so you can make several buttons:

| Argument | Example | What it changes |
|---|---|---|
| `pushToTalkOutput` | `captions` | `chat`, `captions` (on-screen only) or `both` |
| `pushToTalkPlatforms` | `youtube,kick` | Which chats get the message |
| `pushToTalkLanguages` | `es,ja` | Which languages, from your list |

Leave an argument empty to use the wizard settings. Like the other voice options, it needs Live Captions turned on.

## Good to know
- Each viewer has a 15 second cooldown, and there is a 2 second gap between any two requests. At most 10 requests wait at once; extra ones are skipped.
- Automatic mode is limited to 10 translations per minute and to 25% of recent chat. It skips commands, bots, test events, ignored viewers, and anyone not on the allowlist (unless you switch the audience to all viewers).
- Messages longer than 1000 characters are cut, and the provider gets 8 seconds to answer.
- Privacy: the message text leaves your computer and goes to Google or MyMemory over HTTPS. StreamBridge never stores the original or translated text, only cooldown data. Remind viewers not to send private information.
- Automatic errors stay out of chat unless you turn on "Post automatic provider failures in chat".
- If you used the old separate Auto Translate add-on, copy its allow and ignore lists here and do not run both at once.
