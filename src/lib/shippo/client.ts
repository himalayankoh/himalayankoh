import type { CheckoutShippingAddress, RatesLineItem, ShippoRate } from './types';

export interface AddressValidationResponse {
  configured: boolean;
  isValid: boolean;
  messages: string[];
  normalizedAddress: CheckoutShippingAddress;
  recommendedAddress?: CheckoutShippingAddress;
  source: 'shippo' | 'basic';
}

export async function validateShippingAddressClient(params: {
  address: CheckoutShippingAddress;
  email?: string;
}): Promise<AddressValidationResponse> {
  const response = await fetch('/api/shippo/validate-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: params.address,
      email: params.email,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Unable to validate shipping address.');
  }

  return body as AddressValidationResponse;
}

export async function fetchShippoRates(params: {
  address: CheckoutShippingAddress;
  email?: string;
  items: RatesLineItem[];
}): Promise<{ configured: boolean; rates: ShippoRate[] }> {
  const response = await fetch('/api/shippo/rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: params.address,
      email: params.email,
      items: params.items,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 422 && body.unsupportedProducts) {
      throw new Error(body.error || 'We cannot price delivery for one or more items in this cart.');
    }
    // The shop's own words, not the route's. `/api/shippo/rates` answers with an
    // operator-facing diagnosis — a key that is missing, or one this environment
    // refuses to spend — and that text was rendered straight onto the checkout page,
    // in front of a customer. A request that failed is not a statement about the
    // address either, so this does not blame it.
    throw new Error('Delivery could not be priced right now. Please try again.');
  }

  return {
    configured: Boolean(body.configured),
    rates: Array.isArray(body.rates) ? body.rates : [],
  };
}

export async function createShippoLabel(orderId: string, accessToken: string) {
  const response = await fetch('/api/shippo/create-label', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ orderId }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Unable to create Shippo label.');
  }
  return body as {
    ok: boolean;
    trackingNumber?: string;
    trackingNumbers?: string[];
    labelUrl?: string;
    labelUrls?: string[];
    carrier?: string;
    serviceName?: string;
    rateAmount?: number | null;
    parcelCount?: number;
    alreadyCreated?: boolean;
    usedFallbackCarrier?: boolean;
  };
}
