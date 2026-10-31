# OBS and overlays

## What it is

StreamBridge connects to your streaming app in two ways:

- **A scene connection.** StreamBridge reads your scene list and notices scene changes. Features like break timers and Scene roles need this.
- **Overlays.** Chat, alerts and feature cards are local web pages. You add them to OBS, Meld Studio or Streamlabs Desktop as browser sources.

## What you need

- OBS Studio 28 or newer, Meld Studio or Streamlabs Desktop on the same PC.
- StreamBridge running and the wizard open.

## Set it up

### 1. Connect your streaming app (scene connection)

1. Turn on the app's local connection:
   - **OBS:** **Tools > WebSocket Server Settings**, enable the server, keep authentication on, and copy the port and password. The usual address is `ws://127.0.0.1:4455`.
   - **Meld Studio:** nothing to turn on while Meld is open. The address is `ws://127.0.0.1:13376` and no password is normally needed.
   - **Streamlabs Desktop:** **Settings > Remote Control**, select the QR code, then **Show details** and copy the token. The address is `ws://127.0.0.1:59650/api/websocket`.
2. In the wizard, open **Streamer.bot** and find **Direct scene connections**.
3. Choose the **Application**, give it a **Connection name**, check the **Local WebSocket URL**, and paste the **Password or token**.
4. Tick **Protect and save this connection on this computer**, then select **Save connection**.

If you are not sure of the port, select **Discover local endpoints**. Without a direct connection, StreamBridge falls back to scene changes reported by Streamer.bot.

Some features (for example Streamer Punishments) also switch scenes or filters **through Streamer.bot**. For those, connect OBS inside Streamer.bot too.

### 2. Add the main overlays

1. Open **Chat Overlay** and find **Browser-source checklist**.
2. Pick your **Streaming app**. The wizard shows the exact steps for that app.
3. For each source, copy the URL with its copy button and use the width and height it lists.
4. In OBS: **Sources > + > Browser**, paste the URL and enter the size. Leave **Shutdown source when not visible** and **Refresh browser when scene becomes active** off.
5. Tick the source in the checklist once you have checked it in your app.

The main addresses (port `8787` is the default):

| Source | Address |
| --- | --- |
| Chat only | `http://127.0.0.1:8787/overlay/chat` |
| Alerts only | `http://127.0.0.1:8787/overlay/alerts` |
| Chat and alerts together | `http://127.0.0.1:8787/overlay/` |
| Multichat dock (reply from OBS) | `http://127.0.0.1:8787/overlay/chat/dock` |
| Closed Captions | copy it from **Closed Captions > Caption browser source** |
| Emote & GIF wall | copy it from **Chat Overlay > Emote & GIF wall** |

The dock is not for your scene. Add it in OBS as a **Custom Browser Dock**. Use **Copy dock URL** on the **Chat Overlay** page.

The **Emote & GIF wall** makes every emote posted in chat (Twitch, YouTube and Kick, plus BTTV, FFZ and 7TV emotes) float across the screen. Open **Chat Overlay > Emote & GIF wall**, pick how many emotes, their size, speed and movements, and which chats feed it. The preview shows sample faces as you change things. Copy the URL and add it as a 1920 × 1080 browser source below your chat and alerts. The settings live in the URL, so copy it again after a change.

### 3. Add a feature's overlay

Most features use the pattern `http://127.0.0.1:8787/overlay/addons/<module id>`, for example `.../overlay/addons/thsv.streamer-punishments`. A few have short addresses, such as `/overlay/countdown`, `/overlay/clips`, `/overlay/subathon`, `/overlay/shoutouts` and `/overlay/ad-break`. Always copy the address from the wizard:

1. Open the feature's card on **Extensions** or **Add-ons**.
2. Open its **Overlay** tab, then **Open overlay & test**.
3. Pick a **Card position** and **Card size**. Choose a corner or edge that is free in your layout, so the card stays off your webcam, chat and gameplay. The URL updates as you pick.
4. Select **Copy overlay URL** and add it as a full-canvas browser source (1920 × 1080, or 1080 × 1920 on a vertical canvas).
5. With the feature enabled, select **Show exact template** to see a sample and size your source.

Reward-card features (Fan Crown, First Five, Viewer Spotlight, Village Roll Call, Chat Play Pack) offer four sizes: compact and regular, each in landscape or vertical.

### Raid Scout uses `localhost`

Twitch's clip player refuses to play inside a page opened on `127.0.0.1`. So the wizard gives Raid Scout an address that starts with `http://localhost:8787/...`. Use it exactly as shown. A source left on `127.0.0.1` switches itself to `localhost`.

### Vertical (portrait) canvas

In the **Browser-source checklist**, open **Horizontal / vertical source options** on a source to copy its vertical URL and size. To run a second, portrait OBS profile, use **Clone a landscape or portrait profile** under **Direct scene connections**. It needs its own unused WebSocket port. See [Vertical scene layouts](../vertical-scene-layouts.md) and [Redemption overlay sizes](../redemption-overlay-sizes.md).

## Check it works

1. In the **Browser-source checklist**, select **Open design preview** (core sources) or **Send safe preview** (feature sources). The sample should appear once in your streaming app.
2. On a feature's **Overlay** tab, select **Show exact template**.
3. On **Direct scene connections**, your saved connection should show as connected.

## Common problems

- **The pre-stream check warns about a canvas.** StreamBridge reads your scene collection before you go live. An empty leftover vertical canvas, two canvases with the same name, or Aitum pointing at a canvas without your scenes can make the vertical canvas ignore scene switches. Close OBS and remove the leftover canvas; the check names exactly what it found.

- **The source is blank.** That is normal until something happens. Use a preview button to test.
- **Text looks blurry.** Set the source's width and height to the final size instead of scaling it in OBS.
- **Meld cannot load any overlay.** Windows blocks Store apps from local addresses. See [Troubleshooting](../troubleshooting.md#meld-studio-cannot-reach-the-overlay-or-wizard).
- **Raid Scout clips do not play.** Make sure that source uses `localhost`, not `127.0.0.1`.
- **Overlays stop after a scene change.** Turn off **Shutdown source when not visible** in OBS.

For depth, read [Browser overlay](../browser-overlay.md) and [Raid Scout](../addons/raid-scout.md).
