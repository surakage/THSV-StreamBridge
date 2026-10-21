# Platforms and Streamer.bot imports

Where every Streamer.bot import lives, and the right way to connect each platform. Each platform reaches
StreamBridge differently; follow its section exactly and leave everything else to the wizard.

| Platform | How it reaches StreamBridge | Where you sign in |
| --- | --- | --- |
| Twitch, YouTube, Kick | Streamer.bot's own platform connection → the native intake actions | Streamer.bot → **Platforms** |
| TikTok | TikFinity → Streamer.bot → the TikFinity intake actions | TikFinity |
| Facebook Page | StreamBridge reads the Page directly with a Page access token | Meta Graph API Explorer (token pasted in the wizard) |
| Ko-fi | Ko-fi webhook → Streamer.bot → the Ko-fi intake action | Ko-fi and Streamer.bot → **Integrations → Ko-fi** |

StreamBridge never stores your platform passwords; account sign-ins stay in Streamer.bot and TikFinity.

## Where the Streamer.bot imports are

**The easy way (recommended): one import.** Open the wizard → **Streamer.bot → One Streamer.bot
import**, tick the features you use, select **Create & download one import**, and import that single
`.sb` file in Streamer.bot (**Import** at the top of Streamer.bot, then drag the file in or paste its
text). Re-generating later upgrades the same actions in place; it never makes duplicates.

**Individual imports (recovery, or one feature at a time).** Every package ships inside your
StreamBridge install:

```text
<install folder>\app\<version>\packages\streamerbot\<package>\THSV-StreamBridge-<Package>-<version>.sb
```

The default install folder is `%LOCALAPPDATA%\THSV StreamBridge`. Useful ones:

| Package folder | What it adds |
| --- | --- |
| `native-platform-intake` | `THSV Twitch - Intake`, `THSV YouTube - Intake`, `THSV Kick - Intake` (chat, follows, subs, bits, raids, rewards, stream online/offline) |
| `tikfinity-intake` | `THSV TikTok - Chat / Follow / Gift / Like / Subscription` |
| `kofi-donations` | `THSV Addon - Ko-fi Donations - Intake` |
| `core-receiver`, `multi-*`, `timed-message-output` | The core chain StreamBridge calls (always leave triggerless) |
| `<extension name>` (for example `face-filters`, `streamer-punishments`) | That extension's actions |

Optional add-ons downloaded separately carry their own `.sb` inside their ZIP.

**After importing:** click **Save** (and **Compile** if Streamer.bot asks), then in the wizard open each
extension's **Approve Streamer.bot actions** step and choose **Approve recommended**. **Setup checklist**
shows anything still missing.

### The trigger rule

- The **platform intake** actions (Twitch, YouTube, Kick, TikTok, Ko-fi) are the only ones with triggers.
  The imports already carry their triggers; don't add others.
- **Every other THSV action stays triggerless.** StreamBridge runs them itself, with a one-time
  security token. Adding a trigger to one makes it fire at the wrong time (or get rejected).

## Twitch

1. Streamer.bot → **Platforms → Twitch → Accounts**: connect your **broadcaster** account (and a bot
   account if you have one).
2. Import `native-platform-intake` (or include **Twitch** in the one import). `THSV Twitch - Intake`
   arrives with its triggers: chat, follow, cheer, subs, resubs, gift subs, gift bombs, raids, channel
   point redemptions, and stream online/offline.
3. Wizard → **Platforms** → switch Twitch on.
4. Channel point rewards: create them in Streamer.bot (**Platforms → Twitch → Channel Point Rewards →
   Add**) so Streamer.bot owns them and can refund them. Right-click a reward → **Copy Reward Id** and paste
   the ID into the extension that uses it.

## YouTube

