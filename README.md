# Hinge Roast

Landing page + upload flow. Users drop in a screen recording of their profile and a few chats, enter email and phone, and get in line. We review submissions oldest first and publish a report they can read with their account.

## Setup

1. Create a Supabase project and run `supabase/migrations/0001_init.sql` (SQL editor, or `supabase db push`).
2. In the dashboard, set **Storage > Settings > Global file size limit** to 50 MB (the Free plan max).
3. `cp .env.example .env.local` and fill in the URL, publishable key and secret key.
4. `npm install && npm run dev`

## How a submission flows

1. `POST /api/submissions` validates the form, finds or creates the account (Supabase Auth user + `profiles` row with the phone number), reserves a slot with `reserve_submission()` and returns one signed upload URL per file.
2. The browser uploads straight to the private `submissions` bucket (no file goes through the Next.js server, so Vercel's body limit doesn't matter) with a progress bar.
3. `POST /api/submissions/:id/complete` checks what actually landed in storage, then marks the submission `queued` and returns the person's place in line.
4. You work through `review_queue` (a view ordered by submit time). When a roast is ready, call `publishReport(submissionId, content)` from `lib/supabase/admin.ts`: it publishes the report, marks the submission `done` and deletes the recordings.

Users sign in later with an email one-time code (`supabase.auth.signInWithOtp`); RLS already limits them to their own submissions and published reports.

## The cap

Free plan: 1 GB storage per org, 50 MB max per file.

| Setting (`app_settings`) | Value | Why |
| --- | --- | --- |
| `max_submission_bytes` | 50 MB | One 60–90s screen recording fits easily |
| `max_open_submissions` | 18 | 18 × 50 MB = 900 MB, leaving ~100 MB headroom for the rest of the org (your `blog` project uses ~16 MB) |
| `upload_window_minutes` | 60 | Abandoned uploads free their slot after an hour |

A slot is "open" while a submission is uploading, queued or being reviewed. Publishing a report deletes the files and frees the slot. When all 18 are taken the button switches to "We're full — back soon".

Egress is the other free-plan limit (5 GB uncached/month). Each review downloads the recording once, so that's roughly 100 roasts a month at the maximum size, more in practice.

On Pro (100 GB) change `max_open_submissions` to something like 1800 with one SQL update; no deploy needed.

## Before launch

- Add rate limiting to `/api/submissions` (e.g. Vercel Firewall or Upstash) — right now anyone can create accounts for any email.
- Turn on email confirmation / send the "you're in line" email.
- Build the report page and the reviewer tool.
