# Streamer.bot Discord: the-library post

Ready to paste into the Streamer.bot Discord forum **#the-library**, in the same layout as other library posts. Discord limits each message to 2,000 characters, so it is two messages: the post itself, then a first reply with the commands and screenshots.

**Title:** 🌉 THSV StreamBridge v4 for Streamer.bot – one stream for Twitch, YouTube, Kick, TikTok & Facebook

**Tags:** multiplatform, integrations, overlays, alerts, twitch

## Message 1: the post

```
A free, open-source companion for Streamer.bot that turns Twitch, YouTube, Kick, TikTok (via TikFinity) and a Facebook Page into one stream. It runs entirely on your PC, talks to Streamer.bot over its local WebSocket, and never asks for your platform passwords.

## ✨ Key Features
• **One chat for everything:** a chat overlay and dock with every platform's messages and emotes (Twitch, BTTV, 7TV, Kick).
• **Alerts everywhere:** follows, subs, gifts, Bits, Super Chats, raids and TikTok gifts, with your own sounds and images.
• **Commands & rewards that work on every platform:** timed messages, channel-point rewards, and StreamBridge points with !buy for YouTube, TikTok and Facebook.
• **Stream flow:** Starting Soon countdown, break and end timers, scene automations, raid finder and clip player.
• **Community extras:** polls, giveaways, quotes, chat games, Magic 8-Ball, Streamer Punishments, Face Filters and more.
• **Accessibility:** live captions of your voice, and chat translation both ways.
• **Setup Wizard:** pick where you stream and how much you want, and a checklist tells you what's left.
• **Local & private:** no hosted service, no accounts, no API keys to share.

## 🧰 Requirements
• Windows 10/11 (64-bit)
• Streamer.bot **1.0.7 or newer** (stable works)
• OBS Studio, Meld Studio or Streamlabs Desktop for overlays

## 🚀 Setup (about 30 minutes)
1. In Streamer.bot, turn on **Servers/Clients > WebSocket Server** (127.0.0.1, port 8080, Auto Start).
2. Download the ZIP from the latest release, Unblock it, extract, run **Install THSV StreamBridge.cmd**.
3. In the wizard's **Start here**, tick where you stream and pick **Essentials**.
4. Create the one import, import the `.sb` in Streamer.bot, then close and reopen Streamer.bot once.
5. Approve the actions in **Setup checklist**, add the chat and alert browser sources, fire a test alert.

import + full installation tutorial:
https://github.com/surakage/THSV-StreamBridge
```

## Message 2: first reply

```
## Commands (default names, all renameable)
Command            Description
!points            Your StreamBridge points
!buy               Spend points (Streamer Punishments and more)
!quote             A random quote (!quoteadd for mods)
!8ball             Ask the Magic 8-Ball
!lurk              Let the streamer know you're lurking
!hydrate           Remind the streamer to drink water
!giveaway / !enter Join a giveaway
!play              Chat games (trivia, unscramble, slots, duels...)
!translateme       Get the streamer's voice translated in chat
!captions          Show the streamer's voice translated on screen

Viewers can see every enabled command on your local commands page, and the wizard lists them per platform.

Beta: feedback very welcome here or with the Beta feedback form on GitHub.
```

Attach 2 to 4 screenshots to the reply: the chat overlay on stream, an alert, and the wizard (`docs/images/quick-start/02-start-here.png`, `05-setup-checklist.png`).
