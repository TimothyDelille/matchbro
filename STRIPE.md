# Stripe payment gate for roasts

## How it works

```
upload files ──► "Confirm" ──► roast-checkout (POST) ──► Stripe Checkout
                                                              │ pays
              submission: uploading ──► queued  ◄── stripe-webhook (checkout.session.completed)
                                                ◄── roast-checkout verify (success page, instant)
```

- **Price lives only in Stripe** — a Price with lookup key `roast`. The app reads it via `GET roast-checkout`; checkout charges it; the DB only records what was actually charged (`payments.amount_total`). Change the price in Stripe → everything follows.
- **Gate is in the database.** When `app_settings.payments_required = 1`, a trigger rejects *any* move of a submission to `queued` unless a `paid` row exists in `payments` — so your existing confirm code path can't bypass it.
- **Sandbox vs live** is only which Stripe keys are in the Supabase secrets. Create the same `roast` lookup key in both.
- Webhook and verify are both idempotent; whichever lands first queues the submission. A customer who pays after their upload window lapsed still gets queued.

## What's deployed (project `hinge-roast`)

| Piece | What |
|---|---|
| `public.payments` | one row per Checkout Session (pending / paid / expired / refunded), RLS: users read their own |
| `app_settings.payments_required` | `0` now (off). Set to `1` once the frontend calls checkout |
| `mark_submission_paid()` | service-role RPC: marks paid, snapshots files from storage, queues |
| `roast-checkout` | `GET` price · `POST {submission_id}` → `{url}` · `POST {action:"verify", session_id}` |
| `stripe-webhook` | `https://viingyedpzyrzobohrda.supabase.co/functions/v1/stripe-webhook` |

## Setup (sandbox)

1. **Stripe Dashboard → switch to your Sandbox.**
2. **Product catalog → Add product** "Hinge Roast", one-time price (whatever you want).
   On the price, set **Lookup key = `roast`** (under advanced/more options).
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…`).
   (A restricted key works too: write on Checkout Sessions, read on Prices & Products.)
4. **Developers → Webhooks → Add destination**
   - URL: `https://viingyedpzyrzobohrda.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`
   - Copy the **Signing secret** (`whsec_…`).
5. **Supabase → Edge Functions → Secrets**, add:
   - `STRIPE_SECRET_KEY` = `sk_test_…`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_…`
   - `APP_URL` = your site origin, e.g. `https://hingeroast.app` (or `http://localhost:3000` while testing)

Test card: `4242 4242 4242 4242`, any future date, any CVC.

Going live later: repeat 2–5 in live mode and replace the two Stripe secrets. No code change.

## Frontend changes

```ts
// 1) Show the price (single source of truth = Stripe)
const { data: price } = await supabase.functions.invoke("roast-checkout", { method: "GET" });
// price = { amount: 999, currency: "usd", product_name: "Hinge Roast", livemode: false }
const label = new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency })
  .format(price.amount / 100);

// 2) "Confirm" button — replaces whatever currently sets status = 'queued'
const { data, error } = await supabase.functions.invoke("roast-checkout", {
  body: {
    submission_id: submissionId,
    success_path: `/submissions/${submissionId}`, // relative to APP_URL; ?session_id=… is appended
    cancel_path: `/submissions/${submissionId}`,  // ?checkout=cancelled is appended
  },
});
if (error) { /* 409 already_submitted, 410 upload_window_expired, 400 no_files_uploaded */ }
else if (data.url) window.location.href = data.url;

// 3) Success page: confirm immediately instead of waiting for the webhook
const sessionId = new URLSearchParams(location.search).get("session_id");
if (sessionId) {
  const { data } = await supabase.functions.invoke("roast-checkout", {
    body: { action: "verify", session_id: sessionId },
  });
  // data = { paid: true, status: "queued" }
}
```

Then remove the old "set status = queued" code and flip the gate on:

```sql
update app_settings set value = 1 where key = 'payments_required';
```
