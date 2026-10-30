import type { CreatePaymentIntentPayload } from '../stripe/client';

/** In-memory identity only, never a credential or a client-authoritative price. */
export function checkoutPaymentKey(payload: CreatePaymentIntentPayload): string {
  return JSON.stringify({
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone,
    shippingAddress: payload.shippingAddress,
    billingAddress: payload.billingAddress,
    coupon: payload.couponCode?.trim().toLowerCase() || '',
    shippingMethod: payload.shippingMethod,
    rate: payload.shippoRateId,
    notes: payload.notes,
    items: payload.items.map(({ id, quantity, grainSize }) => ({ id, quantity, grainSize })),
  });
}

export function checkoutPaymentPrompt(input: { email: string; addressReady: boolean; billingReady: boolean; shippingReady: boolean }): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Enter your email address to continue.';
  if (!input.addressReady) return 'Complete your shipping address to continue.';
  if (!input.billingReady) return 'Complete your billing address to continue.';
  if (!input.shippingReady) return 'Choose a shipping option to continue.';
  return 'Continue to enter your card or choose another payment method.';
}
