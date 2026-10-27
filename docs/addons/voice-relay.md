# Village Voice

**Module:** `thsv.voice-relay` · **Version:** `4.0.55` · **Built in (extension)**

Routes selected alerts and cross-platform viewer TTS requests through one bounded Speaker.bot queue with an optional avatar and progressive-text overlay.

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
3. Open Setup Wizard > Add-ons > Village Voice and enter the exact Voice Alias (it is case-sensitive).
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

## Where to find it

1. This extension ships with THSV StreamBridge and updates with it; there is nothing separate to download.
2. In **Setup Wizard > Streamer.bot**, include this extension in the one Streamer.bot import, then import that `.sb` file in Streamer.bot.
3. Configure it from the **Extensions > Voice & Language** component catalogue, save, and restart StreamBridge when prompted.

## Streamer.bot

Minimum supported Streamer.bot version: `1.0.7`.

Imported group: `THSV Addon - Voice Relay`

- `THSV Addon - Voice Relay - Speak` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Pause` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Resume` in `THSV Addon - Voice Relay`
- `THSV Addon - Voice Relay - Stop` in `THSV Addon - Voice Relay`

Speak is triggerless, accepts the broker-issued relay token argument, and reads only a bounded one-use file from the Bridge private inbox. Controls use an exact source/payload allowlist.

Creator-selected triggers:

- Attach Pause/Resume/Stop only to creator controls.

## Browser source

If this extension shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.voice-relay` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable Voice Relay |  | Off |
| Events whose thank-you may be spoken |  | `channel.follow`, `channel.subscription`, `channel.membership`, `channel.gift-subscription`, `engagement.gift`, `engagement.donation`, `engagement.cheer`, `engagement.raid`, `engagement.super-chat`, `engagement.milestone` |
| Events whose viewer message may also be spoken |  | (none) |
| Speaker.bot voice alias |  | (blank) |
| Allow viewer TTS requests |  | Off |
| Twitch TTS reward ID | Use a Streamer.bot-owned Twitch reward that requires viewer input. | (blank) |
| Kick TTS reward ID | Use the stable ID from Kick Channel Reward > Reward Redemption. Kick redemptions cannot be automatically refunded by the current documented API. | (blank) |
| YouTube and TikTok TTS command | Registered automatically through the main chat intakes after restart. | `speak` |
| Platforms that use Viewer Foundation points |  | `youtube`, `tiktok` |
| Points charged per YouTube or TikTok request |  | 100 |
| Per-viewer TTS cooldown (seconds) |  | 30 |
| Twitch spoken-message limit |  | 300 |
| Kick spoken-message limit |  | 300 |
| YouTube spoken-message limit |  | 200 |
| TikTok spoken-message limit |  | 150 |
| Show the speaker card while TTS plays |  | On |
| Estimated voice speed for overlay timing |  | 165 |
| Speaker-card background |  | `glass` |
| Speaker-card background color |  | `#101820` |
| Speaker-card background opacity |  | 0.94 |
| Speaker-card name color |  | `#7ff5cc` |
| Speaker-card message color |  | `#ffffff` |
| Speaker-card message size |  | 38 |
| Follow thank-you |  | `Welcome to the community, {actor}! Glad to have you here.` |
| Subscription thank-you |  | `Thank you for joining the community, {actor}!` |
| Membership thank-you |  | `Thank you for joining the community, {actor}!` |
| Gift-subscription thank-you |  | `Thank you for sharing the love, {actor}!` |
| Gift thank-you |  | `Thank you for the {quantity} {itemName}, {actor}!` |
| Donation thank-you |  | `Thank you for supporting the stream, {actor}!` |
| Bits and cheer thank-you |  | `Thank you for the {quantity} bits, {actor}!` |
| Raid thank-you |  | `Welcome, raiders! Thank you for bringing {quantity} viewers, {actor}!` |
| Super Chat thank-you |  | `Thank you for supporting the stream, {actor}!` |
| Like-milestone thank-you |  | `Thank you, everyone! We reached {value} {metric}!` |
| Minimum donation or Super Chat amount to speak |  | 0 |
| Minimum bits to speak |  | 0 |
| Speak every N total likes | Like alerts remain visual between spoken milestones. Recommended: 1000. | 1000 |
| Maximum spoken characters |  | 240 |
| Maximum waiting phrases |  | 10 |
| Gap between requests (seconds) |  | 2 |
| Roles whose chat may be read |  | `broadcaster`, `moderator` |
| Block common profanity automatically | Uses a conservative built-in list with whole-word matching. Add channel-specific terms below. | On |
| Additional words or phrases to never speak |  | (none) |

## Health checks

- **thsv.voice-relay.runtime:** Confirms bounded filtered Speaker.bot dispatch and viewer-request routing are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `streamerbot.run-approved-action`, `schedule.bounded`, `overlay.publish`, `chat.send`, `viewer.foundation.read`, `viewer.foundation.mutate`.

Private storage: `data/addons/thsv.voice-relay/`, `data/addons/.state/thsv.voice-relay/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall Village Voice. It retains no spoken text history.

If something stops working, re-import the matching `.sb` package, check **Setup Wizard > Streamer.bot**, approve the actions again if asked, restart StreamBridge, then test again.
