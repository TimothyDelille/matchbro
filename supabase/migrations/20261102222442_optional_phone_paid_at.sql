-- 1) Phone is optional at sign-up.
alter table public.profiles alter column phone drop not null;

-- 2) Show payment state directly on submissions.
--    payments stays the source of truth; paid_at is derived from it by trigger,
--    so it can't drift (a full refund clears it again).
alter table public.submissions add column paid_at timestamptz;

comment on column public.submissions.paid_at is
  'When Stripe confirmed payment (null = unpaid or refunded). Maintained from public.payments by trigger.';

create or replace function public.sync_submission_paid_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.submissions s
     set paid_at = (select min(p.paid_at)
                      from public.payments p
                     where p.submission_id = s.id
                       and p.status = 'paid')
   where s.id = new.submission_id;
  return null;
end;
$$;

revoke execute on function public.sync_submission_paid_at() from public, anon, authenticated;

create trigger payments_sync_paid_at
  after insert or update of status, paid_at on public.payments
  for each row execute function public.sync_submission_paid_at();

-- Backfill.
update public.submissions s
   set paid_at = (select min(p.paid_at) from public.payments p
                   where p.submission_id = s.id and p.status = 'paid');
