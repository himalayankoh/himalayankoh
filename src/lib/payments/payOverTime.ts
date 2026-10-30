// ============================================================================
// Pay over time (buy-now-pay-later) on the checkout screen
//
// The payment form is Stripe's Payment Element, which lists whatever Stripe has
// enabled for the account, the order's currency and the shopper's country. That
// means this storefront does not know — and must never guess — whether Klarna,
// Afterpay or Affirm will actually be offered for a given order.
//
// So the checkout names them without promising them, and says which of the three
// situations it is in. Naming a payment method the shopper cannot select is a
// checkout that lies about what it accepts, and the staging checkout is exactly
// that case: it runs a card-only simulator and never contacts Stripe at all.
// ============================================================================

export interface PayOverTimeBrand {
  /** The Stripe payment method type, so the label can never drift from the API. */
  id: 'klarna' | 'afterpay_clearpay' | 'affirm';
  /** Shopper-facing name. Stripe's own admin label is longer ("Afterpay / Clearpay"). */
  label: string;
}

export const PAY_OVER_TIME_BRANDS: readonly PayOverTimeBrand[] = [
  { id: 'klarna', label: 'Klarna' },
  { id: 'afterpay_clearpay', label: 'Afterpay' },
  { id: 'affirm', label: 'Affirm' },
];

export type PayOverTimeState = 'offered' | 'simulator' | 'unavailable';

export interface PayOverTimeStatus {
  state: PayOverTimeState;
  /** True only when the shopper can actually pick one of these on this screen. */
  selectable: boolean;
  /** Short badge next to the brand names. */
  badge: string;
  detail: string;
}

/**
 * Which of the three situations this checkout is in, from the fields the Payment
 * section already has. The two booleans are the same pair the server decided in
 * `/api/stripe/config`; nothing here re-derives that answer.
 */
export function payOverTimeStatus(input: {
  stripeEnabled: boolean;
  simulatorEnabled: boolean;
}): PayOverTimeStatus {
  if (input.stripeEnabled) {
    return {
      state: 'offered',
      selectable: true,
      badge: 'Shown by Stripe',
      detail:
        'Stripe shows these inside the payment form above when they are available for your order, country and currency. Pay-over-time orders confirm once the provider approves them.',
    };
  }
  if (input.simulatorEnabled) {
    return {
      state: 'simulator',
      selectable: false,
      badge: 'Not offered here',
      detail:
        'Not selectable on this staging checkout: it uses a card-only test simulator and never contacts Stripe, so these cannot appear in the test payment form.',
    };
  }
  return {
    state: 'unavailable',
    selectable: false,
    badge: 'Unavailable',
    detail: 'Unavailable while online payment is not configured on this store.',
  };
}
