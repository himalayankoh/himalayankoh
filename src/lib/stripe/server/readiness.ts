/**
 * Is this deployment allowed to take money, and what is still missing?
 *
 * Card charging used to be gated by one line — a live secret key plus
 * `STRIPE_ALLOW_LIVE=true` — which answered "is a live key allowed here?" but not
 * "is this deployment actually able to take a live payment?" A live key, a live
 * publishable key, a live webhook secret, a reachable webhook endpoint, the
 * explicit switch and passing health checks are six separate things, and a
 * deployment that has five of them still must not charge: it would take the money
 * and never mark the order paid.
 *
 * So the decision lives here, as a pure function over its inputs, and it fails
 * closed in three ways that matter:
 *
 *   1. **Unknown is not true.** A webhook-endpoint probe or health check that has
 *      not run yet is `null`, and `null` blocks live charging rather than being
 *      optimistically treated as passing.
 *   2. **The origin is part of the answer.** Live charging is only ever permitted
 *      on the production origin (`SITE_ORIGIN_PRODUCTION`). A loopback, a preview
 *      Worker hostname or any other host is refused even with
 *      `STRIPE_ALLOW_LIVE=true` set — so a live secret key pasted into staging
 *      cannot take a real payment there, whatever else is configured.
 *   3. **A mode mismatch is a block, not a warning.** A `pk_live_` with an
 *      `sk_test_` produces a card form that cannot confirm on the intent that was
 *      created, which is a broken checkout rather than a config smell.
 *
 * Test mode is deliberately not gated on the webhook: an owner must be able to
 * create an intent and confirm a test card *before* they have a webhook endpoint
 * to point Stripe at. What is reported instead is that orders will not be marked
 * paid until the webhook is configured — the two facts stay separate so the
 * status can be honest about each.
 */

import { SITE_ORIGIN, SITE_ORIGIN_PRODUCTION } from '@/lib/site/origin';

export type StripeKeyMode = 'test' | 'live' | 'missing' | 'unknown';

/** What this deployment may do: nothing, take test payments, or take real money. */
export type StripeStage = 'off' | 'test' | 'live';

export interface StripeReadinessInput {
  secretKey?: string | null;
  publishableKey?: string | null;
  webhookSecret?: string | null;
  /** `STRIPE_ALLOW_LIVE === 'true'` — an explicit, deliberate operator decision. */
  allowLive?: boolean;
  /** This deployment's own origin. Defaults to the resolved site origin. */
  origin?: string;
  /**
   * Did the deployed webhook endpoint answer a signed probe correctly?
   * `null`/undefined means "not established", which blocks live charging.
   */
  webhookEndpointOk?: boolean | null;
  /** Did the payment + webhook health checks pass? `null` blocks live charging. */
  healthOk?: boolean | null;
}

export interface StripeCheck {
  id: string;
  label: string;
  state: 'ok' | 'blocked' | 'unknown' | 'not-applicable';
  detail: string;
}

export interface StripeReadiness {
  stage: StripeStage;
  /** True only when the six live conditions are all met on the production origin. */
  readyForLive: boolean;
  /** May a PaymentIntent be created at all on this deployment? */
  chargingEnabled: boolean;
  /** Will a paid order be marked paid? Needs the webhook signing secret. */
  orderSyncConfigured: boolean;
  secretMode: StripeKeyMode;
  publishableMode: StripeKeyMode;
  /** Human-readable reasons live charging is not possible, in the order to fix them. */
  blockers: string[];
  checks: StripeCheck[];
}

export function classifyStripeKey(
  value: string | null | undefined,
  kind: 'secret' | 'publishable',
): StripeKeyMode {
  const key = (value || '').trim();
  if (!key) return 'missing';
  const testPrefix = kind === 'secret' ? 'sk_test_' : 'pk_test_';
  const livePrefix = kind === 'secret' ? 'sk_live_' : 'pk_live_';
  if (key.startsWith(testPrefix)) return 'test';
  if (key.startsWith(livePrefix)) return 'live';
  return 'unknown';
}

