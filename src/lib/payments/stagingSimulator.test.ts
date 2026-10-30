import { describe, expect, it } from 'vitest';
import {
  STAGING_DECLINE_MESSAGE,
  STAGING_ORDER_NOTE,
  STAGING_PAYMENT_METHOD,
  STAGING_PAYMENT_METHOD_TITLE,
  STAGING_SIMULATOR_ENV_KEY,
  STAGING_SIMULATOR_ORIGIN,
  STAGING_TEST_CARDS,
  STAGING_TRANSACTION_PREFIX,
  classifyTestCard,
  decideStagingSimulator,
  formatTestCardNumber,
  isProductionHost,
  isSimulatorCapableOrigin,
  isStagingSimulatorPaymentMethod,
  isTestCardNumberWellFormed,
  normalizeTestCardNumber,
  resolveCheckoutPaymentOption,
  resolveStagingSimulatorSwitch,
  stagingTransactionRef,
} from './stagingSimulator';

/**
 * The simulator's gate, pinned without a deployment.
 *
 * Everything asserted here is a safety property: staging may simulate, production
 * may not — *even with the switch on* — and a request that arrives on a production
 * hostname is refused from the staging deployment too. These are the claims that
 * make the feature shippable, so they are pinned in unit tests rather than only
 * exercised by hand on a live origin.
 */

const STAGING = 'https://preview.himalayankoh.com';
const PRODUCTION = 'https://himalayankoh.com';

describe('staging payment simulator — the origin gate', () => {
  it('is available on the staging origin', () => {
    const status = decideStagingSimulator({ origin: STAGING, nodeEnv: 'production' });

    expect(status.available).toBe(true);
    expect(status.reason).toBeNull();
  });

  it('tolerates a trailing slash and mixed case in the configured origin', () => {
    expect(decideStagingSimulator({ origin: 'https://preview.himalayankoh.com/', nodeEnv: 'production' }).available).toBe(true);
    expect(decideStagingSimulator({ origin: 'HTTPS://PREVIEW.HIMALAYANKOH.COM', nodeEnv: 'production' }).available).toBe(true);
  });

  it('refuses the production origin even with the switch explicitly ON', () => {
    const status = decideStagingSimulator({
      origin: PRODUCTION,
      settingValue: 'true',
      envValue: 'true',
      nodeEnv: 'production',
    });

    // The switch is reported as on — it is on — and the answer is still no. Reading
    // the switch first is exactly how a feature like this ends up shipping live.
    expect(status.enabled).toBe(true);
    expect(status.available).toBe(false);
    expect(status.reason).toContain('production');
  });

  it('refuses www.himalayankoh.com as well as the bare production host', () => {
    expect(decideStagingSimulator({ origin: 'https://www.himalayankoh.com', nodeEnv: 'production' }).available).toBe(false);
  });

  it('refuses any other origin, however the switch is set', () => {
    const status = decideStagingSimulator({
      origin: 'https://example.com',
      settingValue: 'true',
      nodeEnv: 'production',
    });

    expect(status.available).toBe(false);
    expect(status.reason).toContain(STAGING_SIMULATOR_ORIGIN);
  });

  it('refuses a request that arrived on the production hostname', () => {
    const status = decideStagingSimulator({
      origin: STAGING,
      requestHost: 'himalayankoh.com',
      nodeEnv: 'production',
    });

    expect(status.available).toBe(false);
    expect(status.reason).toContain('production hostname');
  });

  it('accepts a request that arrived on the staging hostname', () => {
    expect(
      decideStagingSimulator({
        origin: STAGING,
        requestHost: 'preview.himalayankoh.com',
        nodeEnv: 'production',
      }).available,
    ).toBe(true);
  });

  it('allows a loopback origin in a development build only', () => {
    expect(isSimulatorCapableOrigin('http://localhost:3000', 'development')).toBe(true);
    expect(isSimulatorCapableOrigin('http://localhost:3000', 'test')).toBe(true);
    // A production build refuses loopback, the same rule `lib/site/origin` applies.
    expect(isSimulatorCapableOrigin('http://localhost:3000', 'production')).toBe(false);
    expect(decideStagingSimulator({ origin: 'http://localhost:3000', nodeEnv: 'production' }).available).toBe(false);
  });

  it('recognises production hostnames in either form', () => {
    expect(isProductionHost('himalayankoh.com')).toBe(true);
    expect(isProductionHost('https://www.himalayankoh.com/checkout')).toBe(true);
    expect(isProductionHost('preview.himalayankoh.com')).toBe(false);
    expect(isProductionHost('')).toBe(false);
    expect(isProductionHost(null)).toBe(false);
  });
});

