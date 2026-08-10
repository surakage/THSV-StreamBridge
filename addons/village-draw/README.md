# Village Draw

Village Draw is a restart-safe, cross-platform community giveaway add-on for THSV StreamBridge. It supports free single entry, one points ticket, or bounded multiple points tickets with equal per-ticket odds.

Viewer Foundation is required and remains the only authority for identity, balances, point spending, refunds, export, and deletion. Village Draw stores only bounded pseudonymous viewer IDs, temporary display names, ticket totals, recovery records, and compact draw history.

## Setup

1. Install and live-accept Viewer Foundation.
2. Install Village Draw and leave it disabled.
3. Keep chat-message triggers on the existing main Twitch, YouTube, Kick, and TikTok intake actions. Do not generate separate giveaway commands or triggers in Streamer.bot.
4. Configure the command prefix, prize, and entry rules. Use free single entry first.
5. Choose the compact or wide Prize Ticket, drawing time, translucent background, visible fields, confetti, and optional browser-source winner tone.
6. Save, restart StreamBridge, enable the package and feature, then send an overlay preview.
7. Open the authenticated Live controls section and choose **Open entries**. Viewers can then use `!enter`, `!tickets`, and `!mytickets` directly in chat.

Overlay URL: `http://127.0.0.1:8787/overlay/addons/thsv.village-draw`

The winner overlay uses one publication. Entrant names cycle locally inside the browser source, the ticket flips to reveal the winner, optional confetti plays, the result remains for the configured duration, and the ticket fades out. This avoids repeated bridge, Streamer.bot, or WebSocket calls during the animation. Profile pictures are displayed only when the normalized entry event supplied a short HTTPS avatar URL; otherwise the ticket uses a safe initial seal.

## Safety

- Real money, donations, Bits, subscriptions, cryptocurrency, and provider-paid rewards are not accepted as ticket payment.
- Simulations never purchase tickets, change points, or select a production winner.
- Every spend and refund is idempotent and recoverable after restart.
- The winner is selected by StreamBridge from a frozen ticket snapshot before the overlay announces it.
- Canceling a points giveaway refunds every recorded unrefunded purchase.
- This package is for casual community use, not regulated or high-value drawings.
