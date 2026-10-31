# Village Voice

Village Voice speaks your alert thank-yous out loud through Speaker.bot: follows, subs, gifts, donations, cheers, raids, Super Chats and like milestones. You can also let viewers pay for text-to-speech: with a channel point reward on Twitch and Kick, or with StreamBridge points on YouTube and TikTok. An optional speaker card on stream shows the viewer's avatar, platform and message while it is read.

## What you need
- Speaker.bot, connected in Streamer.bot, with a Voice Alias set up.
- The Voice Relay Streamer.bot package. Approve only **THSV Addon - Voice Relay - Speak** in the wizard and keep it triggerless. **THSV Addon - Voice Relay - Pause**, **Resume** and **Stop** are optional; attach them only to your own hotkeys or deck buttons.
- The **Viewer Foundation** extension, enabled, for YouTube and TikTok requests.
- Optional, for viewer TTS: a Twitch channel point reward that requires viewer input (created in Streamer.bot) and a Kick channel reward. Paste the reward IDs into the wizard, and make sure Reward Redemption is attached to your Twitch and Kick intake actions.
- Optional: a browser source for the speaker card. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.voice-relay`).

## Set it up
1. In Speaker.bot, create a Voice Alias.
2. Import the Voice Relay package into Streamer.bot and approve Speak in the wizard.
3. Open Setup Wizard > Extensions > Village Voice and enter the exact Voice Alias (it is case-sensitive).
4. Pick which events get a spoken thank-you, and edit the thank-you wording if you like.
5. Optional: set minimums (donation amount, bits) and how often like milestones are spoken (every 1000 likes by default).
6. For viewer TTS, turn on "Allow viewer TTS requests", paste the Twitch and Kick reward IDs, and check the `!speak` command and points price (100 by default).
7. Check the profanity filter and add any extra blocked words.
8. Add the speaker card URL to an OBS browser source if you want it.
9. Turn on "Enable Voice Relay", save and restart StreamBridge. Test with a harmless phrase.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!speak your message` | Viewers on YouTube and TikTok (when viewer TTS is on) | Spends points and queues the message to be read aloud. |

## Good to know
- Each viewer has a 30 second cooldown. Up to 10 phrases wait in line, with a 2 second gap between them; rapid alerts are grouped together.
- Message length limits: Twitch and Kick 300 characters, YouTube 200, TikTok 150. Links are removed, common profanity is blocked by default, and your blocked terms are never spoken.
- YouTube and TikTok points are refunded if the message cannot be queued. Kick redemptions cannot be refunded automatically.
- Reading normal chat aloud is off by default. If you add chat messages to the spoken events, only the roles you allow (broadcaster and moderator by default) are read.
- To clear speech already waiting in Speaker.bot, use its own Clear Pending or Stop Speaking action.
- Spoken text is never saved, and it is passed through a private one-use file so it does not show up in Streamer.bot's logs.
