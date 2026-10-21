# Redemption overlay sizes

Fan Crown, First Five, Viewer Spotlight, Village Roll Call, and Chat Play Pack each provide two independent browser-source variants in the wizard's overlay section:

| Variant | Browser width | Browser height | URL parameter |
| --- | ---: | ---: | --- |
| Compact | 700 | 410 | `cardSize=compact` |
| Regular | 980 | 574 | `cardSize=regular` |
| Compact vertical | 410 | 700 | `cardSize=compact&cardOrientation=vertical` |
| Regular vertical | 574 | 980 | `cardSize=regular&cardOrientation=vertical` |

Choose the size separately for each overlay. Copy its URL and set the browser dimensions to the values above. Both variants have the same proportions, and all five cards have identical outer frames within each variant. The regular variant provides a larger presentation of the same information.

For example, `/overlay/addons/thsv.first-five?cardSize=compact` selects the compact First Five board. Existing URLs without `cardSize` preserve their original layouts.

StreamBridge does not create OBS scenes for these cards. If you like to keep each card in its own helper scene, name them however you want (for example `<overlay name> [Compact]` and `<overlay name> [Regular]`), add the matching browser source to each, and nest that helper scene where you need it. When nesting, crop the unused right/bottom canvas to the browser dimensions, then resize proportionally. Portrait variants work the same way on a vertical canvas. Portrait cards reflow their content into a tall frame; all five have matching dimensions within each portrait size. The wizard offers all four browser-source choices for each overlay individually.

You can also stack all five compact helper scenes in one container scene (for example at 350 × 205 each) so the set can be moved and resized as one item. Alerts, ad timers, chat, and captions remain independent. Keep live events sequential when sharing a slot; showing multiple persistent editing previews will display the topmost preview.
