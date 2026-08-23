-- Keep SECURITY DEFINER and shared helper functions on an explicit search path.
-- This prevents caller-controlled schemas from changing object resolution.
--
-- Upstream's version ALTERs a fixed list of functions. Several of them are the
-- admin-dashboard RPCs, which schema.sql never creates — so on a fresh database
-- the first missing one aborts the whole migration with a bare "function does
-- not exist". Iterating over what is actually present makes this safe to run
-- against a brand-new project, and it still hardens any of the listed functions
-- that appear later (this fork ships the admin RPCs in a later migration).
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_profiles_for_users',
        'get_subscriptions_for_users',
        'get_resume_counts_for_users',
        'count_resumes_by_user',
        'count_total_resumes',
        'count_total_users',
        'trigger_set_timestamp',
        'update_updated_at_column',
        'handle_new_user'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
  END LOOP;

  -- handle_new_user is SECURITY DEFINER where it exists, and must only ever be
  -- callable by the auth service — never by a client role.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin';
    END IF;
  END IF;
END
$$;
