# THSV StreamBridge - Auto Translate

Import `THSV-StreamBridge-Auto-Translate-1.0.0.sb`, compile the single action with the references declared in `manifest.json`, and approve that exact action for Auto Translate in the StreamBridge wizard. Do not attach a trigger; the add-on capability broker dispatches it.

The action sends only messages selected by the add-on's creator-controlled policy to MyMemory over HTTPS. It never logs or persists message text. MyMemory requires a known source language and limits segments to 500 UTF-8 bytes, so the action uses an explicit language pair and splits bounded input into no more than four segments.

Auto Translate starts disabled and allowlist-only. Keep it that way until the creator has reviewed the privacy notice and tested the configured language pair.
