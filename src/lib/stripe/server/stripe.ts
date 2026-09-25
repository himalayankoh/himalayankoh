import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { getSetting, getSettingsForCategory } from '@/lib/settings/serverSettings';
import { SITE_ORIGIN } from '@/lib/site/origin';
import {
  classifyStripeKey,
  evaluateStripeReadiness,
  stripeRefusalMessage,
  type StripeReadiness,
} from './readiness';

/**
 * The Stripe side of the app, behind one gate.
 *
 * Every route that can move money — `create-payment-intent`, `verify-payment`
 * and the webhook — asks this module whether charging is permitted *before* it
 * does anything else, and the answer comes from `./readiness`, which fails closed
 * on an unknown probe, a key-mode mismatch and any origin that is not the
 * production store.
 *
 * What that buys, concretely: a live secret key pasted into the staging console
 * cannot take a payment, because `SITE_ORIGIN` there is not the production
 * origin. That is a property of the deployment, not of the key, so it cannot be
 * undone by pasting a different key.
 *
 * Health-check results are read from the `payments` settings category, where the
 * owner-triggered health check records them. An absent record is `null` — "not
 * established" — which blocks live charging rather than assuming it passed.
 */

/** The secret key the server would use: stored setting first, environment second. */
export async function resolveStripeSecretKey(): Promise<string> {
  const dbKey = await getSetting('stripe', 'secret_key');
  return dbKey || process.env.STRIPE_SECRET_KEY || '';
}

export async function resolveStripeWebhookSecret(): Promise<string> {
  const dbSecret = await getSetting('stripe', 'webhook_secret');
  return dbSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
}

export async function resolveStripePublishableKey(): Promise<string> {
  const settings = await getSettingsForCategory('stripe');
  return (
    settings.publishable_key?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
    ''
  );
}

async function readProbeFlag(key: string): Promise<boolean | null> {
  const raw = await getSetting('payments', key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

/**
 * Live charging needs the deliberate switch *and* not being forced into test-only
 * mode. `STRIPE_TEST_MODE_ONLY` stays honoured as the blunt local escape hatch it
 * has always been.
 */
function liveChargingAllowed(): boolean {
  if (process.env.STRIPE_TEST_MODE_ONLY === 'true') return false;
  return process.env.STRIPE_ALLOW_LIVE === 'true';
}

/** The full readiness decision for this deployment, with every reason it is blocked. */
export async function evaluateCurrentStripeReadiness(): Promise<StripeReadiness> {
  const [secretKey, publishableKey, webhookSecret, webhookEndpointOk, healthOk] = await Promise.all([
    resolveStripeSecretKey(),
    resolveStripePublishableKey(),
    resolveStripeWebhookSecret(),
    readProbeFlag('stripe_webhook_endpoint_ok'),
    readProbeFlag('stripe_health_ok'),
  ]);

  return evaluateStripeReadiness({
    secretKey,
    publishableKey,
    webhookSecret,
    allowLive: liveChargingAllowed(),
    origin: SITE_ORIGIN,
    webhookEndpointOk,
    healthOk,
  });
}

/** `'test' | 'live'` from the key's own prefix — the Response `mode` field. */
export async function getStripeMode(): Promise<'test' | 'live'> {
  return (await resolveStripeSecretKey()).startsWith('sk_live_') ? 'live' : 'test';
}

/** A 503 explaining exactly what is missing, or `null` when charging is permitted. */
export async function stripeConfigError(): Promise<NextResponse | null> {
  const readiness = await evaluateCurrentStripeReadiness();
  if (readiness.chargingEnabled) return null;
  return NextResponse.json({ error: stripeRefusalMessage(readiness) }, { status: 503 });
}

export async function getStripeClient(): Promise<Stripe> {
  const readiness = await evaluateCurrentStripeReadiness();
  const secretKey = await resolveStripeSecretKey();
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured.');
  if (!readiness.chargingEnabled) throw new Error(stripeRefusalMessage(readiness));
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
}

/**
 * A client for reading, not charging — and specifically for verifying a webhook
 * signature.
 *
 * The webhook needs to verify a delivery whose mode this deployment may have
 * decided not to charge in (a live delivery arriving at staging, for example).
 * Verification itself is harmless: it only proves Stripe signed the body. So it is
 * deliberately not gated on `chargingEnabled`, and the webhook route then applies
 * its own rule about which modes it may act on. Using the gated client here would
 * have turned "this deployment may not take live payments" into an "invalid
 * signature" 400, which is both untrue and unactionable.
 */
export async function getStripeSignatureVerifier(): Promise<Stripe> {
  const secretKey = await resolveStripeSecretKey();
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' });
}

/** Whether an incoming live-mode delivery may be applied to an order here. */
export async function mayApplyPaymentsForMode(mode: 'test' | 'live'): Promise<{ ok: boolean; reason: string }> {
  if (mode === 'test') return { ok: true, reason: '' };
  const readiness = await evaluateCurrentStripeReadiness();
  if (readiness.chargingEnabled) return { ok: true, reason: '' };
  return { ok: false, reason: stripeRefusalMessage(readiness) };
}

export { classifyStripeKey };
export type { StripeReadiness };
