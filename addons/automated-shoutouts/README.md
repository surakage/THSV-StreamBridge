# Automated Shoutouts

Automated Shoutouts thanks raiders and welcomes viewers for you. It can shout out incoming Twitch raids, welcome a viewer the first time they chat each day, and give moderators a manual shoutout command. Messages go to chat on Twitch, YouTube, Kick or TikTok, and an optional platform-colored card (Twitch purple, YouTube red, Kick green, TikTok cyan/pink) can appear on stream. It never plays clips and never stores chat messages.

## What you need
- The Automated Shoutouts Streamer.bot package. Import it and approve, in the wizard's **Approve Streamer.bot actions** step:
  - **THSV Addon - Automated Shoutouts - Lookup Twitch Creator**: needed whenever Twitch triggers are on. It looks up the Twitch category.
  - **THSV Addon - Automated Shoutouts - Twitch Native Shoutout**: only if **Twitch shoutout mode** is `native` or `both`.
  - Do not attach any triggers to these actions. StreamBridge runs them for you.
- Optional browser source for the cards. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/shoutouts`).
- For TikTok chat output: in TikFinity's Chatbot settings, turn on **Allow Streamer.bot to push messages to TikFinity**.

## Set it up
1. Open the Setup Wizard and go to **Extensions > Community Messaging > Automated Shoutouts**. Enable it and review its permissions.
2. **Quick start**: choose which platforms it watches.
3. **Automatic shoutouts**: raid shoutouts are on by default (set a minimum raid size if you like). Daily welcomes are off by default. Before turning them on, set **Daily reset timezone** (for example `America/Chicago`) and review the safety section.
4. **Manual moderator command**: pick the command name (default `shoutout`). The `!so` alias is added for you. Do not create a matching command in Streamer.bot or Command Sync.
5. **Message destinations**: post replies back to the platform they came from (default), or to selected platforms. Choose the Twitch shoutout mode: `text`, `native` or `both`.
6. Edit the Twitch, YouTube, Kick and TikTok messages. You can add several welcome lines per platform and one is picked at random.
7. **Welcome safety and ignored users**: `Balanced` is the recommended level. Edit the spam phrases, blocked websites and ignored bots to fit your channel.
8. Save, then restart StreamBridge so the command registers.
9. Import the `.sb` file into Streamer.bot and approve the actions listed above.
10. Test it offline: add the browser source, then use **Open overlay & test** to send a preview. Simulated events only show the card. They never send chat or call Twitch.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!shoutout <name>` (or `!so <name>`) | Moderators and the broadcaster | Shouts out the named channel. On Twitch the category is checked first. On YouTube, Kick and TikTok it posts a channel link. |

## Good to know
- Twitch raid and creator shoutouts are sent only when Twitch returns a current category for that channel. YouTube, Kick and TikTok cannot look up a chatter's category, so their automatic messages are always plain welcomes.
- Each viewer gets at most one welcome per calendar day in your chosen timezone, even if you restart the stream. A stable platform user ID is required by default so name changes cannot get around this.
- Spam control: a global cooldown (default 30 seconds), a per-user cooldown (default 60 minutes), one shoutout per user per stream, and a queue of up to 20 that drops old entries (default after 10 minutes).
- Message tokens: `{displayName}`, `{user}`, `{platform}`, `{category}`, `{channelUrl}`, `{viewers}`, `{trigger}` and `{community}` (your community name from Settings, or your channel name). A misspelled token stays visible so you can spot it.
- Each shoutout is one message, trimmed to the platform limit (Twitch 500, YouTube 200, Kick 500, TikTok 150 characters). The channel link is always kept whole.
- The ignored-users list beats every trigger, including the manual command. Your own broadcaster and bot accounts are blocked from automatic shoutouts by default. Rules can be `username`, `platform:username` or `platform:id:user-id`.
