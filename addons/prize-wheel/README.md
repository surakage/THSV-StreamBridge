# Prize Wheel

Prize Wheel displays two through ten equal-size choices on one hosted browser-source wheel. StreamBridge selects the winning index before the animation starts, the fixed pointer clicks across decorative studs as the wheel slows, and an editable winner message is sent to each selected chat after the result appears.

## Install

Install and enable `thsv.prize-wheel` in the StreamBridge wizard. Add `http://127.0.0.1:8787/overlay/addons/thsv.prize-wheel` as an OBS, Meld, or Streamlabs browser source.

## Streamer.bot

Choose the command name in the wizard, default `!spinwheel`. StreamBridge registers it automatically for moderators and the broadcaster through the existing platform intakes after restart; no separate Streamer.bot Command object, add-on import, or trigger is required.

## Offline test

Open the browser source, save two through ten choices, and press **Send preview**. The wheel must remain inside a 1920x1080 or cropped browser canvas, stop on the displayed winner, and reveal one winner card. A preview never sends public chat. Then use Streamer.bot's command Test trigger to verify one real command event before going live.

## Data and permissions

Permissions are limited to normalized command events, bounded private state, delayed scheduling, chat output, and the hosted overlay. State stores only the last spin time, last winning choice, and a sequence number. Prize Wheel is for casual entertainment, not regulated or high-value drawings.
