# Community Analytics setup

**Module:** `thsv.community-analytics`
**Version:** `3.5.0`
**Publisher:** THSV StreamBridge

Maintains private local cross-platform attendance, message, command, and optional participation-score counters using Viewer Foundation identities.

## Install

Community Analytics is installed and updated with StreamBridge. Open its dedicated Wizard page to configure private counting, reports, exclusions, retention, and privacy tools. No separate add-on download or Streamer.bot import is required.

### Add-on-specific steps

1. Review the built-in Viewer Foundation page first; it is always installed and is the only authority allowed to resolve stable platform accounts into Viewer Foundation IDs.
2. No Community Analytics Streamer.bot package or direct trigger is required. Keep chat and lifecycle triggers attached only to the main THSV platform intake actions.
3. Choose the platforms to count, keep simulated events excluded for normal use, and add any stable account or Viewer Foundation exclusions.
4. Leave monthly participation scoring off unless Viewer Spotlight or another approved consumer needs it; money and provider support never contribute.
5. Save, restart StreamBridge, then use Reports, session summary, and privacy tools in the wizard to confirm data is being observed.

## Streamer.bot

This integration uses normalized Bridge events and does not install a Streamer.bot action package.

## Browser source

Community Analytics has no browser-source overlay. Approved features consume bounded projections without receiving its backing state.

## Offline test

1. Keep the Bridge and Streamer.bot running, then open **Community Analytics** in the wizard.
2. Save the intended settings and use its preview, test, or manual control where available.
3. Confirm the expected Streamer.bot action, overlay, chat response, or local state change happens once.
4. Record the result in the add-on Acceptance status section. A simulator result is Offline/manual, not a genuine provider pass.

### Health checks

- **thsv.community-analytics.runtime:** Confirms Viewer Foundation identity resolution and bounded private session counters.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `state.private`, `viewer.foundation.read`, `community.analytics.provide`.

Private storage: `data/addons/thsv.community-analytics/`, `data/addons/.state/thsv.community-analytics/`.

Dependencies: `thsv.viewer-foundation`.

## Repair

Reinstall or update StreamBridge to repair this integration. Its bounded private counters remain preserved. If setup drifts, inspect the main THSV intake actions in the wizard, verify the saved Community Analytics settings, restart StreamBridge, then rerun the offline test.
