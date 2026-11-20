# matchbro.app

dating profile reviews.

Landing page + upload flow. Users drop in screenshots of their profile, enter their email, and submit. We review submissions oldest first (users never see the queue) and publish a report they can read with their account.

## Setup

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` (SQL editor, or `supabase db push`).
2. In the dashboard, set **Storage > Settings > Global file size limit** to 50 MB (the Free plan max).
3. `cp .env.example .env.local` and fill in the Supabase URL, publishable key and secret key, plus the Stripe keys (see `STRIPE.md`).
4. `npm install && npm run dev`

## How a submission flows

1. `POST /api/submissions` validates the form, finds or creates the account (Supabase Auth user + `profiles` row), reserves a slot with `reserve_submission()` and returns one signed upload URL per file.
2. The browser uploads straight to the private `submissions` bucket (no file goes through the Next.js server, so Vercel's body limit doesn't matter) with a progress bar.
3. `POST /api/submissions/:id/complete` checks what actually landed in storage. With payments on, it returns a Stripe Checkout URL and the submission is only marked `queued` once Stripe confirms payment (success page or webhook). With payments off, it's queued straight away. Details in `STRIPE.md`.
4. You review submissions in `/admin` (see below). Publishing marks the submission `done`. Recordings are kept.

## Accounts and signing in

Email only, no passwords. The first upload asks for just an email: `POST /api/submissions` creates the Supabase Auth user (already confirmed) with a random password nobody sees, plus a `profiles` row, and signs them in on the same response. After any upload the browser goes to `/home`, which lists their reviews and has a "Get reviewed" button that skips the email field.

Returning users sign in at `/signin` with a one-time code: they enter their email, Supabase emails a code (and a link to `/auth/confirm`), and they type the code in. `shouldCreateUser: false`, so unknown emails are told to get a review first. "Use a password instead" is still there for admins and accounts created before email-only signup. `proxy.ts` keeps the session fresh and sends signed-out visitors from `/home` to `/signin`.

**Email template:** in Supabase **Authentication > Emails > Magic Link**, the template must include `{{ .Token }}` so the code shows up in the email (the default template only has the link). Example body: `Your matchbro code is {{ .Token }}. Or <a href="{{ .ConfirmationURL }}">sign in with this link</a>.`

If someone submits from the landing page with an email that already has an account, they're asked to sign in instead, so nobody can submit under someone else's account.

## Admin: writing and publishing reviews

`/admin` lists every submission ("To review" oldest first, then "Reviewed"). Open one to see their recordings next to the report editor:

- Markdown with a write/preview toggle and quick formatting buttons. Cmd+S saves.
- Images: the Image button, or paste/drop straight into the text. They're inserted as `![name](report/...)`.
- Voice walkthrough: Record (browser mic) or Upload audio. One per review; recording again replaces it.
- Save draft keeps it private. Publish (with a confirm step) makes it visible to the user at `/reviews/:id`, linked from "Reviewed! 🔥" on their home page. Old `/roasts/:id` links redirect there. After publishing, edits go live when you save.

Make yourself an admin (creates the account if it doesn't exist; runs on your machine):

```
npm run make-admin -- you@example.com 'your-password'
```

Admins are users with `app_metadata.role = "admin"`, which only the secret key can set. Signing in as an admin lands on `/admin`.

### Where reports live

Everything for a submission sits in one folder of the private `submissions` bucket:

```
{user_id}/{submission_id}/1-recording.mp4     what they uploaded  (kept)
{user_id}/{submission_id}/report/...           report images + voice note  (kept)
```

The report text is a row in `reports` (markdown + `audio_path`, one per submission). It's in the database rather than a `.md` file in storage so draft/published state, row-level security and saving are a single transactional write. Files are served with 1-hour signed URLs. On publish, report files the final text no longer uses (replaced recordings, deleted images) are cleaned up.

## The cap

Free plan: 1 GB storage per org, 50 MB max per file.

| Setting (`app_settings`) | Value | Why |
| --- | --- | --- |
| `max_submission_bytes` | 50 MB | One 60–90s screen recording fits easily |
| `max_open_submissions` | 18 | 18 × 50 MB = 900 MB, leaving ~100 MB headroom for the rest of the org (your `blog` project uses ~16 MB) |
| `upload_window_minutes` | 60 | Abandoned uploads free their slot after an hour |

A slot is "open" while a submission is uploading, queued or being reviewed; publishing frees the slot. Recordings, report images and voice notes are all kept, so storage only grows: the cap also stops new submissions when the bucket is within 50 MB of `storage_budget_bytes` (900 MB). On the Free plan that's roughly 18 submissions at the 50 MB maximum, more in practice. Raise `storage_budget_bytes` after upgrading to Pro. When all 18 are taken the button switches to "We're full — back soon".

A user can have several reviews open at once. Each review is paid separately via Stripe Checkout after upload (`STRIPE.md`); an unpaid upload holds its slot until `upload_window_minutes` runs out.

Egress is the other free-plan limit (5 GB uncached/month). Each review downloads the recording once, so that's roughly 100 reviews a month at the maximum size, more in practice.

On Pro (100 GB) change `max_open_submissions` to something like 1800 with one SQL update; no deploy needed.

## Before launch

- Add rate limiting to `/api/submissions` (e.g. Vercel Firewall or Upstash) — right now anyone can create accounts for any email.
- Email: set up custom SMTP (e.g. Resend) in Supabase. The built-in sender is rate-limited to a few emails an hour, which sign-in codes will hit fast. Then send "review ready" emails too.
- Build the report page and the reviewer tool.
