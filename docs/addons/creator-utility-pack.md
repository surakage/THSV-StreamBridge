# Creator Utility Pack setup

**Module:** `thsv.creator-utility-pack`
**Version:** `2.5.2`
**Publisher:** THSV StreamBridge

Adds bounded cross-platform counters and local chat polls. Village Draw is the only supported giveaway system.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Creator-Utility-Pack-2.5.2.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Creator-Utility-Pack-2.5.2.thsv-addon` and review its permissions.
3. No separate add-on Streamer.bot import is required.
4. Return to the wizard, configure the add-on, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install the add-on and choose command names, or keep `counter`, `poll`, and `vote`.
2. In Command Sync, apply **Creator Utility counter**, **Creator Utility poll control**, and **Creator Utility vote**.
3. Generate one package, import it, review it, and enable the wanted commands.
4. Keep the platform triggers on the main THSV intake actions. Do not create duplicate Creator Utility triggers.

## Streamer.bot

This add-on uses normalized bridge events and does not ship a separate Streamer.bot package. Command Sync generates the exact no-response commands that feed it through the existing platform intakes.

### Counter commands

- `!counter wins show` displays the `wins` counter. Everyone may use this read-only form.
- `!counter wins +1` adds one.
- `!counter wins -1` subtracts one.
- `!counter wins reset` resets it to zero.

Changing a counter requires a normalized Moderator or Broadcaster role. The add-on enforces this again even if a creator accidentally weakens the imported command permission.

### Poll commands

- `!poll open Which game? | Game A | Game B` opens a poll with two choices.
- `!vote 1` records or replaces that stable viewer's current vote.
- `!poll close` closes the poll, posts bounded results to source chat, and shows the result card.
- `!poll reset` clears the current poll.

Opening, closing, and resetting requires Moderator or Broadcaster. Voting is public while the poll is open.

## Browser source

Use `http://127.0.0.1:8787/overlay/addons/thsv.creator-utility-pack` in OBS, Meld, or Streamlabs. It stays idle until `!poll close` publishes the bounded results card. The wizard shows and copies the active URL with the configured bridge port.

## Offline test

1. Run `!counter test show`, `!counter test +1`, and `!counter test show`. Confirm the value is one and a non-moderator cannot change it.
2. Run `!poll open Pick one | First | Second`, then submit `!vote 1` from one test viewer and `!vote 2` from another.
3. Run `!poll close`. Confirm one bounded source-chat response and one overlay result card appear.
4. Repeat one viewer's vote before closing. Confirm it replaces the prior choice rather than creating a second vote.
5. Restart StreamBridge and confirm counters and the current poll remain valid without retaining chat text.

### Health checks

- **thsv.creator-utility-pack.runtime:** Confirms bounded counter/poll state and platform-limited source replies are available.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `chat.send`, `overlay.publish`.

Private storage: `data/addons/thsv.creator-utility-pack/`, `data/addons/.state/thsv.creator-utility-pack/`.

Dependencies: none.

## Remove or repair

1. Uninstalling preserves bounded counters and the current poll definition.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
