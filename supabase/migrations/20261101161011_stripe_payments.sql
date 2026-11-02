-- Stripe payment gate for roast submissions.
--
-- Source of truth for the PRICE is Stripe (a Price with lookup_key 'roast').
-- Nothing here stores what a roast costs; payments.amount_total is only a
-- receipt of what Stripe actually charged.
--
-- Flow: uploading --(Checkout paid, via webhook or verify)--> queued
-- Gate: when app_settings.payments_required = 1, NOTHING can move a
--       submission to 'queued' unless a paid payment exists for it.

create type public.payment_status as enum ('pending', 'paid', 'expired', 'refunded');

create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  submission_id            uuid not null references public.submissions(id) on delete cascade,
  user_id                  uuid not null references auth.users(id),
  stripe_session_id        text not null unique,
  stripe_payment_intent_id text,
  status                   public.payment_status not null default 'pending',
  amount_total             bigint,
  currency                 text,
  livemode                 boolean not null default false,
  created_at               timestamptz not null default now(),
  paid_at                  timestamptz,
  updated_at               timestamptz not null default now()
);

create index payments_submission_id_idx on public.payments (submission_id);
create index payments_payment_intent_idx on public.payments (stripe_payment_intent_id);

alter table public.payments enable row level security;

create policy "own payments" on public.payments
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Feature flag: 0 = old behaviour (no payment needed), 1 = payment required.
insert into public.app_settings (key, value) values ('payments_required', 0)
on conflict (key) do nothing;

-- Hard gate, enforced in the database regardless of which code path
-- tries to queue the submission.
create or replace function public.enforce_paid_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'queued'
     and old.status in ('uploading', 'expired')
     and coalesce((select value from public.app_settings where key = 'payments_required'), 0) = 1
     and not exists (
       select 1 from public.payments p
        where p.submission_id = new.id and p.status = 'paid'
     )
  then
    raise exception 'payment_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger submissions_require_payment
  before update of status on public.submissions
  for each row execute function public.enforce_paid_submission();

-- Called by the edge functions (service role) once Stripe says "paid".
-- Idempotent: safe to call from both the webhook and the success-page verify.
-- Snapshots the uploaded files from storage and queues the submission.
create or replace function public.mark_submission_paid(
  p_session_id     text,
  p_payment_intent text,
  p_amount         bigint,
  p_currency       text,
  p_livemode       boolean
)
returns public.submission_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub    uuid;
  v_pay    public.payment_status;
  v_status public.submission_status;
begin
  select submission_id, status into v_sub, v_pay
    from public.payments
   where stripe_session_id = p_session_id
   for update;

  if v_sub is null then
    raise exception 'unknown_session' using errcode = 'P0002';
  end if;

  if v_pay <> 'refunded' then
    update public.payments
       set status                   = 'paid',
           stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
           amount_total             = p_amount,
           currency                 = p_currency,
           livemode                 = p_livemode,
           paid_at                  = coalesce(paid_at, now()),
           updated_at               = now()
     where stripe_session_id = p_session_id;

    -- A paid customer always gets queued, even if their upload window
    -- lapsed while they were on the Stripe page.
    update public.submissions s
       set status       = 'queued',
           submitted_at = now(),
           file_paths   = coalesce(
             (select array_agg(o.name order by o.name)
                from storage.objects o
               where o.bucket_id = 'submissions'
                 and o.name like s.user_id::text || '/' || s.id::text || '/%'),
             s.file_paths),
           total_bytes  = coalesce(
             (select sum((o.metadata->>'size')::bigint)
                from storage.objects o
               where o.bucket_id = 'submissions'
                 and o.name like s.user_id::text || '/' || s.id::text || '/%'),
             s.total_bytes)
     where s.id = v_sub
       and s.status in ('uploading', 'expired');
  end if;

  select status into v_status from public.submissions where id = v_sub;
  return v_status;
end;
$$;

revoke execute on function public.mark_submission_paid(text, text, bigint, text, boolean) from public, anon, authenticated;
revoke execute on function public.enforce_paid_submission() from public, anon, authenticated;
