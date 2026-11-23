# Payments (Stripe)

A review is paid before it reaches the queue.

```
SubmitSheet ─ POST /api/submissions ─ upload files ─ POST /api/submissions/[id]/complete
                                                         │ returns { checkoutUrl }
                                                         ▼
                                              Stripe Checkout (hosted)
                                    paid │                         │ cancelled
       /home?session_id=…  ◄─────────────┘                         └──► /home?checkout=cancelled
       confirms + queues instantly                                       "Pay $9.99" to resume
       POST /api/stripe/webhook (same thing, as a backstop)
```

## Plans

Two plans, picked on the paywall (`components/PlanPicker.tsx`, copy in `lib/plans.ts`):

| Plan | Stripe | Notes |
|---|---|---|
| Lifetime | one-time Price, lookup key `lifetime` | Coupon `lifetime_offer` is applied for the first 15 minutes after an upload starts (`OFFER_MINUTES`); the server re-checks the deadline at checkout. No coupon = no offer. |
| Weekly | recurring weekly Price, lookup key `weekly` | Optional coupon `first_week` on the first invoice. Cancel from /home (`/api/billing/cancel`, stops renewal at period end). |

Nothing about plans is stored in the database. `membership()` in `lib/stripe.ts` reads the
account's paid Checkout Sessions from Stripe: a paid `lifetime` session, or a `weekly` session
whose subscription is still active. Members skip the paywall: `coverWithMembership()` records a
$0 `member_<submission id>` payment through `mark_submission_paid`, like a Stripe payment.

## Single source of truth

- **Prices**: only in Stripe, by lookup key (above). To change one, create a new price on the
  product and move the lookup key to it (tick "transfer lookup key").
- **The gate**: `app_settings.payments_required` (0/1). The app reads it to decide whether to
  show the paywall, and a database trigger refuses to queue an unpaid submission when it's 1.

## Files

| File | Role |
|---|---|
| `lib/stripe.ts` | Stripe client, price lookup, create/reuse Checkout Session, mark paid |
| `app/api/submissions/[id]/complete/route.ts` | after upload: returns `checkoutUrl` (gate on) or queues (gate off) |
| `app/api/submissions/[id]/checkout/route.ts` | resume payment for an unpaid upload (signed-in owner only) |
| `app/api/stripe/webhook/route.ts` | `checkout.session.completed` / `async_payment_succeeded` / `expired`, `charge.refunded` |
| `app/home/page.tsx` | confirms `?session_id=` on return, shows "Waiting for payment" rows |
| `supabase/migrations/20261101161011_stripe_payments.sql` | `payments` table, gate trigger, `mark_submission_paid()` (already applied) |
| `supabase/migrations/20261102222442_optional_phone_paid_at.sql` | `submissions.paid_at`, kept in sync from `payments` by trigger (null = unpaid/refunded) |
| `components/admin/PaidPill.tsx` | Paid / Unpaid badge on `/admin` and each submission |

## Env (`.env.local`)

```
STRIPE_SECRET_KEY=sk_test_…          # sandbox key while testing
STRIPE_WEBHOOK_SECRET=whsec_…        # see "Webhook signing secret" below
# APP_URL=https://matchbro.app       # optional; defaults to the request origin
```

No publishable key needed — hosted Checkout is a redirect. Everything runs in the Next app
(`app/api/...`); there are no Supabase Edge Functions.

## Test locally (sandbox)

```bash
brew install stripe/stripe-cli/stripe
stripe login        # pick "matchbro.app sandbox"
```

Then, in its own terminal (one line):

```bash
stripe listen --events=checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded --forward-to=localhost:3000/api/stripe/webhook
```

It prints `Ready! Your webhook signing secret is whsec_…`. Put that in `.env.local` as
`STRIPE_WEBHOOK_SECRET` and restart `npm run dev`. Keep `stripe listen` running while you test.

Turn the gate on (Supabase SQL editor, or ask Claude):

```sql
update app_settings set value = 1 where key = 'payments_required';
```

Then submit a profile and pay with `4242 4242 4242 4242`, any future date, any CVC.
3D Secure: `4000 0025 0000 3155`. Declined: `4000 0000 0000 0002`.

## Webhook signing secret (`whsec_…`)

Each place that sends webhooks has its own secret:

| Where | Secret comes from | Stable? |
|---|---|---|
| Local (`stripe listen`) | printed by the CLI | Same across restarts on your machine; changes if you `stripe login` again or switch accounts. Find it again with `stripe listen --print-secret`. |
| Production | the webhook destination you create in Stripe (live mode) | Fixed until you roll it in the Dashboard. |

The local secret is **never** used in production. Your host (e.g. Vercel) gets the live one;
`.env.local` keeps the CLI one.

## Going live

1. In Stripe **live mode**, create the prices with lookup keys `lifetime` and `weekly` (and the `lifetime_offer` coupon).
2. Workbench → Webhooks → **Create an event destination**: Your account, **Snapshot** payload,
   events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `charge.refunded`; endpoint `https://<your-domain>/api/stripe/webhook`.
   Copy its signing secret.
3. On your host set `STRIPE_SECRET_KEY=sk_live_…` and `STRIPE_WEBHOOK_SECRET=<that secret>`. No code changes.

Sandbox product: `prod_VYBEMikStTHsw5`, price `price_1UX4s7PvNV2VhzEW6KUMMoMZ` ($9.99, lookup key `roast`).
