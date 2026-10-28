# Public release readiness

Status as of 2026-10-28. The GitHub repository is already public, so the privacy checks below are done first. Everything else is the list of improvements and documentation work needed before announcing StreamBridge as ready for anyone to use.

Legend: **P1** blocks the announcement, **P2** should land soon after, **P3** nice to have.

## 1. Privacy and safety (done)

- [x] Secret scan of all tracked files and the full git history: no webhook URLs, OAuth tokens, API keys, private keys or control tokens. The matches are code that handles these values, not the values themselves.
- [x] Personal defaults: a test (`tests/unit/shareable-defaults.test.ts`) already keeps the creator's channel name, community name and time zone out of shipped defaults.
- [x] **P3** Two archived notes mention the creator's local folder path (`docs/archive/milestones.md`, `docs/archive/slothbloom-website-handoff.md`). Harmless, but can be generalized. Generalized.
- [x] **P2** Add a root `SECURITY.md` (GitHub shows it on the Security tab) that points to `docs/security.md` and says how to report a vulnerability privately. Private vulnerability reporting is enabled on the repository.

## 2. Getting started: one path instead of six (P1)

New users currently meet six overlapping setup documents: `docs/getting-started.md`, `docs/complete-setup-guide.md`, `docs/setup-for-beginners.md`, `docs/setup.md`, `docs/addon-setup-for-beginners.md` and `docs/guide/install-and-first-run.md`, plus three Streamer.bot import pages (`docs/streamerbot-setup.md`, `docs/guide/streamerbot-imports.md`, `docs/guide/streamerbot-import-and-approval.md`).

- [x] **P1** One "Quick start" walkthrough in `docs/guide/` that goes from download to first alert on stream in order: download and install, open the wizard, connect Streamer.bot, import the one `.sb`, approve actions, add the chat and alert browser sources, run the test alert. Done: `docs/guide/quick-start.md`.
- [x] **P1** The older setup pages (getting started, complete setup guide, beginner setup, contributor setup) now open with a banner pointing new users to the quick start, and keep their detail as reference.
- [x] **P1** README "Set it up" leads with the quick start (`docs/guide/quick-start.md`).
- [ ] **P2** Screenshots for each quick-start step (wizard pages, Streamer.bot import dialog, OBS browser source dialog). The guide pages currently have almost none.
- [ ] **P3** A short video walkthrough linked from the README.

## 3. Setup pain points found while running it on a real stream (P1/P2)

Each of these caused a real support round-trip in October 2026.

- [x] **P1** Re-importing a Streamer.bot package removes the triggers creators added (for example Raid Scout's Broadcast Stopped). Either keep triggers on import where Streamer.bot allows it, or have the wizard list exactly which triggers to re-add after an import, per action. Done in 4.0.59: after every import the wizard lists which actions need their trigger added again.
- [ ] **P1** Streamer.bot only writes imported actions to disk later. The wizard's approval check can look stale. After an import, tell the creator to wait, or close and reopen Streamer.bot, before approving.
- [x] **P1** Overlay placement needs custom CSS today (countdown size and corner, 8-Ball card, translated captions). Add per-overlay **position, size and corner** settings in the wizard, so creators never edit CSS. At minimum: Streamer Punishments countdown and tracker, Magic 8-Ball card, Translate captions. Done in 4.0.59: each feature card's Overlay tab has Card position and Card size.
- [ ] **P2** A connection check for Elgato Wave Link: when Streamer.bot loses Wave Link, scene-based mic mute silently fails. Show it in the setup checklist and connection check.
- [ ] **P2** Facebook long-lived Page tokens expire. Show the expiry date in the wizard and remind the creator a week ahead.
- [x] **P2** Updates: block a manual StreamBridge restart while an update is installing, so a restart can't race the installer. This happened once and the install had to be re-run. Done in 4.0.59: starting StreamBridge while an update installs is refused with a clear message.
- [ ] **P2** Reward ID fields: show a reward picker from Streamer.bot (like the command picker) instead of asking creators to copy reward IDs by hand.
- [x] **P3** Kick bot account: explain in the platform guide that it is optional, so the Streamer.bot "no credentials" warning doesn't worry anyone. Done in `docs/guide/platforms/kick.md`.

## 4. Accessibility (P2)

- [ ] **P2** Wizard keyboard pass: every control reachable with Tab, visible focus ring, Escape closes dialogs, no keyboard traps in row lists.
- [ ] **P2** Screen reader pass: labels on icon-only buttons, row-list column headers announced, status messages in an `aria-live` region (save results, approvals, update progress).
- [ ] **P2** Contrast check for the dark wizard theme (muted helper text) against WCAG AA.
- [ ] **P3** Respect `prefers-reduced-motion` in overlays (wheel spin, card animations) with a per-overlay "reduce motion" switch.
- [x] On-stream captions (Accessibility Captions, Live Captions, Translate captions) already exist; document them together in one "Accessibility features" page (**P2**). Done: `docs/guide/accessibility.md`.

## 5. Reliability already improved this month

- [x] Break and end timer recovers from a missed offline signal (4.0.53).
- [x] Aitum outputs stop at the end of the stream and are counted correctly at go-live (4.0.53, quieter checks pending).
- [x] Automatic restart when StreamBridge stops responding while offline (#127).
- [x] Log noise: Streamer.bot outages, single Facebook failures, Speaker.bot holds and Aitum checks (pending release).

## 6. Repository and community files (P2)

- [x] **P2** `CONTRIBUTING.md`: how to build, test (`npm test`, typecheck, lint, browser tests) and submit an add-on or fix; point to `docs/add-on-development.md`.
- [x] **P2** `CODE_OF_CONDUCT.md`.
- [x] **P2** Issue templates: bug report (asks for the support bundle from the wizard, version, and which platforms), feature request, and add-on idea. Add a pull request template.
- [x] **P2** `SUPPORT.md`: where to ask for help, and what to attach (support bundle, never tokens).
- [ ] **P3** Repository topics and a social preview image on GitHub.

## 7. Release page and versioning (P2)

- [ ] **P2** The GitHub release notes for each version link to the quick start and to "what to re-import in Streamer.bot" for that version.
- [x] **P2** A "First release for everyone" announcement page that summarizes features, requirements and limits (Windows only, Streamer.bot required). Draft: `docs/release/announcement.md`.
- [ ] **P3** Decide on a public version line (for example 5.0.0 for the first public announcement) and update `docs/release.md`.

## Suggested order

1. Quick start walkthrough and doc consolidation (section 2).
2. Import trigger guidance and overlay position settings (section 3, P1).
3. Community files and `SECURITY.md` (sections 1 and 6).
4. Accessibility pass (section 4).
5. Screenshots, video and announcement (sections 2 and 7).
