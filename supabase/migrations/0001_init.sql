-- Hinge Roast: accounts, submission queue, reports, storage bucket, capacity cap.
--
-- Capacity math (Supabase Free plan):
--   Storage quota 1 GB per org, max 50 MB per file.
--   ~900 MB budget for recordings (leaves headroom for the rest of the org)
--   50 MB max per submission  ->  18 open submissions at a time.
--   Files are deleted once the roast is published, which frees the slot's storage.
-- Change the numbers in app_settings when you upgrade (Pro = 100 GB -> e.g. 1800 slots).

-- ---------------------------------------------------------------- settings
create table public.app_settings (
  key   text primary key,
  value bigint not null
);

insert into public.app_settings (key, value) values
  ('max_open_submissions', 18),
  ('max_submission_bytes', 50 * 1024 * 1024),
  ('upload_window_minutes', 60);

alter table public.app_settings enable row level security;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  phone      text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- ---------------------------------------------------------------- submissions
create type public.submission_status as enum (
  'uploading',   -- slot reserved, files uploading
  'queued',      -- waiting for review
  'reviewing',   -- we're on it
  'done',        -- report published, files deleted
  'expired'      -- upload abandoned
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  status        public.submission_status not null default 'uploading',
  file_paths    text[] not null default '{}',
  total_bytes   bigint not null default 0,
  created_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  reviewed_at   timestamptz
);

create index submissions_user_idx   on public.submissions (user_id);
create index submissions_status_idx on public.submissions (status, submitted_at);

alter table public.submissions enable row level security;

create policy "own submissions" on public.submissions
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- reports
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  content       jsonb not null default '{}',
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index reports_user_idx on public.reports (user_id);

alter table public.reports enable row level security;

create policy "own published reports" on public.reports
  for select to authenticated
  using ((select auth.uid()) = user_id and published_at is not null);

-- ---------------------------------------------------------------- review queue (oldest first)
create view public.review_queue
with (security_invoker = true) as
select s.id, s.status, s.submitted_at, s.total_bytes, s.file_paths, p.email, p.phone,
       row_number() over (order by s.submitted_at) as position
from public.submissions s
join public.profiles p on p.id = s.user_id
where s.status in ('queued', 'reviewing')
order by s.submitted_at;

-- ---------------------------------------------------------------- capacity
-- Public read of the cap so the landing page can show "full".
create or replace function public.capacity()
returns table (open_count bigint, max_open bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.submissions
      where status in ('queued', 'reviewing')
         or (status = 'uploading'
             and created_at > now() - make_interval(mins => (select value::int from public.app_settings where key = 'upload_window_minutes')))),
    (select value from public.app_settings where key = 'max_open_submissions');
$$;

grant execute on function public.capacity() to anon, authenticated;

-- Atomically reserve a slot. Server-only (service role).
create or replace function public.reserve_submission(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open bigint;
  v_max  bigint;
  v_id   uuid;
begin
  perform pg_advisory_xact_lock(hashtext('reserve_submission'));

  update public.submissions
     set status = 'expired'
   where status = 'uploading'
     and created_at <= now() - make_interval(mins => (select value::int from public.app_settings where key = 'upload_window_minutes'));

  if exists (select 1 from public.submissions
              where user_id = p_user_id and status in ('uploading', 'queued', 'reviewing')) then
    raise exception 'already_in_line' using errcode = 'P0001';
  end if;

  select open_count, max_open into v_open, v_max from public.capacity();
  if v_open >= v_max then
    raise exception 'at_capacity' using errcode = 'P0001';
  end if;

  insert into public.submissions (user_id) values (p_user_id) returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.reserve_submission(uuid) from public, anon, authenticated;

-- Position in line for a queued submission.
create or replace function public.queue_position(p_submission_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.submissions
   where status in ('queued', 'reviewing')
     and submitted_at <= (select submitted_at from public.submissions where id = p_submission_id);
$$;

revoke execute on function public.queue_position(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions', 'submissions', false, 50 * 1024 * 1024,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do nothing;
-- No storage.objects policies: uploads only happen through signed upload URLs
-- issued by the server, and only the service role can read files.
