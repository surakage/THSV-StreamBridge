# Bloom Companion package

Import `THSV-StreamBridge-Bloom-Companion-1.0.0.sb` after Core Receiver `1.0.4` or newer. Add **Run Action Immediately** for `THSV StreamBridge - Bloom Companion` after the receiver.

The action handles only validated `companion.action` events and exposes `companion*` arguments. It does not spend points, write globals, run creator actions, or persist viewer data. StreamBridge owns identity, balances, cooldowns, companion state, and the browser animation queue.
