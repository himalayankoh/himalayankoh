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

/**
 * The secret key from an already-read `stripe` settings row, environment second.
 *
 * `resolveStripeSecretKey` reads the store itself, which is right for a caller that
 * has no settings row yet. A caller that has *just* read one would pay a second
 * round trip for an answer it is already holding — and `/api/stripe/config` is on
 * the checkout's critical path, where that showed up as the payment section sitting
 * on "Checking payment options…" for seconds. So the precedence lives here, once,
 * and both callers share it.
 */
export function stripeSecretKeyFrom(settings: Record<string, string | null>): string {
  return settings.secret_key?.trim() || process.env.STRIPE_SECRET_KEY || '';
}

/** The webhook signing secret from an already-read `stripe` settings row, env second. */
export function stripeWebhookSecretFrom(settings: Record<string, string | null>): string {
  return settings.webhook_secret?.trim() || process.env.STRIPE_WEBHOOK_SECRET || '';
}

/** The secret key the server would use: stored setting first, environment second. */
export async function resolveStripeSecretKey(): Promise<string> {
  const dbKey = await getSetting('stripe', 'secret_key');
  return dbKey || process.env.STRIPE_SECRET_KEY || '';
}

export async function resolveStripeWebhookSecret(): Promise<string> {
  const dbSecret = await getSetting('stripe', 'webhook_secret');
  return dbSecret || process.env.STRIPE_WEBHOOK_SECRET || '';
}

/** The publishable key from an already-read `stripe` settings row, environment second. */
export function stripePublishableKeyFrom(settings: Record<string, string | null>): string {
  return (
    settings.publishable_key?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
    ''
  );
}

/**
 * The publishable key the server would use: stored setting first, environment second.
 *
 * Read by *key*, not by category. Three fields take part in a readiness decision, and
 * fetching the whole category to pick one of them is a round trip nobody asked for.
 */
export async function resolveStripePublishableKey(): Promise<string> {
  const stored = await getSetting('stripe', 'publishable_key');
  return stripePublishableKeyFrom({ publishable_key: stored });
}

async function readProbeFlag(key: string): Promise<boolean | null> {
  return probeFlagFrom(await getSetting('payments', key));
}

/**
 * A recorded probe, as the readiness decision reads it.
 *
 * `null` is "not established" — the health check has not run — and it blocks live
 * charging rather than assuming it passed.
 */
function probeFlagFrom(value: string | null | undefined): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
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

/** The one place the decision is assembled from its five inputs. */
function readinessFromKeys(input: {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  webhookEndpointOk: boolean | null;
  healthOk: boolean | null;
}): StripeReadiness {
  return evaluateStripeReadiness({
    secretKey: input.secretKey,
    publishableKey: input.publishableKey,
    webhookSecret: input.webhookSecret,
    allowLive: liveChargingAllowed(),
    origin: SITE_ORIGIN,
    webhookEndpointOk: input.webhookEndpointOk,
    healthOk: input.healthOk,
  });
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

  return readinessFromKeys({ secretKey, publishableKey, webhookSecret, webhookEndpointOk, healthOk });
}

/**
 * The same decision, from rows the caller has already read.
 *
 * Both console reads hold the `stripe` and `payments` categories before they ask
 * anything about Stripe, and they hold them for other reasons — the settings screen is
 * drawing the fields, the payments screen the provider cards. Asking the self-reading
 * resolver would fetch both categories again for values already in hand, and on staging
 * that measured seconds per screen.
 *
 * The probe flags are mapped exactly as `readProbeFlag` maps them, so "not established"
 * blocks live charging from either caller.
 */
export function stripeReadinessFrom(rows: {
  stripe: Record<string, string | null>;
  payments: Record<string, string | null>;
}): StripeReadiness {
  return readinessFromKeys({
    secretKey: stripeSecretKeyFrom(rows.stripe),
    publishableKey: stripePublishableKeyFrom(rows.stripe),
    webhookSecret: stripeWebhookSecretFrom(rows.stripe),
    webhookEndpointOk: probeFlagFrom(rows.payments.stripe_webhook_endpoint_ok),
    healthOk: probeFlagFrom(rows.payments.stripe_health_ok),
  });
}

