-- Admin dashboard RPCs.
--
-- src/app/(dashboard)/admin/actions.ts calls four Postgres functions that exist
-- in ResumeLM's own database but were never committed to the repo — schema.sql
-- does not create them, and no migration does either. On any fresh self-hosted
-- install the /admin page therefore fails with "function does not exist", and
-- 20260801090000_harden_public_function_search_paths.sql aborts trying to ALTER
-- them. This migration supplies them.
--
-- Security model: every caller in the app is `createServiceClient()`, i.e. the
-- service_role key, which already bypasses RLS. So these are deliberately
-- SECURITY INVOKER (the default) rather than SECURITY DEFINER — a DEFINER
-- function that returns every user's profile would be a privilege-escalation
-- surface reachable from PostgREST, and it would buy nothing, because the only
-- role that calls it can already read the tables directly. Execute rights are
-- revoked from every client role below.
--
-- search_path is pinned in each definition rather than left to the hardening
-- migration, which runs earlier in the sequence and so cannot see these.

-- Profiles for a batch of users -----------------------------------------------

create or replace function public.get_profiles_for_users(user_ids_array uuid[])
returns setof public.profiles
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.profiles where user_id = any(user_ids_array);
$$;

-- Subscriptions for a batch of users ------------------------------------------

create or replace function public.get_subscriptions_for_users(user_ids_array uuid[])
returns setof public.subscriptions
language sql
stable
set search_path = public, pg_temp
as $$
  select * from public.subscriptions where user_id = any(user_ids_array);
$$;

-- Resume counts for a batch of users ------------------------------------------
--
-- LEFT JOIN against the unnested input so a user with no resumes still comes
-- back as a row with 0, rather than being silently absent from the result.

create or replace function public.get_resume_counts_for_users(user_ids_array uuid[])
returns table (user_id uuid, resume_count integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    ids.id as user_id,
    count(r.id)::integer as resume_count
  from unnest(user_ids_array) as ids(id)
  left join public.resumes r on r.user_id = ids.id
  group by ids.id;
$$;

-- Totals for the admin stat tiles ---------------------------------------------
--
-- These return integer, not bigint, on purpose. PostgREST serializes bigint as
-- a JSON *string* to avoid precision loss, and getTotalResumeCount() does
-- `typeof data === 'number' ? data : 0` — so a bigint return would make the
-- dashboard quietly display 0 instead of the real count.

create or replace function public.count_total_resumes()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer from public.resumes;
$$;

create or replace function public.count_total_users()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer from auth.users;
$$;

-- Lock them to the service role -----------------------------------------------

revoke all on function public.get_profiles_for_users(uuid[]) from public, anon, authenticated;
revoke all on function public.get_subscriptions_for_users(uuid[]) from public, anon, authenticated;
revoke all on function public.get_resume_counts_for_users(uuid[]) from public, anon, authenticated;
revoke all on function public.count_total_resumes() from public, anon, authenticated;
revoke all on function public.count_total_users() from public, anon, authenticated;

grant execute on function public.get_profiles_for_users(uuid[]) to service_role;
grant execute on function public.get_subscriptions_for_users(uuid[]) to service_role;
grant execute on function public.get_resume_counts_for_users(uuid[]) to service_role;
grant execute on function public.count_total_resumes() to service_role;
grant execute on function public.count_total_users() to service_role;
