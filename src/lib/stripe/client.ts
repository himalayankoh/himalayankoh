import type { CartItem } from '../../store/cartStore';
import { getCustomerAccessToken } from '../auth/customerClient';
import { readApiError, toPaymentError } from './errors';
import type { StripePaymentIntentResult, StripeVerifyPaymentResult } from './types';

export { stripePublishableKey, isStripeConfigured, isStripeTestMode } from './config';

export interface CreatePaymentIntentPayload {
  email: string;
  phone?: string;
  shippingAddress: {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: CreatePaymentIntentPayload['shippingAddress'];
  couponCode?: string;
  shippingMethod?: 'standard' | 'expedited';
  shippoRateId?: string;
  shippingCarrier?: string;
  shippingService?: string;
  notes?: string;
  userId?: string;
  /** Display only — the server prices the order from the cart, not from here. */
  items: Pick<CartItem, 'id' | 'name' | 'quantity' | 'price' | 'grainSize'>[];
}

export async function createStripePaymentIntent(
  payload: CreatePaymentIntentPayload
): Promise<StripePaymentIntentResult> {
  // The signed-in customer's own session, when there is one: it is what ties the
  // payment to the account. A guest checkout sends no credential and is a
  // supported path, so a missing token is not an error here.
  const token = getCustomerAccessToken();
  const response = await fetch('/api/stripe/create-payment-intent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      email: payload.email,
      phone: payload.phone,
      shippingAddress: payload.shippingAddress,
      billingAddress: payload.billingAddress,
      couponCode: payload.couponCode,
      shippingMethod: payload.shippingMethod,
      shippoRateId: payload.shippoRateId,
      shippingCarrier: payload.shippingCarrier,
      shippingService: payload.shippingService,
      notes: payload.notes,
      userId: payload.userId,
      items: payload.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        grainSize: item.grainSize,
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to prepare card payment.'));
  }

  return response.json() as Promise<StripePaymentIntentResult>;
}

export async function verifyStripeOrderPayment(payload: {
  paymentIntentId: string;
}): Promise<StripeVerifyPaymentResult> {
  const response = await fetch('/api/stripe/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to confirm payment with the server.'));
  }

  return response.json() as Promise<StripeVerifyPaymentResult>;
}

export { toPaymentError };
