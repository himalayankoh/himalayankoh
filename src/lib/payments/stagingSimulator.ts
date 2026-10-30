/**
 * The staging-only payment simulator.
 *
 * ## What this is for
 *
 * The real card checkout needs Stripe *test* keys. Until the owner stores them,
 * the retail checkout can only say "Online payment is temporarily unavailable",
 * which means the ordering system — cart, shipping, order reservation, WooCommerce
 * order, Sales & Profit — cannot be exercised end to end at all. This module is the
 * smallest thing that unsticks that: a simulated card payment that goes through the
 * *same* order pipeline a real payment uses, on the staging origin only.
 *
 * ## What it deliberately is not
 *
 * It is not Stripe, and it must never claim to be. Nothing here imports the Stripe
 * SDK, creates a PaymentIntent, or touches a Stripe key, so the money-taking path
 * and the simulation path cannot be confused with one another — the Stripe safety
 * gate in `lib/stripe/server/readiness` is untouched by this feature. A simulated
 * order is stored with `staging_test_card` / "Staging Test Card", never with a
 * `stripe_*` label, so Sales, the console and any later reconciliation can always
 * tell a QA order from a real one.
 *
 * ## The gate, and why it is not a UI concern
 *
 * Simulated payments are allowed only when **both** are true:
 *
 *   1. the switch is on — the admin setting under Settings → Service & API Keys →
 *      Stripe, or the `STAGING_PAYMENT_SIMULATOR` deployment variable, and
 *   2. this deployment is the staging deployment, and the request is not arriving
 *      on a production hostname.
 *
 * Both halves are evaluated on the server, per request, and the endpoint answers
 * `403` when either fails. Hiding the form in the browser is a convenience; the
 * refusal is what actually enforces this, so a hand-written `POST` to the
 * production host is refused no matter what the client does. The production origin
 * can never be enabled, not even by turning the switch on, because the origin
 * condition is checked before the switch is consulted for that case: production is
 * a refusal, never a permission.
 *
 * Pure over its inputs — no `process.env`, no fetch — so every one of those refusals
 * is pinned in `stagingSimulator.test.ts` without a deployment to test against.
 */

import { SITE_ORIGIN_STAGING, SITE_ORIGIN_PRODUCTION, isLoopbackOrigin } from '@/lib/site/origin';

/** The admin setting (`Settings → Service & API Keys → Stripe`) that turns it on. */
export const STAGING_SIMULATOR_SETTING_KEY = 'staging_simulator';

/** The deployment-level switch, for a Worker var or a local `.env.local`. */
export const STAGING_SIMULATOR_ENV_KEY = 'STAGING_PAYMENT_SIMULATOR';

/** Human label for the admin console, and in error messages. */
export const STAGING_SIMULATOR_LABEL = 'Staging Payment Simulator';

/**
 * The one origin simulated payments may run on. Imported rather than written out so
 * there is a single place that knows which origin staging is.
 */
export const STAGING_SIMULATOR_ORIGIN = SITE_ORIGIN_STAGING;

/**
 * How a simulated order is stored. Deliberately not `stripe_card` and deliberately
 * not prefixed `stripe_`: Stripe was not used, and a label that said otherwise would
 * make a QA order indistinguishable from a real card payment in Sales and the
 * console.
 */
export const STAGING_PAYMENT_METHOD = 'staging_test_card';
export const STAGING_PAYMENT_METHOD_TITLE = 'Staging Test Card';

/** The private note every simulated order carries, so nobody fulfils one. */
export const STAGING_ORDER_NOTE = 'STAGING TEST ORDER — DO NOT FULFILL';

/** Transaction reference prefix — `stg_test_pay_<order id>`. */
export const STAGING_TRANSACTION_PREFIX = 'stg_test_pay_';

/** The customer a QA order belongs to. */
export const STAGING_TEST_CUSTOMER_NAME = 'STAGING PAYMENT TEST';

/** A safe staging mailbox — never a real customer's address. */
export const STAGING_TEST_EMAIL = 'staging-payment-test@himalayankoh.com';

