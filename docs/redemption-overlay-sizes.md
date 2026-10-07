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

The installed OBS blue scenes are named `🔵 <overlay name> [Compact]` and `🔵 <overlay name> [Regular]`. Each contains its matching browser input. When nesting a blue scene in another scene, crop the unused right/bottom canvas to the browser dimensions, then resize proportionally.

Portrait blue scenes use the same names followed by `(Vertical)` and are installed on the vertical canvas. Portrait cards reflow their content into a tall frame; all five have matching dimensions within each portrait size. The wizard offers all four browser-source choices for each overlay individually.

`🔵 Redemption Overlays [Compact]` stacks all five compact blue scenes at exactly 350 × 205. The orange scenes reference this one container so it can be moved and resized as one item. Alerts, ad timers, chat, and captions remain independent. Keep live events sequential when sharing a slot; showing multiple persistent editing previews will display the topmost preview.
