# Self-hosted unlimited mode

This fork can run as a single-tier instance: no Free/Pro split, no Stripe, no
upgrade prompts. Every signed-in user gets what the hosted product calls Pro.

## Why this is a config flag, not a patch

Upstream gates premium models and resume counts because **ResumeLM pays for
those model calls**. A self-hosted instance pays for its own, so the gate has
nothing left to protect. Rather than deleting the billing code — which would
make every upstream merge a conflict — this fork routes the decision through
one flag and one chokepoint.

Set it in `.env.local`:

```env
NEXT_PUBLIC_SELF_HOST_UNLIMITED=true
```

Unset it and the instance behaves exactly like upstream again.

## What the flag changes

| Area | File | Effect |
|---|---|---|
| Plan resolution | `src/lib/subscription-access.ts` | `hasProAccess` is always `true`, even with no `subscriptions` row |
| Billing state | `src/lib/billing/state.ts` | Always `active`; nothing expires |
| Resume caps | `src/lib/resume-limits.ts` | 2 base / 5 tailored → unlimited |
| Model catalog | `src/lib/ai-models.ts` | `requiresPro` lifted; hidden compatibility models become visible |
| Key resolution | `src/lib/ai/access-control.ts` | Every user reaches the instance's server keys |
| UI | dashboard layout, `/subscription`, landing + login pricing | Upgrade CTAs and price tables removed |

`getSubscriptionAccessState()` is the single chokepoint — resume limits,
premium models, the upgrade button, and the settings page all read
`hasProAccess` from it. That is why one short-circuit unlocks all of them.

## The part that is easy to get wrong

**This does not make AI free.** It moves the bill from ResumeLM to you. Every
request the instance funds charges the provider key in *your* environment. If
you share the instance with other people, you are paying for all of them.

Three ways to keep that bounded, in increasing order of strictness:

1. **Cap per-user usage.** The leaky-bucket limiter is now configurable and
   applies to server-funded requests:

   ```env
   AI_RATE_LIMIT_CAPACITY=40          # requests per user per window
   AI_RATE_LIMIT_WINDOW_SECONDS=18000 # 5 hours
   ```

   It needs Redis. **Without Redis configured the limiter is skipped entirely**
   and the instance is unmetered — the one setting worth double-checking before
   you give anyone else the URL.

2. **Run models locally.** Ollama costs nothing per request:

   ```env
   NEXT_PUBLIC_OLLAMA_MODELS=llama3.1:8b,qwen2.5:14b
   OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
   ```

   Any tag from `ollama list` works. Quality is well below the frontier models
   for resume tailoring, but it is free and private.

3. **Ask users for their own keys.** Bring-your-own-key still works in
   Settings; a user key is used whenever the instance has no matching server
   key.

## Database migrations

Run `schema.sql` first, then everything in `supabase/migrations/` in filename
order — `supabase db push`, or pasted into the Supabase SQL editor. `schema.sql`
alone is **not** enough: it omits `ai_usage_events`, so AI requests fail without
the migrations.

Three of those files are specific to this fork.

### `20260823120000_self_host_grant_pro_access.sql`

Backfills a Pro row for existing users and adds a trigger granting one to every
future signup. The app flag alone already unlocks the features, so this is
belt-and-braces — but it closes two real gaps:

- Upstream's `AUTO_PRO_SUBSCRIPTION` only fires on **email** signup, so OAuth
  users never get a row. A trigger on `auth.users` catches every path.
- Admin screens read `subscriptions` directly and would otherwise show everyone
  as "free".

Do **not** apply it to a deployment where you actually charge for Pro.

### `20260801090000_harden_public_function_search_paths.sql` (modified)

Upstream's version `ALTER`s a fixed list of functions, several of which
`schema.sql` never creates — so on a fresh database the first missing one aborts
the migration with a bare "function does not exist". This fork iterates over the
functions that are actually present instead.

### `20260823130000_admin_dashboard_rpcs.sql` (new)

`src/app/(dashboard)/admin/actions.ts` calls four Postgres functions that live
in ResumeLM's own database but were never committed to the repo. Without them
the `/admin` page fails with "function does not exist". This migration supplies
them:

| Function | Returns |
|---|---|
| `get_profiles_for_users(uuid[])` | `setof profiles` |
| `get_subscriptions_for_users(uuid[])` | `setof subscriptions` |
| `get_resume_counts_for_users(uuid[])` | `table(user_id uuid, resume_count integer)` |
| `count_total_resumes()` | `integer` |
| `count_total_users()` | `integer` |

They are `SECURITY INVOKER` on purpose. Every caller is `createServiceClient()`,
which already bypasses RLS, so a `SECURITY DEFINER` function returning every
user's profile would add a privilege-escalation surface reachable from PostgREST
and buy nothing. Execute is revoked from `anon` and `authenticated`.

The counts return `integer` rather than `bigint` because PostgREST serializes
`bigint` as a JSON *string*, and `getTotalResumeCount()` does
`typeof data === 'number' ? data : 0` — a `bigint` return would make the
dashboard quietly show 0.

## Becoming an admin

`/admin` is gated on `profiles.is_admin`, which defaults to false and has no UI
to change it. Grant it in the SQL editor:

```sql
update public.profiles set is_admin = true where email = 'you@example.com';
```

The row only exists after that account has loaded the dashboard once — the app
creates profiles lazily on first visit.

## Licensing

ResumeLM is AGPL-3.0. Modifying it and running your own instance is explicitly
permitted. Two obligations to be aware of:

- Under the AGPL, **network use counts as distribution**. If people other than
  you can reach the instance, you must offer them the source of your modified
  version — keeping this fork public satisfies that.
- The license and copyright notices stay in place.
