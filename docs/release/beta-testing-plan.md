# Beta testing plan

How THSV StreamBridge goes from one creator's PC to other streamers, in three steps. Each step has a small group, a fixed length, and a clear bar to pass before the next one starts.

Testers get [Beta testing guide](../guide/beta-testing.md). Feedback comes back through the **Beta feedback** issue form on GitHub.

## Before the first invite

- [ ] Publish a release marked **Pre-release** on GitHub, with a beta version number (for example `5.0.0-beta.1`). Its notes link to the quick start, the beta testing guide and the known limits.
- [ ] Add the screenshots to the quick start (wizard pages, Streamer.bot import dialog, OBS browser source dialog). Most first-run questions are "where is that button?".
- [ ] Create a `beta` label on GitHub, plus `severity: blocker`, `severity: major` and `severity: minor`.
- [ ] Decide where testers talk to each other: a private Discord channel (for example `#streambridge-beta`) works best. Link it from the beta testing guide.
- [ ] Prepare a short sign-up form: name, platforms, streaming app (OBS, Meld or Streamlabs), Streamer.bot version, Windows version, how often they stream.
- [ ] Do one clean install on a second Windows account or PC, following only the quick start, and time it.

## Step 1: closed beta (2 weeks, 3 to 5 streamers)

Invite people you know and can talk to directly. Pick them so the group covers different setups:

| Tester | Why |
| --- | --- |
| Twitch only, OBS | The most common setup; the baseline. |
| Multistream with Aitum (vertical too) | Exercises the end-of-stream sequence and output checks. |
| Streamlabs Desktop or Meld Studio | The two non-OBS paths. |
| TikTok LIVE Studio or TikFinity user | TikTok intake and go-live automation. |
| A newer streamer, not very technical | Shows where the guides lose people. |

What each tester does:

1. Installs from the release ZIP using only the quick start. Notes how long it took and where they got stuck.
2. Imports the Streamer.bot package, approves actions, adds the chat and alert overlays, and runs the test alert.
3. Does one private test stream of about 15 minutes.
4. Streams normally at least twice with StreamBridge running.
5. Fills in the Beta feedback form after the first install and after each stream, even if everything worked.

What you do:

- Check the feedback once a day. Answer setup questions the same day; each one is a guide fix.
- Ask for the support bundle (**Diagnostics > Preview support bundle**) for any bug. It removes tokens and keys.
- Ship fixes as normal updates. Testers get them through the wizard's update check.

To move on, all of these must be true:

- No `severity: blocker` issue open for 7 days.
- Every tester finished the quick start, and most did it in under 45 minutes without asking for help.
- No lost settings, points or quotes, and no stream cut off by StreamBridge.
- Every setup question raised has a guide change or a wizard change.

## Step 2: open beta (3 weeks, 15 to 25 streamers)

Open the sign-up form to your community and Discord. Same release channel, same feedback form.

- Accept testers in two waves a week apart, so a bad bug only reaches half of them.
- Keep the same five steps per tester.
- Post a short weekly update: what was fixed, what is known, what to try next.
- Watch for patterns rather than single reports: the same question from three people means the wizard needs a change, not a reply.

To move on:

- No `severity: blocker` or `severity: major` issue open for 7 days.
- At least 10 testers streamed three or more times with StreamBridge.
- The known limits page and troubleshooting page answer every repeated question.

## Step 3: public release

- Pick the public version (for example `5.0.0`) and publish it as a normal release.
- Publish the announcement (`docs/release/announcement.md`) after a final read-through.
- Keep the Beta feedback form for one more release, then point people to the normal bug report form.
- Thank testers by name in the release notes, if they agree.

## What testers should never share

Testers must never post stream keys, recovery keys, the control token, webhook links or platform tokens, not in issues and not in Discord. The support bundle and the pre-stream report remove them. If someone posts one by mistake, delete the post and ask them to replace the key or token on that platform.

## Feedback form questions

The Beta feedback form asks:

- StreamBridge version, Windows version, Streamer.bot version, streaming app, platforms.
- Which step they were on: install, first setup, test stream, real stream.
- How it went, on a scale of 1 (stuck) to 5 (smooth).
- What was confusing or broken, and what they expected instead.
- Install time in minutes (first report only).
- Optional support bundle.

## Roles

- **Owner:** invites testers, answers questions, decides when each step is done.
- **Maintainers:** triage new issues daily, label them, ship fixes, keep the known limits and troubleshooting pages current.
