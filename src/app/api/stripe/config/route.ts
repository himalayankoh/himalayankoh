import { NextResponse } from 'next/server';
import { getSettingsForCategoryWithStatus } from '@/lib/settings/serverSettings';
import {
  evaluateCurrentStripeReadiness,
  stripeSecretKeyFrom,
  stripeWebhookSecretFrom,
} from '@/lib/stripe/server/stripe';
import { evaluateStripeReadiness } from '@/lib/stripe/server/readiness';
import { describeStripeConfigStatus } from '@/lib/stripe/server/configStatus';
import { SITE_ORIGIN } from '@/lib/site/origin';
import {
  STAGING_TEST_CARDS,
  resolveCheckoutPaymentOption,
} from '@/lib/payments/stagingSimulator';
import { readStagingSimulatorStatus } from '@/lib/payments/server/stagingSimulatorGate';

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
 *
 * It also answers "how can this checkout be paid?" once, as
 * `checkoutPaymentOption`, and reports the staging-only simulator alongside it. The
 * two belong together: the priority is *real card first, simulator second, refusal
 * last*, and putting it here means the checkout asks one question and gets the
 * server's answer rather than assembling its own guess from two endpoints.
 */
export async function GET(request: Request) {
  const read = await getSettingsForCategoryWithStatus('stripe');
  const settings = read.values;

  const envPublishable =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
    '';
  const publishableKey = settings.publishable_key?.trim() || envPublishable;
  // Resolved from the row already in hand rather than through the self-reading
  // resolvers: those would fetch the same category again, and on staging that extra
  // round trip measured four to fifteen seconds.
  const secretKey = stripeSecretKeyFrom(settings);
  const webhookSecret = stripeWebhookSecretFrom(settings);

  const status = describeStripeConfigStatus({ publishableKey, secretKey, webhookSecret });

  // `configured` has to mean "this deployment will actually let that form charge",
  // not merely "the two keys pair up". A live pair on a deployment that is not the
  // production origin is refused by the same gate `create-payment-intent` uses
  // (readiness blocks live charging off the production origin), so calling it
  // configured would mount a live Stripe.js card form on staging that can never
  // complete — a checkout that looks real and cannot work. Asking the gate the same
  // question the payment route asks keeps the screen and the refusal in agreement.
  // Test charging is gated on nothing but the keys agreeing on a mode, so a test
  // deployment is decided from the keys already read above. Live charging also
  // consults the recorded webhook and health probes, which live in a *different*
  // settings category; that read happens only when the key is genuinely live, so the
  // common path stays a single WordPress round trip.
  const readiness =
    status.keyStatus.secret === 'live'
      ? await evaluateCurrentStripeReadiness()
      : evaluateStripeReadiness({ secretKey, publishableKey, webhookSecret, origin: SITE_ORIGIN });

  const stripeConfigured = status.configured && readiness.chargingEnabled;

  // The simulator is judged from the same settings row, so the payment priority below
  // costs no extra WordPress round trip. `available` already includes the origin gate,
  // which is why a production deployment reports it false however the switch is set.
  const simulator = await readStagingSimulatorStatus({
    settings,
    requestHost: request.headers.get('host'),
  });

  return NextResponse.json({
    publishableKey,
    publishableKeySource: settings.publishable_key ? 'db' : envPublishable ? 'env' : 'unset',
    ...status,
    configured: stripeConfigured,
    /** The first reason this deployment may not charge, or null when it may. */
    chargingBlockedReason: readiness.chargingEnabled ? null : readiness.blockers[0] ?? null,
    settingsRead: { ok: read.ok, status: read.status },
    stagingSimulator: {
      available: simulator.available,
      enabled: simulator.enabled,
      source: simulator.source,
      reason: simulator.reason,
      testCards: { ...STAGING_TEST_CARDS },
    },
    // One server-decided answer for "how can this checkout be paid?", so the screen
    // cannot mount a form the routes would refuse.
    checkoutPaymentOption: resolveCheckoutPaymentOption({
      stripeConfigured,
      simulatorAvailable: simulator.available,
    }),
  });
}
