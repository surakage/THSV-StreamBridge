# Handoff: slothbloom.com ↔ THSV StreamBridge

This note is for whichever chat/session is working on **slothbloom.com**. It has no access to the THSV StreamBridge codebase or the conversation that produced this file, so everything relevant is repeated here.

## What THSV StreamBridge is

THSV StreamBridge is a **local-first, cross-platform livestream automation tool** for creators who use Streamer.bot (Twitch, YouTube, Kick, TikTok). It runs entirely on the streamer's own Windows machine — no accounts, no hosted backend, no cloud database. Each install has its own local control token, its own local config, and its own local browser-overlay URLs. Public releases are distributed as a Windows x64 ZIP from GitHub Releases:
`https://github.com/surakage/THSV-StreamBridge/releases`

## What was just done (already implemented, in the StreamBridge repo)

Two small, purely cosmetic changes were made to point traffic at slothbloom.com — nothing about the bridge's architecture changed, and it is still 100% local:

1. **Wizard header link** — `wizard/browser/index.html`, right under the "Setup & management" title:
   ```html
   <a href="https://slothbloom.com" target="_blank" rel="noopener noreferrer" class="site-link">A Slothbloom project · slothbloom.com</a>
   ```
   Every streamer who opens their local setup wizard sees this link and can click through to slothbloom.com.

2. **README byline** — `README.md`, right under the top-level heading:
   ```markdown
   A [Slothbloom](https://slothbloom.com) project.
   ```
   Anyone who lands on the GitHub repo page sees this and can click through.

These changes are done and don't need anything from the website side to work — they're just outbound links. This document is about the other half: making sure slothbloom.com has somewhere useful for that traffic to land, and (optionally) linking back.

## What's being asked of the website side

1. ~~Confirm slothbloom.com is live~~ — **Done.** The project page exists at `https://www.slothbloom.com/projects/thsv-streambridge`, and the wizard header link and README byline now deep-link to it.
2. **Keep the project page current** — a short description, maybe a screenshot of the wizard, and a link out to the GitHub Releases page above. That closes the loop: wizard/README → slothbloom.com project page → GitHub Releases → install.
3. **Match the branding text** used on the bridge side ("A Slothbloom project") if the site refers to it differently, so the two stay consistent — or say what wording to use instead and it'll be updated on the bridge side.

## Explicitly NOT part of this (deferred, not decided)

Earlier in the conversation, the idea of turning this into a **hosted, multi-tenant, account-based version** of StreamBridge (users log in on slothbloom.com, each sees only their own settings and gets their own personal overlay URL served from a central server) came up. That was discussed and **explicitly deferred** — it's a full rearchitecture (auth, per-user server-side storage, hosting) that conflicts with the tool's current local-only, no-cloud-dependency design, and was not approved to build. Don't build any part of that unless it's raised again on purpose.

## Where things live

- StreamBridge repo (local): `F:\The Hidden Sloth Village\THSV StreamBridge`
- GitHub: `https://github.com/surakage/THSV-StreamBridge`
- This file: `docs/slothbloom-website-handoff.md` in the StreamBridge repo (permanent, versioned)
