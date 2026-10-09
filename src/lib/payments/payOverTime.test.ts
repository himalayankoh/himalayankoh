import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAY_OVER_TIME_BRANDS, payOverTimeStatus } from './payOverTime';

const checkoutSource = readFileSync(
  fileURLToPath(new URL('../../views/CheckoutPage.tsx', import.meta.url)),
  'utf8',
);

/**
 * The strip's wiring cannot be seen by a test of the render tree: the checkout
 * needs a cart and a Stripe config to reach the Payment section at all, and the
 * Stripe config comes from the server. So the two things that would make the
 * strip lie are asserted against the source instead — that it is fed the
 * server's answer rather than a local guess, and that it is not shown on a
 * checkout whose payment method is an invoice.
 */
describe('checkout payment section wiring', () => {
  it('keeps the informational strip in non-retail Stripe checkout with server-decided booleans', () => {
    expect(checkoutSource).toContain("{!retailOnly && paymentMethod === 'stripe' && (");
    expect(checkoutSource).toContain('stripeEnabled={stripeEnabled}');
    expect(checkoutSource).toContain('simulatorEnabled={stagingSimulatorEnabled}');
  });
});

describe('pay-over-time brands', () => {
  it('lists the three Stripe method types the checkout names', () => {
    expect(PAY_OVER_TIME_BRANDS.map((brand) => brand.id)).toEqual([
      'klarna',
      'afterpay_clearpay',
      'affirm',
    ]);
    expect(PAY_OVER_TIME_BRANDS.map((brand) => brand.label)).toEqual(['Klarna', 'Afterpay', 'Affirm']);
  });
});

describe('payOverTimeStatus', () => {
  it('claims only that Stripe shows them when Stripe owns the form', () => {
    const status = payOverTimeStatus({ stripeEnabled: true, simulatorEnabled: false });
    expect(status.state).toBe('offered');
    expect(status.selectable).toBe(true);
    expect(status.detail).toContain('Stripe shows these');
  });

  it('says plainly that the staging simulator cannot offer them', () => {
    const status = payOverTimeStatus({ stripeEnabled: false, simulatorEnabled: true });
    expect(status.state).toBe('simulator');
    expect(status.selectable).toBe(false);
    expect(status.detail).toContain('card-only test simulator');
  });

  it('reports unavailable — and never selectable — when online payment is off', () => {
    const status = payOverTimeStatus({ stripeEnabled: false, simulatorEnabled: false });
    expect(status.state).toBe('unavailable');
    expect(status.selectable).toBe(false);
  });

  it('never marks them selectable while Stripe is not the one charging', () => {
    for (const simulatorEnabled of [true, false]) {
      expect(payOverTimeStatus({ stripeEnabled: false, simulatorEnabled }).selectable).toBe(false);
    }
  });
});