1. Streamer.bot → **Platforms → YouTube → Accounts**: connect your channel.
2. Import `native-platform-intake`. `THSV YouTube - Intake` covers chat, Super Chats and Super Stickers,
   jewels, new subscribers (YouTube's follow), memberships and gifts, and broadcast started/ended.
3. Wizard → **Platforms** → switch YouTube on.
4. YouTube has no channel point rewards, so viewers use StreamBridge points with commands such as `!buy`.

## Kick

1. Streamer.bot → **Platforms → Kick**: connect your account.
2. Import `native-platform-intake`. `THSV Kick - Intake` covers chat, follows, subs and gifts, rewards,
   and stream online/offline.
3. Wizard → **Platforms** → switch Kick on.
4. Kick rewards: create them in Streamer.bot (**Platforms → Kick → Rewards → Add**) and copy their IDs the
   same way as Twitch. Kick rewards have no cooldown or per-stream limit of their own, so StreamBridge
   enforces those for Kick redemptions. Leave **Redemption Skips Queue** off so a mod can reject (refund)
   a blocked redemption in Kick's queue.

## TikTok (through TikFinity)

1. Install **TikFinity**, sign in with TikTok, and set your TikTok username.
2. Streamer.bot → **Servers/Clients → WebSocket Server**: address `127.0.0.1`, port `8080`, endpoint `/`,
   **Auto Start** on.
3. Import `tikfinity-intake`.
4. In TikFinity → **Streamer.bot** settings: address `127.0.0.1`, port `8080`, endpoint `/`, then **Test
   Connection**. Map **Chat, Follow, Gift, Like, and Subscription** to the matching `THSV TikTok - …`
   actions. Turn on **Allow Streamer.bot to push messages to TikFinity** so StreamBridge can reply in
   TikTok chat.
5. Wizard → **Platforms** → switch TikTok on (adapter `tikfinity-streamerbot`), restart StreamBridge, and
   send a TikFinity test event.
6. TikTok has no channel point rewards: viewers use StreamBridge points (`!buy`, `!points`), and gifts
   count for alerts and the Bean Boozled wheel. Add TikFinity and TikTok LIVE Studio to **Start
   automatically** on the wizard's Streamer.bot page.

## Facebook Page

Facebook does not go through Streamer.bot. StreamBridge reads your Page with a **Page access token**:

1. Open the Meta **Graph API Explorer**, choose your Meta app, then **Get User Access Token** with
   `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, and `pages_manage_engagement`
   (the last one only for timed comments). Approve it for your Page.
2. Make it long-lived: paste it in the **Access Token Debugger** → **Extend Access Token**.
3. Back in the Explorer, use the long-lived token to run `me/accounts`, and copy your Page's
   `access_token`. A Page token made this way does not expire unless you change your Facebook password or
   remove the app.
4. Wizard → **Platforms → Facebook Page**: Page ID, API version, paste the token → **Verify and save**,
   then **Enable Facebook** (saving leaves it off).
5. While live, select **Test connection** to confirm live comments come through. Never paste the token
   into a chat or support message.

What it does: live comments in your chat overlay, follower and Page-like milestones in alerts, and
optional timed comments posted as your Page.

## Ko-fi

1. Streamer.bot → **Integrations → Ko-fi**: follow its steps to give Ko-fi the webhook address and your
   Ko-fi **verification token** (from Ko-fi → **More → API**).
2. Import `kofi-donations` and attach only the **Ko-fi → Donation** trigger to
   `THSV Addon - Ko-fi Donations - Intake`.
3. Wizard → enable Ko-fi Donations and restart StreamBridge.

Tips then appear as alerts and count toward the Bean Boozled wheel (`$5` per spin by default) and
subathon timers.

## Apps Streamer.bot controls for extensions

| App | Connect in Streamer.bot | Used by |
| --- | --- | --- |
| OBS Studio | **Stream Apps → OBS** (WebSocket, connection 0) | Scene switching, Streamer Punishments filters |
| Streamfog | **Integrations → StreamFog** (Auto Connect, Auto Reconnect) | Face Filters lenses |
| Voicemod | **Integrations → VoiceMod** (Auto Connect, Auto Reconnect) | Face Filters voices |
| Speaker.bot | **Integrations → Speaker.bot** | Village Voice text-to-speech |

Turn on **Start automatically** for each app on the wizard's **Streamer.bot** page so one launch opens
everything in the right order; apps already open are skipped.

See also: [Feature guide](./feature-guide.md) · [Streamer.bot setup in depth](./streamerbot-setup.md) ·
[Trigger matrix](./streamerbot-trigger-matrix.md) · [Channel rewards](./rewards.md)
