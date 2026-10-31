# THSV StreamBridge

A [Slothbloom](https://www.slothbloom.com/projects/thsv-streambridge) project.

THSV StreamBridge connects your chat platforms, Streamer.bot and your streaming app on one Windows PC. Chat, alerts, rewards and features from Twitch, Kick, YouTube, a Facebook Page and TikTok come together in one place, so you set things up once instead of once per platform.

You set everything up in a private Setup Wizard that opens in your web browser. Nothing is hosted online, and StreamBridge never asks for your platform passwords: those connections stay in Streamer.bot and TikFinity.

## What you can do with it

| Area | What you get |
| --- | --- |
| One chat | Every platform's chat in one on-stream box and one dock you can reply from |
| Alerts | Follows, subs and memberships, gifts, Bits, Super Chats, tips, raids and TikTok like milestones, with sounds and images |
| Commands and timed messages | One set of chat commands and timed messages for every platform, with a viewer command page |
| Rewards and points | Twitch and Kick channel point rewards, plus StreamBridge points and `!buy` for YouTube, Facebook and TikTok |
| Stream flow | Starting Soon countdown, break and end-of-stream timers, scene automations, raid finder and clip player |
| Community features | Polls, giveaways, prize wheel, quotes, check-ins, first chatters, punishments, translation, captions and more |

See the [feature guide](docs/guide/README.md) for the full list with one setup page per feature, or [all features on one page](docs/feature-guide.md). Captions, translation and other accessibility features are on [one page](docs/guide/accessibility.md).

## What you need

- Windows 10 or later, with PowerShell 5.1 or later (already part of Windows).
- [Streamer.bot](https://streamer.bot/) 1.0.7 or later, with its WebSocket server turned on.
- Optional: OBS Studio, Meld Studio or Streamlabs Desktop for overlays and scene automations.
- Optional: TikFinity or TikTok LIVE Studio for TikTok.

You do not need Node.js, a database or any coding. Everything StreamBridge needs comes in the download.

Before you start, check [Known limits](docs/guide/known-limits.md) for what each platform can and cannot do.

## Install

1. Download the latest `THSV-StreamBridge-<version>.zip` from the [Releases page](https://github.com/surakage/THSV-StreamBridge/releases/latest) (or the [Slothbloom download link](https://www.slothbloom.com/downloads/streambridge), which points to the same file).
2. Optional: check the download with [RELEASE-VERIFICATION.md](RELEASE-VERIFICATION.md).
3. Right-click the ZIP, choose **Properties**, tick **Unblock** if you see it, then extract the ZIP to a normal folder.
4. Double-click **Install THSV StreamBridge.cmd**. It installs to `%LOCALAPPDATA%\THSV StreamBridge`, starts StreamBridge and opens the Setup Wizard.
5. Keep the `THSV StreamBridge Recovery Key.txt` file it creates. It unlocks the wizard if you ever need to sign in by hand.

> **Windows 11 Smart App Control:** if Windows blocks the installer with no "Run anyway" option, unblock the ZIP before extracting (step 3) or see [Troubleshooting](docs/troubleshooting.md#smart-app-control-blocks-the-installer).

## Set it up

**New here? Follow the [Quick start](docs/guide/quick-start.md).** It takes you from download to your first alert on stream in one page, in about 30 minutes.

The pages below go deeper on each part. Work through them in order and test each one before moving on.

1. [Install and first run](docs/guide/install-and-first-run.md): open the wizard and connect Streamer.bot.
2. [Streamer.bot import and approval](docs/guide/streamerbot-import-and-approval.md): make the one Streamer.bot import and approve its actions. [Where to find the Streamer.bot imports](docs/guide/streamerbot-imports.md) shows where every `.sb` file lives.
3. [Platforms](docs/guide/platforms.md): turn on Twitch, Kick, YouTube, Facebook and TikTok one at a time. Each has its own page: [Twitch](docs/guide/platforms/twitch.md), [Kick](docs/guide/platforms/kick.md), [YouTube](docs/guide/platforms/youtube.md), [Facebook Page](docs/guide/platforms/facebook.md), [TikTok](docs/guide/platforms/tiktok.md).
4. [OBS and overlays](docs/guide/obs-and-overlays.md): connect your streaming app and add the browser sources.
5. [Scene roles](docs/guide/scene-roles.md): tell StreamBridge which scene is Starting Soon, Live, Break and Ending.
6. Turn on the features you want from the [feature list](docs/guide/README.md). Every feature has its own page in [docs/addons](docs/addons/README.md) with its settings and chat commands.

Later on you may want [Tray, launcher and Stream Deck](docs/guide/tray-launcher-and-stream-deck.md), [Points and !buy](docs/guide/points-and-buy.md) and [Updates, backups and recovery](docs/guide/updates-backups-and-recovery.md).

## Built-in features

Every feature is **built in**. They all come with StreamBridge, update with it, and you switch each one on or off from the wizard's **Extensions** page. There is nothing extra to download.

After you turn on a feature, make a new Streamer.bot import from the wizard so it includes that feature. Features that post in chat, spend points, run moderation or change scenes start switched off until you set them up.

## Updating

The wizard tells you when a new version is out. Use **Download & prepare**, then **Install verified update** while you are offline. Your settings, add-on data and backups are kept. You can also download the new ZIP and run its installer again. See [Updates, backups and recovery](docs/guide/updates-backups-and-recovery.md).

## Help

- [Troubleshooting](docs/troubleshooting.md) covers startup problems, Windows blocks and missing events.
- [First live stream checklist](docs/live-test-checklist.md) helps you test everything before going live.
- [Security](docs/security.md) explains what StreamBridge stores and how it keeps the wizard private.

## For developers

To run from source or build your own add-on, start with [Source checkout setup](docs/setup.md), [Architecture](docs/architecture.md), [Add-on development](docs/add-on-development.md) and [Testing](docs/testing.md). Older design notes and the build history are in [docs/archive](docs/archive/).

## License

THSV StreamBridge is open-source software licensed under the [MIT License](LICENSE).

Copyright (c) 2026 surakage. Third-party software, platform names, service marks and dependencies remain the property of their respective owners. See [Asset and third-party notices](THIRD-PARTY-NOTICES.md).
