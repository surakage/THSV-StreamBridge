# Translate

**Module:** `thsv.user-translate` · **Version:** `4.0.50` · **Built in (extension)**

Combines viewer-requested and privacy-gated automatic translation, then returns bounded results only to the originating platform without retaining message text.

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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Voice & Language** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Translate`

- `THSV Addon - Translate - Translate Text` in `THSV Addon - Translate`

Broker-dispatched only. Do not attach triggers; StreamBridge restricts calls to the creator-approved action ID.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.user-translate` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Translate |  | On |
| Translation mode | Manual responds only to commands. Automatic translates eligible normal chat. Both enables both paths. | `manual` |
| Enabled platforms |  | `twitch`, `youtube`, `kick`, `tiktok` |
| Translation provider | Google web supports automatic source detection but is an undocumented no-key endpoint. MyMemory is documented but requires a fixed source language. | `google-web` |
| Source language | Use auto with Google web, or an explicit code such as es with MyMemory. | `auto` |
| Default output language | Used by !translate text and automatic mode. Example: en. | `en` |
| Command prefix |  | `!` |
| Manual command name | With the defaults, !translate buenos dias translates into English. No Streamer.bot command object is required. | `translate` |
| Target-language shortcuts | One code per line. es enables !es hello. These codes also enable the backward-compatible !translate es hello format. | `en`, `es`, `fr`, `de`, `pt` |
| Manual help message | Token: {targetLanguage}. | `Usage: !translate text, !translate {targetLanguage} text, or !{targetLanguage} text. On Twitch, you can also reply with !{targetLanguage}.` |
| Manual translation response | Tokens: {author}, {sourceLanguage}, {targetLanguage}, {translation}. | `{author}: ({targetLanguage}) {translation}` |
| Manual provider failure message |  | `Translation is temporarily unavailable. Please try again later.` |
| Automatic translation audience |  | `allowlist-only` |
| Automatically translate these viewer names or IDs | Recommended: start with a small allowlist. One exact platform name or stable ID per line. | (none) |
| Never automatically translate these names or IDs | Preloaded with common service bots; add or remove exact login names as needed. | `nightbot`, `streamelements`, `fossabot`, `moobot`, `sery_bot`, `soundalerts`, `wizebot`, `kofistreambot`, `botrix`, `streamlabs` |
| Automatic translation response | Tokens: {author}, {sourceLanguage}, {targetLanguage}, {translation}. | `{author}: ({sourceLanguage} to {targetLanguage}) {translation}` |
| Post automatic provider failures in chat |  | Off |
| Automatic provider failure message |  | `Automatic translation is temporarily unavailable.` |
| Maximum input characters |  | 1000 |
| Provider timeout (seconds) |  | 8 |
| Per-viewer cooldown (seconds) |  | 15 |
| Global request cooldown (seconds) |  | 2 |
| Maximum requests waiting |  | 10 |
| Maximum automatic translations per minute |  | 10 |
| Chat messages in percentage window |  | 100 |
| Messages before percentage cap begins |  | 10 |
| Maximum automatically translated chat percentage |  | 25 |

## Health checks

- **thsv.user-translate.runtime:** Confirms bounded manual/automatic selection, provider dispatch, and source-platform response routing.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `chat.send`, `schedule.bounded`, `state.private`, `streamerbot.run-approved-action`.

Private storage: `data/addons/thsv.user-translate/`, `data/addons/.state/thsv.user-translate/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. Only bounded cooldown metadata is retained; message text is never stored.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
