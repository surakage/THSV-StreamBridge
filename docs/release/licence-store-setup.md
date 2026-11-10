# Getting the licence store ready

StreamBridge already has the Licence card on **Start here**. These steps connect it to a real Lemon Squeezy store.
Until they are done, the card accepts nothing paid for and the beta stays free. The licence never turns a feature off
during the beta.

## 1. In Lemon Squeezy

1. Create the store (free, no monthly fee; Lemon Squeezy takes about 5% + 50¢ per sale and handles sales tax and VAT).
2. Create the product **StreamBridge** with one variant per plan you want (for example lifetime, or yearly).
3. On each variant turn on **Generate licence keys** and set:
   - **Activation limit**: how many PCs one key can run on (2 is a common choice: streaming PC and a spare).
   - **Licence length**: unlimited for a lifetime plan, or match the subscription period.
4. Publish the product and copy its checkout link.
5. Note the **store ID** (Settings > Stores) and the **product ID** (Products > the product > the number in the page address).

## 2. Decisions to make

- Price and plans (lifetime, yearly or monthly).
- PCs per key.
- What stays free after the beta, if anything.
- Licence terms and privacy pages (they can live on slothbloom.com). The privacy page should say that the licence key
  and a PC name are sent to Lemon Squeezy when activating and once a day to check it, and nothing else.

## 3. In StreamBridge (Claude does this part)

All of it is in `bridge/services/licence-service.ts`:

- `LICENCE_STORE_IDS` and `LICENCE_PRODUCT_IDS`: once set, keys from any other store or product are refused.
- `LICENCE_LINKS`: `buy` (the checkout link), `terms` and `privacy`. The Licence card shows a **Get a licence** button
  and the terms and privacy links as soon as these are set. Only `https://` links are shown, and the buy button hides once
  the PC is licensed.

Then release as usual. Nothing else changes for creators already on the beta.
