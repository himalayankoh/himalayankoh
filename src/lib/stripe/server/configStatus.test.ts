import { describe, expect, it } from 'vitest';
import { describeStripeConfigStatus } from './configStatus';

/**
 * `configured` is the field the checkout trusts to decide whether to mount a card
 * form, so every case here is about the one thing it used to get wrong: treating
 * "a publishable key exists and a secret key exists" as "these two can take a
 * payment". Two keys from different Stripe modes cannot confirm each other's
 * PaymentIntents, and the failure lands on the customer after they have typed
 * their card number.
 */

const TEST_SECRET = 'sk_test_example_000000000000';
const TEST_PUBLISHABLE = 'pk_test_example_000000000000';
const LIVE_SECRET = 'sk_live_example_000000000000';
const LIVE_PUBLISHABLE = 'pk_live_example_000000000000';
const WEBHOOK = 'whsec_example_000000000000';

describe('describeStripeConfigStatus', () => {
  it('is configured when both keys are test-mode', () => {
    const status = describeStripeConfigStatus({
      secretKey: TEST_SECRET,
      publishableKey: TEST_PUBLISHABLE,
      webhookSecret: WEBHOOK,
    });

    expect(status.configured).toBe(true);
    expect(status.mode).toBe('test');
    expect(status.modeMismatch).toBe(false);
    expect(status.webhookConfigured).toBe(true);
    expect(status.keyStatus).toEqual({
      publishable: 'test',
      secret: 'test',
      webhook: 'present',
    });
  });

  it('is configured when both keys are live-mode, and reports live', () => {
    const status = describeStripeConfigStatus({
      secretKey: LIVE_SECRET,
      publishableKey: LIVE_PUBLISHABLE,
    });

    expect(status.configured).toBe(true);
    expect(status.mode).toBe('live');
    expect(status.modeMismatch).toBe(false);
  });

  it('refuses a live publishable key paired with a test secret', () => {
    // The staging trap: a `pk_live_` baked into the build from a developer env
    // file, with a real test secret pasted in. Both keys exist; the checkout still
    // cannot confirm, so this must not read as configured.
    const status = describeStripeConfigStatus({
      secretKey: TEST_SECRET,
      publishableKey: LIVE_PUBLISHABLE,
    });

    expect(status.configured).toBe(false);
    expect(status.modeMismatch).toBe(true);
    expect(status.mode).toBe('test');
    expect(status.keyStatus.publishable).toBe('live');
    expect(status.keyStatus.secret).toBe('test');
  });

  it('refuses a test publishable key paired with a live secret', () => {
    const status = describeStripeConfigStatus({
      secretKey: LIVE_SECRET,
      publishableKey: TEST_PUBLISHABLE,
    });

    expect(status.configured).toBe(false);
    expect(status.modeMismatch).toBe(true);
    // The browser would load live, which is the riskier half, so it is named as such.
    expect(status.mode).toBe('live');
  });

  it('is not configured when the secret key is missing, and defaults to test mode', () => {
    const status = describeStripeConfigStatus({
      secretKey: undefined,
      publishableKey: TEST_PUBLISHABLE,
      webhookSecret: WEBHOOK,
    });

    expect(status.configured).toBe(false);
    expect(status.mode).toBe('test');
    expect(status.modeMismatch).toBe(false);
    expect(status.keyStatus.secret).toBe('missing');
    // A webhook on its own is still worth reporting: it is what marks orders paid.
    expect(status.webhookConfigured).toBe(true);
  });

  it('is not configured when the publishable key is missing', () => {
    const status = describeStripeConfigStatus({ secretKey: TEST_SECRET, publishableKey: '' });

    expect(status.configured).toBe(false);
    expect(status.keyStatus.publishable).toBe('missing');
  });

  it('treats unrecognisable keys as unusable rather than as a mode that agrees', () => {
    const status = describeStripeConfigStatus({
      secretKey: 'sk_something_else',
      publishableKey: 'pk_something_else',
    });

    expect(status.configured).toBe(false);
    expect(status.keyStatus.secret).toBe('unknown');
    expect(status.keyStatus.publishable).toBe('unknown');
    // Both are unknown, so they never "agree" and there is no mismatch to report.
    expect(status.modeMismatch).toBe(false);
  });

  it('only counts a plausible signing secret as the webhook being configured', () => {
    expect(describeStripeConfigStatus({ webhookSecret: 'whsec_' }).webhookConfigured).toBe(false);
    expect(describeStripeConfigStatus({ webhookSecret: 'not-a-secret' }).webhookConfigured).toBe(false);
    expect(describeStripeConfigStatus({ webhookSecret: WEBHOOK }).webhookConfigured).toBe(true);
    expect(describeStripeConfigStatus({}).keyStatus.webhook).toBe('missing');
  });

  it('reports key modes without ever echoing a key value', () => {
    const status = describeStripeConfigStatus({
      secretKey: TEST_SECRET,
      publishableKey: LIVE_PUBLISHABLE,
      webhookSecret: WEBHOOK,
    });

    const serialised = JSON.stringify(status);
    expect(serialised).not.toContain(TEST_SECRET);
    expect(serialised).not.toContain(LIVE_PUBLISHABLE);
    expect(serialised).not.toContain(WEBHOOK);
  });
});
