
import { redirect } from 'next/navigation';
import { OptimizedSubscriptionPage } from '@/components/pricing/optimized-subscription-page';
import { getSubscriptionStatus} from '@/utils/actions/stripe/actions';
import { SELF_HOST_UNLIMITED } from '@/lib/self-host';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Profile {
  subscription_plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  payment_failure_count?: number | null;
  last_payment_failed_at?: string | null;
  next_payment_attempt_at?: string | null;
}

export default async function PlansPage() {
  // No plans to choose between on a self-hosted instance. Redirect rather than
  // 404 so bookmarked or in-app links still land somewhere useful.
  if (SELF_HOST_UNLIMITED) {
    redirect('/home');
  }

  let profile: Profile | null = null;
  try {
    profile = await getSubscriptionStatus();
  } catch (error) {
    // User is not authenticated or other error occurred
    console.error('Error fetching subscription status:', error);
  }

  return <OptimizedSubscriptionPage initialProfile={profile} />;
}
