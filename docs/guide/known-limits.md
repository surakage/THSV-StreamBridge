# Known limits

These are the things StreamBridge cannot do, or can only do partly, before you set it up. Most come from the platforms or from Windows, not from StreamBridge. Each item links to the page with the details or a workaround.

## Your PC

- **Windows only.** StreamBridge needs Windows 10 or newer, 64-bit. There is no macOS or Linux version. See [Install and first run](install-and-first-run.md).
- **Streamer.bot is required.** Twitch, Kick and YouTube events, chat replies and rewards all go through Streamer.bot 1.0.7 or newer on the same PC. StreamBridge does not sign in to those platforms itself.
- **One PC.** StreamBridge, Streamer.bot and your streaming app run on the same computer. Settings and viewer points are stored on that PC. To move them, use a backup bundle (see [Updates, backups and recovery](updates-backups-and-recovery.md)).
- **The download is not code-signed.** Windows SmartScreen or Smart App Control may warn about the installer. Check the download against [RELEASE-VERIFICATION.md](../../RELEASE-VERIFICATION.md), then follow [Smart App Control blocks the installer](../troubleshooting.md#smart-app-control-blocks-the-installer).
- **English only.** The wizard and guides are in English. Chat translation works for viewers in other languages, but the setup screens are not translated.

## While you are live

- **Updates and restarts wait until you are offline.** StreamBridge refuses to install an update or restart while a platform is live, so a stream is never cut off. The tray only restarts a frozen StreamBridge while you are offline.
- **Starting StreamBridge during an update is refused.** The installer starts it again when it finishes.

## Platforms

### Twitch

- A reward with **Redemption Skips Queue** turned on is completed straight away, so a feature cannot refund it. Leave it off for rewards a feature may refund. See [Twitch](platforms/twitch.md).
- Raid Scout clip previews only play on a `localhost` overlay address, not `127.0.0.1`. The wizard gives you the right one. See [OBS and overlays](obs-and-overlays.md#raid-scout-uses-localhost).

### Kick

- Kick rewards cannot be refunded, hidden or limited from outside Kick. Features that need a limit or cooldown apply their own and tell the viewer. You reject a blocked redemption yourself in the Kick queue. See [Kick](platforms/kick.md).
- Scene Gates can hide Twitch rewards on the wrong scene, but not Kick rewards.

### YouTube

- Chat replies are cut to 200 characters, YouTube's own limit. See [YouTube](platforms/youtube.md).
- If your internet drops, YouTube may end the broadcast by itself and not come back. Turn off auto-stop for the stream in YouTube Studio if you want it to wait for you.

### Facebook

- Only a **Facebook Page** works, not a personal profile.
- StreamBridge reads comments and your Page going live or ending, and can post timed comments. Named follows, Stars, subscriptions, channel rewards, moderation and replies to commands are not supported. Some features do not accept Facebook yet. See [Facebook Page](platforms/facebook.md).
- If Facebook revokes the Page token (for example after a password or Page role change), you paste a new one in the wizard. StreamBridge stops retrying until you do.

### TikTok

- Chat and events come in through **TikFinity**. Without it, StreamBridge sees nothing from TikTok.
- TikFinity does not give each event a fixed ID, so a TikFinity test event can count as real unless TikFinity labels it as a test.
- TikTok has no channel point rewards. Viewers spend StreamBridge points with `!buy` instead. See [TikTok](platforms/tiktok.md) and [Points and !buy](points-and-buy.md).

## Streaming apps

- **Meld Studio** (and other Microsoft Store apps) cannot load local overlays until you give it a one-time loopback exemption. See [Meld Studio cannot reach the overlay or wizard](../troubleshooting.md#meld-studio-cannot-reach-the-overlay-or-wizard).
- Features that switch scenes or filters (for example Streamer Punishments) do it through Streamer.bot, so OBS must also be connected inside Streamer.bot.

## Streamer.bot imports

- Importing a Streamer.bot package replaces its actions, which removes triggers you added by hand. After every import the wizard lists which triggers to add again. See [Streamer.bot import and approval](streamerbot-import-and-approval.md).
- A feature can only run the Streamer.bot actions you approved in the wizard. New actions added by an import stay off until you approve them.