describe('staging payment simulator — the switch', () => {
  it('is on by default, so the staging QA session works without a settings write', () => {
    expect(resolveStagingSimulatorSwitch({})).toEqual({ enabled: true, source: 'default' });
  });

  it('honours an explicit OFF in the admin setting', () => {
    expect(resolveStagingSimulatorSwitch({ settingValue: 'false', envValue: 'true' })).toEqual({
      enabled: false,
      source: 'setting',
    });
  });

  it('honours an explicit OFF in the deployment variable', () => {
    expect(resolveStagingSimulatorSwitch({ envValue: 'false' })).toEqual({ enabled: false, source: 'env' });
  });

  it('lets the admin setting override the deployment variable', () => {
    expect(resolveStagingSimulatorSwitch({ settingValue: 'true', envValue: 'false' })).toEqual({
      enabled: true,
      source: 'setting',
    });
  });

  it('is not fooled by other values for the switch', () => {
    // 'off', 'no' and '0' are not values this store writes, so they are treated as
    // unset rather than guessed at — the safe reading of an unrecognised switch is
    // the documented default, and the origin gate still stands behind it.
    expect(resolveStagingSimulatorSwitch({ settingValue: 'off' }).source).toBe('default');
  });

  it('reports the switch as off on staging when it is switched off, without leaking a value', () => {
    const status = decideStagingSimulator({ origin: STAGING, settingValue: 'false', nodeEnv: 'production' });

    expect(status.available).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.source).toBe('setting');
    expect(status.reason).toContain('switched off');
  });

  it('exposes the environment key it reads', () => {
    expect(STAGING_SIMULATOR_ENV_KEY).toBe('STAGING_PAYMENT_SIMULATOR');
  });
});

describe('staging payment simulator — the test cards', () => {
  it('classifies the success card', () => {
    expect(classifyTestCard(STAGING_TEST_CARDS.success)).toBe('success');
    expect(classifyTestCard('4242 4242 4242 4242')).toBe('success');
  });

  it('classifies the decline card', () => {
    expect(classifyTestCard(STAGING_TEST_CARDS.decline)).toBe('decline');
    expect(classifyTestCard('4000 0000 0000 0002')).toBe('decline');
  });

  it('classifies anything else as unsupported rather than guessing', () => {
    expect(classifyTestCard('4111 1111 1111 1111')).toBe('unsupported');
    expect(classifyTestCard('')).toBe('unsupported');
    expect(classifyTestCard('4242')).toBe('unsupported');
  });

  it('recognises a well-formed test card number without trusting its outcome', () => {
    expect(isTestCardNumberWellFormed('4242 4242 4242 4242')).toBe(true);
    expect(isTestCardNumberWellFormed('4111 1111 1111 1111')).toBe(true);
    expect(isTestCardNumberWellFormed('4000')).toBe(false);
  });

  it('normalises and formats without ever producing storage-shaped output', () => {
    expect(normalizeTestCardNumber('4242-4242 4242_4242')).toBe('4242424242424242');
    expect(formatTestCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    // Display only: the formatter caps the field at a card's maximum length rather
    // than accumulating whatever is typed into it.
    expect(formatTestCardNumber('424242424242424242424242')).toBe('4242 4242 4242 4242 424');
  });
});

describe('staging payment simulator — how a simulated order is recorded', () => {
  it('labels the payment method honestly, and never as Stripe', () => {
    expect(STAGING_PAYMENT_METHOD).toBe('staging_test_card');
    expect(STAGING_PAYMENT_METHOD_TITLE).toBe('Staging Test Card');
    expect(STAGING_PAYMENT_METHOD.startsWith('stripe_')).toBe(false);
    expect(isStagingSimulatorPaymentMethod(STAGING_PAYMENT_METHOD)).toBe(true);
    expect(isStagingSimulatorPaymentMethod('stripe_card')).toBe(false);
    expect(isStagingSimulatorPaymentMethod('invoice')).toBe(false);
  });

  it('uses a transaction reference that is unique per order and cannot be mistaken for a PaymentIntent', () => {
    expect(stagingTransactionRef(512)).toBe('stg_test_pay_512');
    expect(stagingTransactionRef(512).startsWith(STAGING_TRANSACTION_PREFIX)).toBe(true);
    expect(stagingTransactionRef(512)).not.toBe(stagingTransactionRef(513));
    // A retry on the same order yields the same reference, so a double submission
    // records one transaction rather than two.
    expect(stagingTransactionRef(512)).toBe(stagingTransactionRef('512'));
  });

  it('carries a do-not-fulfil tag and a decline message that promises no charge', () => {
    expect(STAGING_ORDER_NOTE).toContain('DO NOT FULFILL');
    expect(STAGING_DECLINE_MESSAGE).toContain('declined');
    expect(STAGING_DECLINE_MESSAGE.toLowerCase()).toContain('no money');
  });
});

describe('staging payment simulator — the checkout priority', () => {
  it('prefers a real card payment whenever Stripe may charge', () => {
    expect(resolveCheckoutPaymentOption({ stripeConfigured: true, simulatorAvailable: true })).toBe('stripe');
  });

  it('falls back to the simulator when Stripe cannot charge', () => {
    expect(resolveCheckoutPaymentOption({ stripeConfigured: false, simulatorAvailable: true })).toBe('staging_simulator');
  });

  it('says so honestly when neither is available — never an invoice', () => {
    const option = resolveCheckoutPaymentOption({ stripeConfigured: false, simulatorAvailable: false });
    expect(option).toBe('unavailable');
    expect(['stripe', 'staging_simulator', 'unavailable']).toContain(option);
  });
});
