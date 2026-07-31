# Village Draw

Village Draw is a restart-safe, cross-platform community giveaway add-on for THSV StreamBridge. It supports free single entry, one points ticket, or bounded multiple points tickets with equal per-ticket odds.

Viewer Foundation is required and remains the only authority for identity, balances, point spending, refunds, export, and deletion. Village Draw stores only bounded pseudonymous viewer IDs, temporary display names, ticket totals, recovery records, and compact draw history.

## Setup

1. Install and live-accept Viewer Foundation.
2. Install Village Draw and leave it disabled.
3. Generate the `giveaway`, `enter`, `tickets`, and `mytickets` commands in Command Sync. Keep giveaway management restricted to Moderator or Broadcaster.
4. Configure the prize and entry rules. Use free single entry first.
5. Save, restart StreamBridge, enable the package and feature, then send an overlay preview.
6. Open the authenticated Live controls section and choose **Open entries**.

Overlay URL: `http://127.0.0.1:8787/overlay/addons/thsv.village-draw`

## Safety

- Real money, donations, Bits, subscriptions, cryptocurrency, and provider-paid rewards are not accepted as ticket payment.
- Simulations never purchase tickets, change points, or select a production winner.
- Every spend and refund is idempotent and recoverable after restart.
- The winner is selected by StreamBridge from a frozen ticket snapshot before the overlay announces it.
- Canceling a points giveaway refunds every recorded unrefunded purchase.
- This package is for casual community use, not regulated or high-value drawings.
