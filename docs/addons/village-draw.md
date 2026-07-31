# Village Draw setup

Village Draw runs one restart-safe community giveaway across Twitch, YouTube, Kick, and TikTok. It supports one free entry, one Viewer Foundation points ticket, or multiple bounded points tickets with equal odds per ticket. It never accepts money, Bits, subscriptions, donations, cryptocurrency, or paid rewards as entry.

## Install

1. Install and enable **Viewer Foundation** first. It remains the only authority for cross-platform identity, point balances, spending, refunds, privacy export, and deletion.
2. Install Village Draw and keep it disabled while choosing the prize and rules.
3. Start with **Free single entry**. If points are enabled, set a ticket cost and strict per-viewer, entrant, and total-ticket limits.
4. Save settings, restart StreamBridge, then enable the add-on.
5. Add `http://127.0.0.1:8787/overlay/addons/thsv.village-draw` as a browser source in OBS, Meld, or Streamlabs Desktop.

## Streamer.bot

Open **Command Sync** and add these no-response starter templates:

- **Village Draw info & control** creates `!giveaway`. Viewers can inspect status; Village Draw independently requires Moderator or Broadcaster for management arguments.
- **Village Draw free/single entry** creates `!enter`.
- **Village Draw ticket purchase** creates `!tickets`, such as `!tickets 3`.
- **Village Draw ticket balance** creates `!mytickets`.

Generate one command package, import it into Streamer.bot, review it, and enable the commands you intend to use. No separate Village Draw `.sb` package or direct platform trigger is required. Public commands arrive through the existing THSV Twitch, YouTube, Kick, and TikTok intake actions.

Use the authenticated wizard controls in order:

1. **Open entries** freezes a snapshot of the saved name, prize, entry mode, cost, limits, and eligible platforms.
2. **Pause** temporarily rejects new entries; **Resume** reopens the same draw.
3. **Close entries** permanently freezes its entrant and ticket snapshot.
4. **Draw winner** uses secure server-side random selection. Browser animation and frame rate cannot change the result.
5. **Confirm winner** archives the compact receipt. Use **Redraw** only before confirmation.
6. **Cancel and refund** immediately stops entries and starts persisted idempotent Viewer Foundation refunds in bounded background batches.
7. **Clear completed draw** returns the controls to draft after confirmation or cancellation.

If StreamBridge restarts during cancellation, pending refunds resume. The wizard reports `canceling` until the queue finishes.

## Offline test

1. Keep OBS or a normal browser open on the hosted source and press **Send preview**. Confirm the prize, winner text, colors, image, and card duration fit after cropping.
2. Use a Streamer.bot Test trigger for `!enter`. A simulated command may show a safe preview but must not add an entrant or spend Viewer Foundation points.
3. Open a free draw in the wizard, send two real local intake commands from different test identities, close it, and draw. Confirm that only one server-selected winner appears.
4. Before confirming, test **Redraw**. Then confirm and verify that the completed draw can be cleared.
5. For points mode, buy tickets, cancel, and verify the wizard reports `canceling` before every spent point is restored. Restarting during this check must resume the refund queue.

## Data and permissions

Village Draw stores bounded pseudonymous Viewer Foundation IDs, temporary display names needed for the active result, ticket totals, recovery records, and up to five compact draw-history records. It does not store platform account IDs, chat messages, provider payloads, payment credentials, or real-money values. Simulations cannot spend points or select a production winner.

The package requests normalized command events, private bounded state, bounded scheduling, selected-platform chat delivery, its own overlay topic, and Viewer Foundation read/mutate access. The saved worst-case state is capped below the broker's 64 KiB private-state limit.

This package is intended for casual community giveaways. Creators remain responsible for platform rules, local law, prize fulfillment, eligibility disclosures, and any required terms.
