import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /api/orders/create` under a catalogue-only launch.
 *
 * The point of this suite is the one thing the checkout screen cannot promise: that
 * **no order is written**. The browser refuses to submit when no payment path exists,
 * but a hand-written POST reaches this route directly, and this route is the one that
 * puts a row in the store's order table. So the first test asserts both halves — the
 * 503 the caller sees *and* that the reservation was never reached.
 */

const reserveOrderForCheckout = vi.fn();
const clearReservedCart = vi.fn();
const dispatchOrderCreatedNotifications = vi.fn();

vi.mock('@/lib/orders/serverCreateOrder', () => ({
  reserveOrderForCheckout: (...args: unknown[]) => reserveOrderForCheckout(...args),
  clearReservedCart: (...args: unknown[]) => clearReservedCart(...args),
}));
vi.mock('@/lib/orders/notifyOrderEvents', () => ({
  dispatchOrderCreatedNotifications: (...args: unknown[]) => dispatchOrderCreatedNotifications(...args),
}));
vi.mock('@/lib/cart/cookies', () => ({
  readCartSession: async () => ({ cartToken: 'cart_token_test' }),
}));
vi.mock('@/lib/auth/customerRequest', () => ({
  optionalCustomerRequest: async () => null,
}));
vi.mock('@/lib/errors', () => ({
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { ORDERS_PAUSED_ENV_KEY, ORDERS_PAUSED_MESSAGE } from '@/lib/storefront/ordering';
import { POST } from './route';

/** A body that passes the invoice path's own validation, so only the switch can stop it. */
const INVOICE_BODY = {
  email: 'shopper@example.com',
  shippingAddress: { name: 'A Shopper', addressLine1: '1 Salt Way', city: 'Houston', state: 'TX', postalCode: '77002', country: 'US' },
  paymentProvider: 'invoice',
  paymentMethod: 'invoice',
  paymentStatus: 'pending',
};

function post(body: unknown) {
  return new Request('https://himalayankoh.com/api/orders/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  reserveOrderForCheckout.mockReset();
  clearReservedCart.mockReset();
  dispatchOrderCreatedNotifications.mockReset();
  reserveOrderForCheckout.mockResolvedValue({
    reused: true,
    order: { id: 4321 },
    cartToken: 'cart_token_test',
  });
});

afterEach(() => {
  delete process.env[ORDERS_PAUSED_ENV_KEY];
});

describe('POST /api/orders/create while ordering is paused', () => {
  it('refuses before anything is written, and says how to order instead', async () => {
    process.env[ORDERS_PAUSED_ENV_KEY] = 'true';

    const response = await POST(post(INVOICE_BODY) as never);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe(ORDERS_PAUSED_MESSAGE);
    // The assertion that matters: no store call, so no order and no cart write.
    expect(reserveOrderForCheckout).not.toHaveBeenCalled();
    expect(clearReservedCart).not.toHaveBeenCalled();
    expect(dispatchOrderCreatedNotifications).not.toHaveBeenCalled();
  });

  it('refuses a malformed body with the pause, not with a validation error', async () => {
    // Which refusal comes first is itself the evidence: a validation answer here would
    // mean the pause is checked after the body, and this route's own history is a good
    // reason to ask. Nothing is written either way.
    process.env[ORDERS_PAUSED_ENV_KEY] = 'true';

    const response = await POST(post({}) as never);

    expect(response.status).toBe(503);
    expect(((await response.json()) as { error?: string }).error).toBe(ORDERS_PAUSED_MESSAGE);
    expect(reserveOrderForCheckout).not.toHaveBeenCalled();
  });
});

describe('POST /api/orders/create with ordering enabled', () => {
  it('still writes an invoice order, so the switch is the only thing paused', async () => {
    process.env[ORDERS_PAUSED_ENV_KEY] = 'false';

    const response = await POST(post(INVOICE_BODY) as never);

    expect(response.status).toBe(200);
    expect(reserveOrderForCheckout).toHaveBeenCalledTimes(1);
  });

  it('still refuses a card order with the card checkout\u2019s own answer', async () => {
    // Unchanged behaviour: a `stripe` order is reserved by the card checkout against
    // the payment that pays it, never here.
    process.env[ORDERS_PAUSED_ENV_KEY] = 'false';

    const response = await POST(post({ ...INVOICE_BODY, paymentProvider: 'stripe' }) as never);

    expect(response.status).toBe(402);
    expect(reserveOrderForCheckout).not.toHaveBeenCalled();
  });
});
