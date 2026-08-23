-- Self-hosted deployments: give every user a Pro subscription row.
--
-- The application code already treats all users as Pro when
-- NEXT_PUBLIC_SELF_HOST_UNLIMITED=true, so this migration is belt-and-braces.
-- It matters for two cases the app flag alone does not cover:
--
--   1. Admin screens and SQL reports that read `subscriptions` directly and
--      would otherwise show everyone as "free".
--   2. Turning the flag back off later without stranding users mid-session.
--
-- The upstream repo only grants Pro on email signup, and only when
-- AUTO_PRO_SUBSCRIPTION=true (see src/app/(auth)/auth/login/actions.ts). That
-- misses OAuth signups entirely. A database trigger catches every path into
-- auth.users, so there is no signup route left to forget.
--
-- Safe to run on a hosted instance you own. Do NOT apply this to a deployment
-- where you actually charge for Pro: it hands Pro to every account for free.

-- 1. Backfill existing users -------------------------------------------------

insert into public.subscriptions (user_id, subscription_plan, subscription_status, current_period_end)
select
  u.id,
  'pro',
  'active',
  -- getBillingState() downgrades a Pro row with no future access window, so the
  -- period end has to stay in the future. A far-future date is the self-hosted
  -- equivalent of "never expires".
  '2099-12-31T00:00:00Z'::timestamptz
from auth.users u
on conflict (user_id) do update
set
  subscription_plan = 'pro',
  subscription_status = 'active',
  current_period_end = '2099-12-31T00:00:00Z'::timestamptz;

-- 2. Grant Pro to every future signup ---------------------------------------

create or replace function public.grant_self_host_pro_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, subscription_plan, subscription_status, current_period_end)
  values (new.id, 'pro', 'active', '2099-12-31T00:00:00Z'::timestamptz)
  on conflict (user_id) do update
  set
    subscription_plan = 'pro',
    subscription_status = 'active',
    current_period_end = '2099-12-31T00:00:00Z'::timestamptz;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_grant_pro on auth.users;

create trigger on_auth_user_created_grant_pro
  after insert on auth.users
  for each row
  execute function public.grant_self_host_pro_subscription();
