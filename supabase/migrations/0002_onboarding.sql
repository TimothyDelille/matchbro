-- Onboarding quiz answers (problem, focus, likes per week) and where they heard
-- of us, e.g. {"problem":"few_likes","focus":"pictures","likes":"1-3","source":"tiktok"}.
-- Shown to the reviewer in /admin. The app works without this column; answers
-- are just not saved until it exists.
alter table public.submissions add column if not exists onboarding jsonb;
