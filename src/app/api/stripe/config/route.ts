import { NextResponse } from 'next/server';
import { getSettingsForCategoryWithStatus } from '@/lib/settings/serverSettings';
import { evaluateCurrentStripeReadiness, resolveStripeSecretKey } from '@/lib/stripe/server/stripe';
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

  // `configured` has to mean "this deployment will actually let that form charge",
  // not merely "the two keys pair up". A live pair on a deployment that is not the
  // production origin is refused by the same gate `create-payment-intent` uses
  // (readiness blocks live charging off the production origin), so calling it
  // configured would mount a live Stripe.js card form on staging that can never
  // complete — a checkout that looks real and cannot work. Asking the gate the same
  // question the payment route asks keeps the screen and the refusal in agreement.
  const readiness = await evaluateCurrentStripeReadiness();

  return NextResponse.json({
    publishableKey,
    publishableKeySource: settings.publishable_key ? 'db' : envPublishable ? 'env' : 'unset',
    ...status,
    configured: status.configured && readiness.chargingEnabled,
    /** The first reason this deployment may not charge, or null when it may. */
    chargingBlockedReason: readiness.chargingEnabled ? null : readiness.blockers[0] ?? null,
    settingsRead: { ok: read.ok, status: read.status },
  });
}
