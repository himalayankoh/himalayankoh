import { NextResponse } from 'next/server';
import { getSettingsForCategoryWithStatus } from '@/lib/settings/serverSettings';
import { resolveStripeSecretKey } from '@/lib/stripe/server/stripe';
import { describeStripeConfigStatus } from '@/lib/stripe/server/configStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the browser needs in order to mount — or refuse to mount — a payment form.
 *
 * The keys are resolved where they are stored (the admin Settings store first,
 * the environment second) and then judged *as a pair* by
 * `describeStripeConfigStatus`, so `configured` cannot claim a checkout will work
 * when the two keys disagree on mode.
 *
 * It also reports two diagnostics that reveal no value and save a support round
 * trip, because the failures they describe are otherwise invisible from outside
 * this process:
 *
 *   - `modeMismatch` / `keyStatus` name *which* key is wrong and in what way.
 *   - `settingsRead` records whether the WordPress settings category could be read
 *     at all, and with what HTTP status. A 401/403 there means the administrator
 *     application password this deployment holds is not accepted — which makes
 *     every stored setting look unset. That is the difference between "the owner
 *     has not saved a key yet" and "the keys are saved and this deployment cannot
 *     see them", and the two need very different fixes.
 */
export async function GET() {
  const read = await getSettingsForCategoryWithStatus('stripe');
  const settings = read.values;

  const envPublishable =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
    '';
  const publishableKey = settings.publishable_key?.trim() || envPublishable;
  const secretKey = await resolveStripeSecretKey();
  const webhookSecret =
    settings.webhook_secret?.trim() || process.env.STRIPE_WEBHOOK_SECRET || '';

  const status = describeStripeConfigStatus({ publishableKey, secretKey, webhookSecret });

  return NextResponse.json({
    publishableKey,
    publishableKeySource: settings.publishable_key ? 'db' : envPublishable ? 'env' : 'unset',
    ...status,
    settingsRead: { ok: read.ok, status: read.status },
  });
}
