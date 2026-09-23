# Party-PDG accounts and billing

The live site is the static PWA in `web/`, deployed to the Vercel project `pdg-play` with **Root Directory** `web/`. This change adds Vercel Functions under `web/api/` and keeps the question bank and game modes as they are. The persistent Solo / Multiplayer switch on the host top bar stays as it landed on `main`. This PR does not change that control.

The Python launcher (`start.sh` and friends) does not serve these API routes. On that server, `/api/auth/me` is not JSON, so the browser keeps the original offline / LAN flow. `START.html` and `file://` do the same.

## Env vars (Vercel project `pdg-play`)

Set these on the Vercel project. Do not commit values. Prefer [sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (pooled). Provision with the Vercel Marketplace: `vercel integration add neon`. |
| `RESEND_API_KEY` | Resend API key. Server only. |
| `RESEND_FROM` | `Party-PDG <noreply@pdg-play.com>`. `pdg-play.com` is verified in Resend. |
| `RESEND_REPLY_TO` | Optional monitored inbox. |
| `APP_ORIGIN` | Public origin with no trailing slash, e.g. `https://pdg-play.vercel.app` (or `https://pdg-play.com` after DNS). Used in email links. |
| `ADMIN_BOOTSTRAP_PASSWORD` | Initial password for `nalyd0206@gmail.com`. **Not in source.** Dylan’s chosen bootstrap value, set only in Vercel, is `Password1!`. The seeded admin has `mustChangePassword: true` and must change it on first login. If the user row already exists, the password is not reset. |
| `STRIPE_SECRET_KEY` | Stripe **restricted** key (`rk_...`), not a live secret pasted into git. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint. |
| `STRIPE_PRICE_ID` | Recurring price id for the $1/month plan (`price_...`). |

`web/.env.example` lists the names. `RESEND_FROM` is filled with the verified production sender.

## Resend from-address

Production from-address, and the code default when `RESEND_FROM` is unset:

`RESEND_FROM=Party-PDG <noreply@pdg-play.com>`

`pdg-play.com` is verified in Resend, so verification and password-reset mail send from `noreply@pdg-play.com`. A monitored `RESEND_REPLY_TO` is worth setting, because people reply to verification mail.

Verification and password-reset sends use idempotency keys (`verify-email/<token id>`, `password-reset/<token id>`).

## Neon

Vercel Postgres is sunset. Use Neon from the Marketplace so `DATABASE_URL` is injected into `pdg-play`. Tables are created on the first API request (`CREATE TABLE IF NOT EXISTS` in `web/api/lib/db.js`). No separate migration command.

The admin seed runs in that same step when `ADMIN_BOOTSTRAP_PASSWORD` is set and `nalyd0206@gmail.com` does not already exist. The row is `role=admin`, email already verified, `must_change_password=true`.

## Stripe price

In the Stripe Dashboard (test mode first):

1. Product: **Party-PDG** (one product for this single plan).
2. Price: **$1.00 USD**, recurring, **monthly**.
3. Copy the price id into `STRIPE_PRICE_ID`.

Do not put live keys in the repo. Prefer a restricted key with write access to Checkout Sessions, Customers, Subscriptions (including cancel), Coupons, Promotion Codes, and Billing Portal sessions, plus read access for the same resources the webhook refreshes.

Checkout is a subscription Checkout Session:

- No code: `trial_period_days: 30`, card collected, then $1/month. The card is collected at Checkout; the first charge is when the trial ends unless they cancel in the Customer Portal.
- Code applied in our form: the matching promotion code is attached with `discounts`. Customers can also enter a Stripe promotion code on Checkout when they did not pre-apply one (`allow_promotion_codes`).
- `payment_method_types` is omitted on purpose so Stripe can choose methods from the Dashboard.
- `integration_identifier` is `pdg-play-sub-hkwmnpqx`.
- `automatic_tax` is **off**. If you charge US or EU customers, enable Stripe Tax only after you have an active registration. Without a registration, Stripe calculates no tax. See [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes.md).

### Customer Portal

Dashboard → Settings → Billing → Customer portal:

- Allow customers to **cancel subscriptions**.
- Allow customers to **update payment methods**.
- Include the Party-PDG monthly price if the portal shows plan switching.

The app opens a Billing Portal session from **Manage billing**. There is no homemade cancel form. Account delete cancels an active, trialing, past-due, unpaid, or paused subscription first, then anonymizes the user and wipes progress.

### Webhook

Endpoint: `https://<your-domain>/api/billing/webhook`

Events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Use the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`. The handler verifies the signature on the raw body and ignores duplicate event ids. Returning from Checkout also calls `/api/billing/confirm` so access is not stuck waiting on the webhook.

Entitlement is the subscription status on the user row. `trialing` and `active` can play. Anything else (including a lapsed trial) sees a Subscribe screen. Admins can play without a subscription after they change the bootstrap password. They still cannot skip that password change.

## Discount codes (admin)

Admin → **Discount codes** creates a Stripe Coupon and a Promotion Code, then stores the code, notes, and redemptions in Neon.

| Type | Stripe | Trial behavior |
| --- | --- | --- |
| Free / 100% off, forever | `percent_off=100`, `duration=forever` | No trial. No card (`payment_method_collection=if_required`). Delete cancels those subscriptions (revoke). Disable only blocks new redemptions. |
| Free for N months | `percent_off=100`, `duration=repeating` | No extra trial. Card is collected so month N+1 can bill $1. |
| Percent or amount off, forever | coupon `duration=forever` | 30-day trial, then the discounted price. Example: 50% off → $0.50/mo after the trial. |
| Percent or amount off for N months | `duration=repeating`, `duration_in_months=N` | Trial is **not** stacked, so all N months are at the promo price, then the invoice returns to $1. Example: amount off `$0.50` for 3 months → $0.50/mo for 3 months, then $1/mo. |

Amount off is subtracted from the $1 price (1–100 cents). Codes are letters, numbers, and dashes. Optional max redemptions and expiry are set on both the coupon and the promotion code.

The admin list shows tracked redemptions (email and whether a comp was revoked). Checkout validates the code on the server before creating the session.

## Play flow

1. Logged-out visitors on Vercel see the splash: overview, feature list, **Register now**, **Log in**, **Try demo**.
2. Register sends a 24-hour verification link. Play is blocked until the link is opened.
3. After verify, **Subscribe** opens Checkout (30-day trial, or a discount code).
4. An active trial or subscription lands on the existing ready room (Quiet Hours / Host a party).
5. **Try demo** is guest Quiet Hours on the demo items only. It does not sync progress. Hosting a room and the mock PFE stay locked.
6. Account settings can change the password, open the Customer Portal, or delete the account.
7. **Admin** is visible only for `role=admin` after the forced password change. It lists users (email, verified, plan, disable/delete) and discount codes.

Progress (spaced-repetition box, achievements, focus rollup, last session) is stored on the account. `localStorage` is still written first and treated as a cache. Sync merges by taking the stronger card, the union of study days, and the newer session rollup.

## Local checks

```bash
node --test tools/test_saas.mjs
node tools/test_logic.js
node tools/test_game.js
node tools/test_bank.js
```

## Manual checklist

- [ ] Splash shows for a logged-out visit on the Vercel URL. Python/`file://` still opens the old flow.
- [ ] Register sends mail from `RESEND_FROM`. Unverified accounts cannot start a real session.
- [ ] Verify link logs the user in and shows Subscribe.
- [ ] Checkout uses the $1 price and a 30-day trial. Webhook or the return URL marks the user `trialing`.
- [ ] Customer Portal can cancel and update the card. After cancel, play shows Subscribe.
- [ ] A 100% forever code checks out at $0 without a card. Deleting that code cancels the subscription.
- [ ] A $0.50-off code for 3 months is a repeating `amount_off` of 50 cents and does not add a second trial.
- [ ] Admin list shows who redeemed a code. Non-admins do not see Admin.
- [ ] Bootstrap admin `nalyd0206@gmail.com` / `ADMIN_BOOTSTRAP_PASSWORD` is forced through password change before Admin or play.
- [ ] Delete account cancels Stripe, then the same email can register again.
- [ ] A second device sees merged focus / achievements after login.
- [ ] Demo Quiet Hours does not open the full bank or a room.
