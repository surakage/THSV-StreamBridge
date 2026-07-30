# Community Analytics setup

**Module:** `thsv.community-analytics`
**Version:** `2.5.1`
**Publisher:** THSV StreamBridge

Maintains private local cross-platform attendance, message, command, and optional participation-score counters using Viewer Foundation identities.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-Community-Analytics-2.5.1.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-Community-Analytics-2.5.1.thsv-addon` and review its permissions.
3. No separate Streamer.bot import is required.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

### Add-on-specific steps

1. Install and enable Viewer Foundation first; it is the only component allowed to resolve stable platform accounts into Viewer Foundation IDs.
2. No Community Analytics Streamer.bot package or direct trigger is required. Keep chat and lifecycle triggers attached only to the main THSV platform intake actions.
3. Choose the platforms to count, keep simulated events excluded for normal use, and add any stable account or Viewer Foundation exclusions.
4. Leave monthly participation scoring off unless Viewer Spotlight or another approved consumer needs it; money and provider support never contribute.
5. Save, restart StreamBridge, then use Reports, session summary, and privacy tools in the wizard to confirm data is being observed.

## Streamer.bot

This add-on uses normalized bridge events and does not install a Streamer.bot action package.

## Browser source

When this add-on publishes visual output, use `http://127.0.0.1:8787/overlay/addons/thsv.community-analytics` in OBS, Meld, or Streamlabs. The wizard shows and copies the active URL with the configured bridge port. If the add-on has no visual output, the hosted page remains idle.

## Offline test

1. Keep the bridge and Streamer.bot running, then open this add-on in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.community-analytics.runtime:** Confirms Viewer Foundation identity resolution and bounded private session counters.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `viewer.foundation.read`, `community.analytics.provide`.

Private storage: `data/addons/thsv.community-analytics/`, `data/addons/.state/thsv.community-analytics/`.

Dependencies: `thsv.viewer-foundation`.

## Remove or repair

1. Uninstall the add-on. Its bounded private counters remain preserved for a later reinstall or creator export.

If setup drifts, reimport the matching versioned `.sb` package, inspect Streamer.bot in the wizard, restore only the documented triggers/action grants, then rerun the offline test.