/** Stripe webhook signing secrets carry no mode, so only presence is knowable. */
export function hasWebhookSecret(value: string | null | undefined): boolean {
  const secret = (value || '').trim();
  return secret.startsWith('whsec_') && secret.length > 12;
}

function isProductionOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(SITE_ORIGIN_PRODUCTION).origin;
  } catch {
    return false;
  }
}

export function evaluateStripeReadiness(input: StripeReadinessInput = {}): StripeReadiness {
  const origin = input.origin || SITE_ORIGIN;
  const secretMode = classifyStripeKey(input.secretKey, 'secret');
  const publishableMode = classifyStripeKey(input.publishableKey, 'publishable');
  const webhookConfigured = hasWebhookSecret(input.webhookSecret);
  const allowLive = input.allowLive === true;
  const onProductionOrigin = isProductionOrigin(origin);

  const checks: StripeCheck[] = [];
  /** Ordered by how decisively each one stops a payment, not by discovery order. */
  const blocked: Array<{ severity: number; detail: string }> = [];

  // `state` only decides how the check reads on screen. Every block, including an
  // "unknown" one, must also land in `blocked` — that list is what refuses
  // charging, and leaving the unknown ones out of it is exactly how a gate fails
  // open (an unprobed endpoint counted as passing).
  //
  // Severity exists so the first line an owner reads names the thing that actually
  // stops the payment. A live key on the wrong origin is "you cannot charge from
  // here", not "your orders will not sync" — reporting the webhook first read as
  // though the payment itself would go through.
  const block = (
    id: string,
    label: string,
    detail: string,
    state: StripeCheck['state'] = 'blocked',
    severity = 40,
  ) => {
    checks.push({ id, label, state, detail });
    blocked.push({ severity, detail });
  };
  const blockers = () => blocked.slice().sort((a, b) => a.severity - b.severity).map((b) => b.detail);
  const ok = (id: string, label: string, detail: string) => {
    checks.push({ id, label, state: 'ok', detail });
  };

  /* --- 1. A key exists at all ------------------------------------------- */
  if (secretMode === 'missing') {
    block('secret_key', 'Secret key', 'No Stripe secret key is configured.', 'blocked', 20);
    // A check that did not run is not a second reason to fix something, so it is
    // reported on screen without joining the blocker list.
    checks.push({
      id: 'publishable_key',
      label: 'Publishable key',
      state: 'not-applicable',
      detail: 'Not checked, because there is no secret key to pair it with.',
    });
    return {
      stage: 'off',
      readyForLive: false,
      chargingEnabled: false,
      orderSyncConfigured: false,
      secretMode,
      publishableMode,
      blockers: blockers(),
      checks,
    };
  }

  if (secretMode === 'unknown') {
    block('secret_key', 'Secret key', 'The secret key matches neither sk_test_ nor sk_live_, so its mode cannot be trusted.', 'blocked', 20);
  } else {
    ok('secret_key', 'Secret key', secretMode === 'live' ? 'A live (sk_live_) secret key is stored.' : 'A test (sk_test_) secret key is stored.');
  }

  /* --- 2. Publishable key, and the two must agree on a mode -------------- */
  if (publishableMode === 'missing') {
    block('publishable_key', 'Publishable key', 'No publishable key is configured, so the card form cannot load.', 'blocked', 20);
  } else if (publishableMode === 'unknown') {
    block('publishable_key', 'Publishable key', 'The publishable key matches neither pk_test_ nor pk_live_.', 'blocked', 20);
  } else if (secretMode !== 'unknown' && publishableMode !== secretMode) {
    block(
      'mode_match',
      'Key modes agree',
      `The secret key is ${secretMode} but the publishable key is ${publishableMode}. Both must come from the same Stripe mode.`,
      'blocked',
      20,
    );
  } else {
    ok('publishable_key', 'Publishable key', `A ${publishableMode} (pk_${publishableMode}_) publishable key is stored.`);
  }

  /* --- 3. Webhook signing secret ---------------------------------------- */
  if (webhookConfigured) {
    ok('webhook_secret', 'Webhook signing secret', 'A whsec_ signing secret is stored, so deliveries can be verified.');
  } else {
    block(
      'webhook_secret',
      'Webhook signing secret',
      'No webhook signing secret is stored, so a successful payment cannot be marked as a paid order.',
      'blocked',
      50,
    );
  }

  /* --- 4. Charging permission for this mode and this origin -------------- */
  const isLiveSecret = secretMode === 'live';
  const modesAgree = publishableMode !== 'missing' && publishableMode !== 'unknown' && publishableMode === secretMode;

  if (!isLiveSecret) {
    ok('origin', 'Deployment origin', `${origin} — test keys are permitted on any origin.`);
  } else if (!onProductionOrigin) {
    block(
      'origin',
      'Deployment origin',
      `This deployment is ${origin}, not the production origin (${SITE_ORIGIN_PRODUCTION}). A live key cannot charge from here.`,
      'blocked',
      10,
    );
  } else {
    ok('origin', 'Deployment origin', `${origin} is the production origin.`);
  }

  /* --- 5/6. The live-only conditions ------------------------------------ */
  const liveOnly: Array<{ id: string; label: string; good: boolean; detail: string }> = [
    {
      id: 'allow_live',
      label: 'Live charging switch',
      good: allowLive,
      detail: allowLive
        ? 'STRIPE_ALLOW_LIVE=true is set on this deployment.'
        : 'STRIPE_ALLOW_LIVE is not set, so live charging is switched off.',
    },
    {
      id: 'webhook_endpoint',
      label: 'Webhook endpoint responds',
      good: input.webhookEndpointOk === true,
      detail:
        input.webhookEndpointOk === true
          ? 'The webhook endpoint accepted a correctly signed probe.'
          : input.webhookEndpointOk === false
            ? 'The webhook endpoint rejected a correctly signed probe.'
            : 'The webhook endpoint has not been probed, so it cannot be trusted to receive live payments.',
    },
    {
      id: 'health',
      label: 'Payment and webhook health',
      good: input.healthOk === true,
      detail:
        input.healthOk === true
          ? 'The payment and webhook health checks passed.'
          : input.healthOk === false
            ? 'The payment or webhook health check failed.'
            : 'The health checks have not run, so live readiness is unproven.',
    },
  ];

  if (isLiveSecret) {
    const severityOf: Record<string, number> = { allow_live: 30, webhook_endpoint: 60, health: 70 };
    for (const item of liveOnly) {
      if (item.good) ok(item.id, item.label, item.detail);
      else
        block(
          item.id,
          item.label,
          item.detail,
          item.id === 'health' || item.id === 'webhook_endpoint' ? 'unknown' : 'blocked',
          severityOf[item.id] ?? 40,
        );
    }
  } else {
    const detail =
      'Applies to live charging only; this deployment holds a test key, so no real money can move.';
    for (const item of liveOnly) checks.push({ id: item.id, label: item.label, state: 'not-applicable', detail });
  }

  const orderedBlockers = blockers();
  const chargingEnabled = modesAgree && (!isLiveSecret || orderedBlockers.length === 0);
  const readyForLive = isLiveSecret && orderedBlockers.length === 0;
  const stage: StripeStage = !chargingEnabled ? 'off' : isLiveSecret ? 'live' : 'test';

  return {
    stage,
    readyForLive,
    chargingEnabled,
    orderSyncConfigured: webhookConfigured,
    secretMode,
    publishableMode,
    blockers: orderedBlockers,
    checks,
  };
}

/** The one-line reason card charging is refused, for a route to return. */
export function stripeRefusalMessage(readiness: StripeReadiness): string {
  if (readiness.chargingEnabled) return '';
  if (readiness.blockers.length === 0) {
    return 'Stripe card payments are not available on this deployment.';
  }
  return `${readiness.blockers[0]} Card payments are refused until this is resolved.`;
}