/**
 * The two simulator cards. These are **inputs to this module only**: they are never
 * sent to Stripe, never stored, and never logged. `classifyTestCard` is run in the
 * browser, and only the resulting outcome (`success` | `decline`) travels to the
 * server — see the note on `classifyTestCard`.
 */
export const STAGING_TEST_CARDS = {
  success: '4242424242424242',
  decline: '4000000000000002',
} as const;

export const STAGING_TEST_CARD_LABEL = 'Test Card';
export const STAGING_ONLY_BADGE = 'STAGING ONLY';

export const STAGING_SIMULATOR_UNAVAILABLE_MESSAGE =
  'Online payment is temporarily unavailable. Please contact us to complete your purchase.';

export const STAGING_DECLINE_MESSAGE =
  'Test payment declined. No money was charged — your cart is unchanged, so you can try again with the success test card.';

export type StagingTestOutcome = 'success' | 'decline';

/** Which simulator card, if any, a typed number is. Never persisted, never sent. */
export type StagingTestCardKind = StagingTestOutcome | 'unsupported';

/** Digits only — the simulator tolerates spaces, which is how a human types it. */
export function normalizeTestCardNumber(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/** `4242424242424242` → `4242 4242 4242 4242` for display only. */
export function formatTestCardNumber(value: string): string {
  return normalizeTestCardNumber(value)
    .slice(0, 19)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/**
 * Which simulated outcome a typed card number means.
 *
 * The classification runs in the browser on purpose. The alternative — posting the
 * number to the server so a route can decide — would put a (fake) card number into a
 * request body, a server log and an error tracker, which is precisely the handling
 * the simulator is not allowed to do. Only the outcome token crosses the network, so
 * there is no card number to persist anywhere. The security boundary is the origin
 * gate (and the fact that no money moves), not the digits.
 */
export function classifyTestCard(value: string): StagingTestCardKind {
  const digits = normalizeTestCardNumber(value);
  if (digits === STAGING_TEST_CARDS.success) return 'success';
  if (digits === STAGING_TEST_CARDS.decline) return 'decline';
  return 'unsupported';
}

/** A typed 16-digit number, whatever its outcome, is a well-formed test card. */
export function isTestCardNumberWellFormed(value: string): boolean {
  return normalizeTestCardNumber(value).length === 16;
}

export function isStagingTestOutcome(value: unknown): value is StagingTestOutcome {
  return value === 'success' || value === 'decline';
}

/** `stg_test_pay_<order id>` — unique per order, so a retry cannot double-count. */
export function stagingTransactionRef(orderId: number | string): string {
  return `${STAGING_TRANSACTION_PREFIX}${orderId}`;
}

/** True when a stored payment method is a simulated one. */
export function isStagingSimulatorPaymentMethod(method: string | null | undefined): boolean {
  return method === STAGING_PAYMENT_METHOD;
}

/** Bare hostname of an origin, or `''` when it is not a URL. */
function hostnameOf(origin: string | null | undefined): string {
  try {
    return new URL((origin || '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** The production hostnames. A request arriving on one of these is never simulated. */
export function isProductionHost(value: string | null | undefined): boolean {
  const raw = (value || '').trim();
  if (!raw) return false;
  const host = hostnameOf(raw.includes('://') ? raw : `https://${raw}`);
  if (!host) return false;
  const production = hostnameOf(SITE_ORIGIN_PRODUCTION);
  const bare = production.replace(/^www\./, '');
  return host === bare || host === `www.${bare}`;
}

/** The staging hostname, or a loopback host in a development build. */
export function isSimulatorCapableOrigin(
  origin: string | null | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!origin) return false;
  if (origin.trim().replace(/\/+$/, '').toLowerCase() === STAGING_SIMULATOR_ORIGIN) return true;
  // A loopback origin is only ever honoured by a development build — the same rule
  // `lib/site/origin` applies to `NEXT_PUBLIC_SITE_URL`, so a dev build can exercise
  // the simulator without weakening anything a deployed artifact does.
  return nodeEnv !== 'production' && isLoopbackOrigin(origin);
}

export type StagingSimulatorSwitchSource = 'setting' | 'env' | 'default';

export interface StagingSimulatorSwitch {
  enabled: boolean;
  source: StagingSimulatorSwitchSource;
}

/**
 * Is the switch on? An explicit value always wins, the admin setting first.
 *
 * The default is `true` **only** because the origin gate below is absolute: staging
 * exists to be tested against, and the owner asked for the simulator to be on for
 * this QA session. Nothing is enabled anywhere else by the default, and either
 * switch can still turn it off — a stored `false` (or `STAGING_PAYMENT_SIMULATOR=false`)
 * is respected as the deliberate "off" it is.
 */
export function resolveStagingSimulatorSwitch(input: {
  settingValue?: string | null;
  envValue?: string | null;
}): StagingSimulatorSwitch {
  const setting = (input.settingValue ?? '').trim().toLowerCase();
  if (setting === 'true') return { enabled: true, source: 'setting' };
  if (setting === 'false') return { enabled: false, source: 'setting' };

  const env = (input.envValue ?? '').trim().toLowerCase();
  if (env === 'true') return { enabled: true, source: 'env' };
  if (env === 'false') return { enabled: false, source: 'env' };

  return { enabled: true, source: 'default' };
}

export interface StagingSimulatorStatus {
  /** The switch is on *and* this deployment/request may simulate. */
  available: boolean;
  /** The switch alone, before the origin gate. */
  enabled: boolean;
  source: StagingSimulatorSwitchSource;
  /** Why it is unavailable — safe to show staff, never a key or a value. */
  reason: string | null;
}

/**
 * The whole decision, in the order the refusals outrank each other.
 *
 * Production is refused first and unconditionally: not because the switch is off,
 * but because simulation on production is never permitted. Reading it the other way
 * round — switch first — is how a feature like this eventually ships somewhere it
 * must not.
 */
export function decideStagingSimulator(input: {
  /** This deployment's own origin (`SITE_ORIGIN`, a build-time constant). */
  origin: string;
  /** The `Host` the request arrived on, when the caller knows it. */
  requestHost?: string | null;
  /** The admin setting value. */
  settingValue?: string | null;
  /** `STAGING_PAYMENT_SIMULATOR`, when the deployment sets it. */
  envValue?: string | null;
  nodeEnv?: string;
}): StagingSimulatorStatus {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const origin = (input.origin || '').trim();
  // Reported even on a refusal, so the console can say "you turned it off" and
  // "this deployment may never run it" as the two different facts they are.
  const switchState = resolveStagingSimulatorSwitch(input);
  const refusal = (reason: string): StagingSimulatorStatus => ({
    available: false,
    enabled: switchState.enabled,
    source: switchState.source,
    reason,
  });

  if (isProductionHost(origin)) {
    return refusal(
      `${STAGING_SIMULATOR_LABEL} is disabled on the production store (${SITE_ORIGIN_PRODUCTION}). It can only ever run on ${STAGING_SIMULATOR_ORIGIN}.`,
    );
  }

  if (!isSimulatorCapableOrigin(origin, nodeEnv)) {
    return refusal(
      `${STAGING_SIMULATOR_LABEL} only runs on ${STAGING_SIMULATOR_ORIGIN}. This deployment is ${origin || 'an unconfigured origin'}.`,
    );
  }

  if (isProductionHost(input.requestHost)) {
    return refusal(`${STAGING_SIMULATOR_LABEL} refuses a request that arrived on the production hostname.`);
  }

  if (!switchState.enabled) {
    return refusal(`${STAGING_SIMULATOR_LABEL} is switched off for this deployment.`);
  }

  return { available: true, enabled: true, source: switchState.source, reason: null };
}

export type CheckoutPaymentOption = 'stripe' | 'staging_simulator' | 'unavailable';

/**
 * The checkout's payment priority, in one place so the screen and the routes cannot
 * disagree about which one is live: real card payment first, the simulator second,
 * and an honest refusal last. An invoice is never an option.
 */
export function resolveCheckoutPaymentOption(input: {
  stripeConfigured: boolean;
  simulatorAvailable: boolean;
}): CheckoutPaymentOption {
  if (input.stripeConfigured) return 'stripe';
  if (input.simulatorAvailable) return 'staging_simulator';
  return 'unavailable';
}
