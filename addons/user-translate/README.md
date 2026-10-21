# Translate

Translate helps viewers who speak different languages understand each other in chat. Viewers can ask for a translation with a command, and you can also turn on automatic translation for chosen viewers. The translation is posted back in chat on the same platform the message came from.

## What you need
- The Translate Streamer.bot package, with **THSV Addon - Translate - Translate Text** imported and approved in the wizard. Do not attach a trigger to it; StreamBridge runs it for you.
- No Streamer.bot command objects are needed. StreamBridge reads the commands from chat itself.
- An internet connection: the text is sent to the translation provider you pick.

## Set it up
1. Open Setup Wizard > Add-ons, install Translate and enable it.
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

## Good to know
- Each viewer has a 15 second cooldown, and there is a 2 second gap between any two requests. At most 10 requests wait at once; extra ones are skipped.
- Automatic mode is limited to 10 translations per minute and to 25% of recent chat. It skips commands, bots, test events, ignored viewers, and anyone not on the allowlist (unless you switch the audience to all viewers).
- Messages longer than 1000 characters are cut, and the provider gets 8 seconds to answer.
- Privacy: the message text leaves your computer and goes to Google or MyMemory over HTTPS. StreamBridge never stores the original or translated text, only cooldown data. Remind viewers not to send private information.
- Automatic errors stay out of chat unless you turn on "Post automatic provider failures in chat".
- If you used the old separate Auto Translate add-on, copy its allow and ignore lists here and do not run both at once.
