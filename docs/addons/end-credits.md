# End Credits

**Module:** `thsv.end-credits` · **Version:** `4.0.64` · **Optional add-on**

Rolls this stream's followers, subscribers, gifters, supporters, raiders and moderators from every platform as scrolling end credits.

Rolls this stream's supporters as movie-style credits at the end of your stream: new followers, subscribers and members, gifters (with how many gifts each sent), Bits, Super Chats and donations, raiders, moderators who chatted and, if you turn it on, everyone who chatted.

## What you need

- StreamBridge with the main platform intakes connected. No Streamer.bot import or extra trigger is needed.
- A browser source in your ending scene.

## Set it up

1. Install and enable End Credits.
2. Pick the sections, wording and style in the Wizard.
3. Copy the browser-source URL from the overlay step into your ending scene at 1920 x 1080.
4. Click **Show exact template** to watch the credits roll with example names.

## Good to know

- The credits roll each time the ending scene is shown and stop with your closing line in the middle. Turn on **Loop the credits** to keep them scrolling.
- Moderators can type `!credits` to roll them, `!credits stop` to hide them, and `!credits reset` to start a fresh list.
- The list starts fresh each time your stream goes live. Only display names and platforms are saved, never amounts or messages.

## Install

1. Download and extract `THSV-StreamBridge-AddOn-End-Credits-4.0.64.zip` from the same GitHub release as StreamBridge.
2. In **Setup Wizard > Add-ons**, install `THSV-End-Credits-4.0.64.thsv-addon` and review its permissions.
3. Return to the wizard, configure the add-on, approve only the actions it needs, enable it, and restart StreamBridge when prompted.

## Streamer.bot

Nothing to import. This feature works from the chat and events StreamBridge already receives.

## Browser source

If this add-on shows anything on stream, add a browser source with `http://127.0.0.1:8787/overlay/addons/thsv.end-credits` in OBS, Meld, or Streamlabs (the wizard copies the exact URL for your port). Features with nothing to show leave the page blank.

## Settings

Change these in the wizard. Defaults are what a fresh install uses.

| Setting | What it does | Default |
| --- | --- | --- |
| Enable End Credits |  | On |
| Platforms to collect names from |  | `twitch`, `youtube`, `kick`, `tiktok`, `streamlabs`, `kofi` |
| Sections to show |  | `followers`, `members`, `gifters`, `supporters`, `raiders`, `moderators` |
| Show simulator events without saving them |  | On |
| Most names per section |  | 200 |
| Longest name shown |  | 40 |
| Headline |  | `That's a wrap!` |
| Subtitle |  | `Thank you for hanging out today` |
| Closing line |  | `Thanks for watching!` |
| Followers heading |  | `New Followers` |
| Subscribers heading |  | `Subscribers & Members` |
| Gifters heading |  | `Gifters` |
| Supporters heading |  | `Supporters` |
| Raiders heading |  | `Raiders` |
| Moderators heading |  | `Moderators` |
| Chat heading |  | `Chat` |
| Show how many gifts each gifter sent |  | On |
| Roll when the scene with the credits is shown |  | On |
| Loop the credits |  | Off |
| Scroll speed (pixels per second) |  | 70 |
| Name columns |  | 2 |
| Color names by platform |  | On |
| Background |  | `none` |
| Background color |  | `#0b0f17` |
| Background opacity |  | 0.72 |
| Heading color |  | `#7ff5cc` |
| Name color |  | `#ffffff` |
| Font style |  | `broadcast` |
| Name font size |  | 38 |
| Let moderators use the credits command |  | On |
| Credits command |  | `credits` |

## Health checks

- **thsv.end-credits.runtime:** Confirms bounded per-stream name lists and namespaced overlay publication.

## Data and permissions

Package kind: **executable**. Requested permissions: `events.subscribe`, `overlay.publish`, `state.private`.

Private storage: `data/addons/thsv.end-credits/`, `data/addons/.state/thsv.end-credits/`.

Dependencies: none.

## Remove or repair

1. Uninstall the add-on. The current list stays saved for a later reinstall.

If something stops working, check the saved settings and command names in the wizard, restart StreamBridge, then test again.