/**
 * Everything the console says about Stripe, from the two categories it holds.
 *
 * ## Why this exists
 *
 * Two screens describe Stripe: the payments screen (provider cards) and the settings
 * screen (one status badge beside the key fields). They used to derive "configured",
 * "ready" and "last error" separately, which is two places for one decision to drift —
 * and the badge then says "Configured" while a card says "Error", which is worse than
 * either being wrong alone. So the derivation lives here once, and each screen picks the
 * fields it shows.
 *
 * ## What it deliberately does not carry
 *
 * No key material, not even the masked `abcd••••wxyz` form: `secretKey`,
 * `publishableKey` and `webhookSecret` are resolved to decide readiness and are never
 * part of the returned facts. A screen that only shows a badge has no use for them, and
 * a screen that shows key state reads `keys` from the payments projection, where the
 * masking rules live.
 */
export interface StripeFacts {
  /** Both keys present. Says nothing about whether charging is permitted. */
  configured: boolean;
  /** Configured *and* not switched off by the owner. */
  enabled: boolean;
  /** This deployment would actually let that key charge. */
  ready: boolean;
  mode: 'sandbox' | 'production';
  stageLabel: string;
  readiness: StripeReadiness;
  lastTestAt?: string;
  lastTestOk: boolean;
  /** The first blocker when not ready, or the last recorded error. */
  lastError?: string;
}

export function stripeFacts(rows: {
  stripe: Record<string, string | null>;
  payments: Record<string, string | null>;
}): StripeFacts {
  const readiness = stripeReadinessFrom(rows);
  const configured = Boolean(stripeSecretKeyFrom(rows.stripe) && stripePublishableKeyFrom(rows.stripe));
  const enabled = rows.payments.stripe_enabled !== 'false' && configured;
  const ready =
    enabled &&
    readiness.chargingEnabled &&
    readiness.orderSyncConfigured &&
    (readiness.stage === 'test' || readiness.readyForLive);

  return {
    configured,
    enabled,
    ready,
    mode: readiness.secretMode === 'live' ? 'production' : 'sandbox',
    stageLabel: readiness.stage === 'off' ? 'OFF' : readiness.stage === 'live' ? 'LIVE / PRODUCTION' : 'TEST / STAGING',
    readiness,
    lastTestAt: rows.payments.stripe_last_test_at || undefined,
    lastTestOk: rows.payments.stripe_last_test_ok === 'true',
    // The first blocker, not a generic "error": the screen has to say what is missing
    // or the owner has to go looking for it.
    lastError: ready ? undefined : readiness.blockers[0] || rows.payments.stripe_last_error || undefined,
  };
}

/** The Stripe facts from the store, for a caller with no rows in hand. */
export async function readStripeFacts(): Promise<StripeFacts> {
  const [stripe, payments] = await Promise.all([
    getSettingsForCategory('stripe'),
    getSettingsForCategory('payments'),
  ]);
  return stripeFacts({ stripe, payments });
}

/**
 * What a status badge needs, and nothing else.
 *
 * The Settings screen shows one badge beside the key fields; the payments screen shows
 * the whole card. Both are cut from the same `StripeFacts`, and this is the narrow cut —
 * it carries no key material at all, not even masked, because a badge has no use for it.
 */
export interface StripeBadge {
  mode: 'sandbox' | 'production';
  isConfigured: boolean;
  enabled: boolean;
  ready: boolean;
  stageLabel: string;
  lastTestAt?: string;
  lastTestOk: boolean;
  lastError?: string;
}

export function stripeBadge(facts: StripeFacts): StripeBadge {
  return {
    mode: facts.mode,
    isConfigured: facts.configured,
    enabled: facts.enabled,
    ready: facts.ready,
    stageLabel: facts.stageLabel,
    lastTestAt: facts.lastTestAt,
    lastTestOk: facts.lastTestOk,
    lastError: facts.lastError,
  };
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
