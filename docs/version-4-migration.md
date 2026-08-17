# Version 4 migration

Version 4 replaces the old collection of separately installed first-party feature packages with one main installation, seven built-in extension groups, three built-in integrations, and a smaller catalogue of optional add-ons.

## Safe upgrade path

1. Stop streaming and close browser-source preview windows that are holding old files open.
2. Download and verify `THSV-StreamBridge-4.0.0.zip` from the official release.
3. Extract it and run **Install THSV StreamBridge.cmd**.
4. Let the installer verify the archive, activate 4.0, pass its health check, and migrate compatible saved feature data.
5. Open **Extensions** and enable the built-in groups you want. Do not reinstall their former `.thsv-addon` copies.
6. Open **Streamer.bot → One Streamer.bot import**, select the enabled features and installed optional add-ons, and download one combined 4.0 import.
7. Import with overwrite enabled for matching THSV actions. Review the generated trigger checklist and reattach only any trigger reported missing.
8. Refresh browser sources once after the upgrade and run the wizard's previews.

## What is preserved

The installer preserves creator configuration, secrets, logs, backups, uploaded files, extension state, optional add-on settings and state, and the previous application version used for rollback. It removes only retired application copies and obsolete versioned import folders after 4.0 has started successfully.

## What no longer needs a separate download

Broadcast Director, Clip Engine, Community Rewards, Community Messaging, Community Insights, Community Play, and Voice & Language ship inside the main archive. Viewer Foundation, Community Analytics, and Ko-fi Donations are also built in. Their components remain independently configurable and failure-isolated, but they are not optional release assets.

## Optional add-ons

Only the packages listed on the authenticated wizard's **Add-ons** page and the current 4.0 release index are separately downloadable. Install those packages through the wizard, then regenerate the single Streamer.bot import so their selected actions are included without duplicate action groups.

If an older separately installed copy of a now-built-in component appears in migration review, import its compatible saved data into the built-in feature and leave the obsolete package disabled.
