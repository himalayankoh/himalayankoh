const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function address(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const required = ['fullName', 'addressLine1', 'city', 'state', 'postalCode', 'country'];
  const result = Object.fromEntries(required.map((key) => [key, nonEmpty(row[key])])) as Record<string, string | null>;
  if (Object.values(result).some((entry) => !entry)) return null;
  return { ...result, addressLine2: nonEmpty(row.addressLine2) || undefined } as {
    fullName: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export function validateCreatePaymentIntentBody(body: unknown) {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const email = nonEmpty(record.email) || '';
  const shippingAddress = address(record.shippingAddress);
  const billingAddress = record.billingAddress ? address(record.billingAddress) : shippingAddress;
  const userId = nonEmpty(record.userId);
  const couponCode = nonEmpty(record.couponCode) || '';
  const shippingMethod = record.shippingMethod === 'expedited' ? 'expedited' as const : 'standard' as const;
  const shippoRateId = nonEmpty(record.shippoRateId) || undefined;
  const notes = nonEmpty(record.notes) || undefined;

  if (!EMAIL_RE.test(email)) {
    return { ok: false as const, status: 400, error: 'A valid email is required.' };
  }
  if (!shippingAddress) {
    return { ok: false as const, status: 400, error: 'A complete shipping address is required.' };
  }
  if (!billingAddress) {
    return { ok: false as const, status: 400, error: 'A complete billing address is required.' };
  }
  // No cart-identifier check here any more. The cart is identified by the request's
  // own cookie, which this validator cannot see and must not ask the browser to
  // assert — an empty cart is answered by the route, as "Cart is empty".

  return {
    ok: true as const,
    data: {
      email,
      phone: nonEmpty(record.phone) || undefined,
      shippingAddress,
      billingAddress,
      userId,
      couponCode,
      shippingMethod,
      shippoRateId,
      shippingCarrier: nonEmpty(record.shippingCarrier) || undefined,
      shippingService: nonEmpty(record.shippingService) || undefined,
      notes,
    },
  };
}

export function validateVerifyPaymentBody(body: unknown) {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const paymentIntentId = nonEmpty(record.paymentIntentId) || '';
  if (!paymentIntentId) {
    return { ok: false as const, status: 400, error: 'paymentIntentId is required.' };
  }
  return { ok: true as const, data: { paymentIntentId } };
}
