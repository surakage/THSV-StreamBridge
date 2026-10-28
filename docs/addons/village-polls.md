# Village Polls

**Module:** `thsv.village-polls` · **Version:** `4.0.58` · **Optional add-on**

Runs one universal Twitch, YouTube, Kick, and TikTok chat poll with private hashed voting, shared announcements, and a result overlay.

Village Polls runs one shared poll across Twitch, YouTube, Kick and TikTok. Native platform polls only count votes from their own platform, so Village Polls keeps one combined total instead. The poll is announced in all four chats, and a compact result board can show the live votes and the winner on stream.

## What you need
- A browser source for the poll board, if you want it on stream. Copy the URL from the wizard (it looks like `http://127.0.0.1:8787/overlay/addons/thsv.village-polls`).
- Nothing extra in Streamer.bot. Keep your main THSV platform chat actions as they are; do not create separate poll commands or triggers.

## Set it up
1. Open Setup Wizard > Add-ons > Village Polls and turn on "Turn on universal cross-platform polls".
2. Keep the default `!` prefix and the `poll` and `vote` command names for the easiest setup.
3. Optional: change the poll length (120 seconds by default, 0 for manual close), the number of choices (6 by default) and how long the result stays (12 seconds).
4. Optional: style the board: compact or full layout, opacity, colors, percentages, vote totals, countdown, platform markers and transition.
5. Save and restart StreamBridge.
6. Add the overlay URL to an OBS browser source.
7. Test: type `!poll open Best snack? | Chips | Popcorn`, vote with `!vote 1`, then `!poll close`. Check the announcement reached each connected chat.

## Chat commands
| Command | Who can use it | What it does |
|---|---|---|
| `!poll open Question \| Choice 1 \| Choice 2` | You and moderators | Opens a poll and announces it in every chat. |
| `!poll close` | You and moderators | Closes the poll and announces the combined result. |
| `!poll reset` | You and moderators | Clears the poll and hides the board. |
| `!vote 1` | Everyone | Votes for a choice. The confirmation appears in the viewer's own chat. |

## Good to know
- A viewer can change their vote; only their latest choice counts. One poll accepts up to 5,000 voters.
- Viewers have a 3 second cooldown per command; you and moderators skip it.
- The poll closes on its own when the timer ends, and also when every platform goes offline (you can turn that off).
- Choices must be different from each other. The board refreshes at most once per second, so busy polls stay smooth.
- Privacy: account IDs are never stored as-is, only as private hashes plus the platform for the optional platform breakdown.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Village-Polls-4.0.58.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Village-Polls-4.0.58.thsv-addon` and review its permissions.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.village-polls` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Turn on universal cross-platform polls | Uses the existing main platform intake actions and announces one shared poll to Twitch, YouTube, Kick, and TikTok. No separate poll trigger is needed. | Off |
| Command prefix | One visible character placed before poll and vote, such as ! or ?. | `!` |
| Poll management command name | Enter the word without !. Moderators and the broadcaster use this command. | `poll` |
| Viewer vote command name | Enter the word without !. The default lets viewers vote with !vote 1. | `vote` |
| Close the poll when every platform is offline | Prevents an old poll from remaining open for the next stream. | On |
| Choices allowed in one poll | Six is recommended so the compact poll remains readable. | 6 |
| Seconds before the poll closes | Use 0 to close polls manually. The default is two minutes. | 120 |
| Winner display time | How long the completed result stays visible. | 12 |
| Poll size | Compact uses the least screen space. Full gives long choices more room without becoming full-screen. | `compact` |
| Show percentages |  | On |
| Show vote totals |  | On |
| Show countdown |  | On |
| Show platform vote markers | Adds a small Twitch, YouTube, Kick, and TikTok breakdown under choices that received votes. | Off |
| Entrance and exit |  | `slide` |
| Glass background color |  | `#111923` |
| Background opacity | Lower values show more of the stream behind the poll. | 0.72 |
| Accent and result bars |  | `#7ff5cc` |
| Text color |  | `#ffffff` |

## Health checks

- **thsv.village-polls.runtime:** Confirms bounded universal poll state, private hashed cross-platform voting, chat announcements, source confirmations, and result-overlay output are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`, `schedule.bounded`.

Private storage: `data/addons/thsv.village-polls/`, `data/addons/.state/thsv.village-polls/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves the current poll definition and private vote state.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
