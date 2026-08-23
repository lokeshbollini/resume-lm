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

## Database migration

`supabase/migrations/20260823120000_self_host_grant_pro_access.sql` backfills a
Pro row for existing users and adds a trigger granting one to every future
signup.

The app flag alone is enough to unlock features, so this is belt-and-braces —
but it fixes two real gaps:

- Upstream's `AUTO_PRO_SUBSCRIPTION` only fires on **email** signup, so OAuth
  users never get a row. A trigger on `auth.users` catches every path.
- Admin screens read `subscriptions` directly and would otherwise show everyone
  as "free".

Apply it with `supabase db push`, or paste it into the Supabase SQL editor.

Do **not** apply it to a deployment where you actually charge for Pro.

## Licensing

ResumeLM is AGPL-3.0. Modifying it and running your own instance is explicitly
permitted. Two obligations to be aware of:

- Under the AGPL, **network use counts as distribution**. If people other than
  you can reach the instance, you must offer them the source of your modified
  version — keeping this fork public satisfies that.
- The license and copyright notices stay in place.
