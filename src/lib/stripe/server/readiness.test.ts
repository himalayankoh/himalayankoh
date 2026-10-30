import { describe, expect, it } from 'vitest';
import { SITE_ORIGIN_PRODUCTION, SITE_ORIGIN_STAGING } from '@/lib/site/origin';
import { classifyStripeKey, evaluateStripeReadiness, hasWebhookSecret, stripeRefusalMessage } from './readiness';

/**
 * The live-charging gate, at its refusal edges.
 *
 * Every case here is a deployment that "looks configured" and must still be
 * refused, because the failure it prevents is a real payment taken by a
 * deployment that then fails to mark the order paid — or a staging deployment
 * quietly charging a customer's card.
 */

const TEST_SECRET = 'sk_test_example_000000000000';
const TEST_PUBLISHABLE = 'pk_test_example_000000000000';
const LIVE_SECRET = 'sk_live_example_000000000000';
const LIVE_PUBLISHABLE = 'pk_live_example_000000000000';
const WEBHOOK = 'whsec_example_000000000000';

/** Everything a live deployment could have, on the production origin. */
const liveAndComplete = {
  secretKey: LIVE_SECRET,
  publishableKey: LIVE_PUBLISHABLE,
  webhookSecret: WEBHOOK,
  allowLive: true,
  origin: SITE_ORIGIN_PRODUCTION,
  webhookEndpointOk: true,
  healthOk: true,
};

describe('classifyStripeKey', () => {
  it('reads the mode from the prefix, and treats anything else as untrustworthy', () => {
    expect(classifyStripeKey(TEST_SECRET, 'secret')).toBe('test');
    expect(classifyStripeKey(LIVE_SECRET, 'secret')).toBe('live');
    expect(classifyStripeKey(TEST_PUBLISHABLE, 'publishable')).toBe('test');
    expect(classifyStripeKey(LIVE_PUBLISHABLE, 'publishable')).toBe('live');
    expect(classifyStripeKey('', 'secret')).toBe('missing');
    expect(classifyStripeKey('  ', 'secret')).toBe('missing');
    // A publishable key pasted into the secret field must not read as live.
    expect(classifyStripeKey(LIVE_PUBLISHABLE, 'secret')).toBe('unknown');
  });
});

describe('hasWebhookSecret', () => {
  it('requires the whsec_ prefix and a plausible length', () => {
    expect(hasWebhookSecret(WEBHOOK)).toBe(true);
    expect(hasWebhookSecret('whsec_short')).toBe(false);
    expect(hasWebhookSecret('')).toBe(false);
    expect(hasWebhookSecret(null)).toBe(false);
  });
});

describe('evaluateStripeReadiness — nothing configured', () => {
  it('is off, charges nothing, and says which key is missing', () => {
    const r = evaluateStripeReadiness({});
    expect(r.stage).toBe('off');
    expect(r.chargingEnabled).toBe(false);
    expect(r.orderSyncConfigured).toBe(false);
    expect(r.secretMode).toBe('missing');
    expect(r.blockers.join(' ')).toMatch(/No Stripe secret key/);
    // Exactly one actionable blocker: a check that never ran is not a second item
    // for the owner to go and fix.
    expect(r.blockers).toHaveLength(1);
    expect(stripeRefusalMessage(r)).toMatch(/Card payments are refused/);
  });
});

describe('evaluateStripeReadiness — test mode', () => {
  it('permits charging on the staging origin without the live conditions', () => {
    const r = evaluateStripeReadiness({
      secretKey: TEST_SECRET,
      publishableKey: TEST_PUBLISHABLE,
      webhookSecret: WEBHOOK,
      origin: SITE_ORIGIN_STAGING,
    });
    expect(r.stage).toBe('test');
    expect(r.chargingEnabled).toBe(true);
    expect(r.orderSyncConfigured).toBe(true);
    expect(r.readyForLive).toBe(false);
    expect(r.blockers).toEqual([]);
    // The live-only conditions are reported as not applicable, not as failures.
    const liveOnly = r.checks.filter((c) => ['allow_live', 'webhook_endpoint', 'health'].includes(c.id));
    expect(liveOnly.every((c) => c.state === 'not-applicable')).toBe(true);
  });

  it('still reports the missing webhook, and still allows a card test before it exists', () => {
    const r = evaluateStripeReadiness({
      secretKey: TEST_SECRET,
      publishableKey: TEST_PUBLISHABLE,
      origin: SITE_ORIGIN_STAGING,
    });
    expect(r.chargingEnabled).toBe(true);
    expect(r.orderSyncConfigured).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/cannot be marked as a paid order/);
  });

  it('refuses when the two keys disagree about the mode', () => {
    const r = evaluateStripeReadiness({
      secretKey: TEST_SECRET,
      publishableKey: LIVE_PUBLISHABLE,
      webhookSecret: WEBHOOK,
    });
    expect(r.chargingEnabled).toBe(false);
    expect(r.stage).toBe('off');
    expect(r.blockers.join(' ')).toMatch(/same Stripe mode/);
  });
});

describe('evaluateStripeReadiness — live mode must fail closed', () => {
  it('is ready only when all six conditions hold on the production origin', () => {
    const r = evaluateStripeReadiness(liveAndComplete);
    expect(r.stage).toBe('live');
    expect(r.chargingEnabled).toBe(true);
    expect(r.readyForLive).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('refuses a live key on staging even with the switch on, the endpoint answering and health passing', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, origin: SITE_ORIGIN_STAGING });
    expect(r.chargingEnabled).toBe(false);
    expect(r.readyForLive).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/not the production origin/);
  });

  it('refuses a live key on loopback', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, origin: 'http://localhost:3000' });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/not the production origin/);
  });

  it('refuses without the explicit live switch', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, allowLive: false });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/STRIPE_ALLOW_LIVE is not set/);
  });

  it('refuses without a webhook signing secret', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, webhookSecret: '' });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/webhook signing secret/);
  });

  it('refuses without a live publishable key', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, publishableKey: '' });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/publishable key/);
  });

  it('treats an unprobed webhook endpoint as blocking, never as passing', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, webhookEndpointOk: null });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/cannot be trusted to receive live payments/);
  });

  it('treats an endpoint that rejected a signed probe as blocking', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, webhookEndpointOk: false });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/rejected a correctly signed probe/);
  });

  it('treats unrun health checks as blocking', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, healthOk: null });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/health checks have not run/);
  });

  it('treats a failed health check as blocking', () => {
    const r = evaluateStripeReadiness({ ...liveAndComplete, healthOk: false });
    expect(r.chargingEnabled).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/health check failed/);
  });
});
