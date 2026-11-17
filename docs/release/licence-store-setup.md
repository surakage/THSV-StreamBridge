# Getting the licence store ready

StreamBridge already has the Licence card on **Start here**. These steps connect it to the SlothBloom store on Polar
(Lemon Squeezy is closing on March 31, 2027). Until they are done, the card says licences are not on sale yet and the
beta stays free. The licence never turns a feature off during the beta.

## 1. In Polar

1. Sign up at polar.sh and create the organization (free plan: 5% + 50¢ per sale, +1.5% for cards from outside the US;
   Polar is the merchant of record and handles sales tax and VAT). Connect payouts.
2. Create the products: **Founder Lifetime** $79.99 (one-time), **Monthly** $4.99 and **Yearly** $39.99 (subscriptions).
3. Give each product a **Licence keys** benefit with:
   - **Activation limit**: 2 (streaming PC and a spare).
   - **Expiry**: none for the lifetime plan. Subscription keys are revoked by Polar when the subscription ends.
4. Copy each product's checkout link, the **organization ID** (Settings > General) and each licence benefit's ID
   (Benefits > the benefit), and send them to Claude.

## 2. In StreamBridge (Claude does this part)

All of it is in `bridge/services/licence-service.ts`:

- `LICENCE_ORGANIZATION_ID`: the Polar organization. Keys are looked up only in it.
- `LICENCE_BENEFITS`: each licence-key benefit ID with the plan name shown on the card. Keys from any other benefit are
  refused.
- `LICENCE_LINKS`: `buy` (the checkout link), `terms` and `privacy`. Only `https://` links are shown, and the buy button
  hides once the PC is licensed.
- The **Manage my licence** link on the Licence card (`wizard/browser/index.html`, `licence-manage`) points to the Polar
  customer portal.

The privacy page should say that the licence key and a PC name are sent to Polar when activating and once a day to
check it, and nothing else.

Then release as usual. Nothing else changes for creators already on the beta.
